/**
 * smartBotService.js
 * Orquestador del bot inteligente.
 * Combina:
 *  - AniList API para metadatos
 *  - JKAnime scraper para episodios
 *  - PostgreSQL para persistencia
 */
import pool from '../db.js';
import { searchAniListMetadata } from './anilistService.js';
import { findJkAnimeSlug, scrapeAnimeEpisodes } from './jkanimeScraper.js';
import { findAnimeAv1Slug, scrapeAnimeAv1Episodes, getAnimeAv1PageData, scrapeAiringAnimesAv1 } from './animeav1Scraper.js';
import { downloadAndUploadEpisode } from './videoDownloaderService.js';
import pLimit from 'p-limit';

// Estado en memoria del bot (jobs activos)
const botJobs = new Map(); // jobId → { status, progress, errors, result }

let nextJobId = 1;

function createJob(type, animeId) {
  const jobId = `bot-${Date.now()}-${nextJobId++}`;
  const job = {
    id: jobId,
    type,
    animeId,
    status: 'running', // running | done | error
    progress: { current: 0, total: 0, message: 'Iniciando...' },
    errors: [],
    result: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  botJobs.set(jobId, job);
  return job;
}

/** Limpia jobs viejos (más de 2 horas) */
function cleanOldJobs() {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of botJobs.entries()) {
    if (new Date(job.startedAt).getTime() < twoHoursAgo) {
      botJobs.delete(id);
    }
  }
}

/**
 * Autocompleta los metadatos de un anime usando AniList.
 * Solo actualiza campos vacíos para no sobrescribir trabajo manual.
 * @param {number} animeId - ID del anime en la BD
 * @returns {Promise<object>} Resultado de la operación
 */
export async function autoFillMetadata(animeId) {
  const job = createJob('metadata', animeId);

  // Ejecutar en background
  runMetadataJob(job, animeId).catch(err => {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  });

  return { jobId: job.id, status: 'started' };
}

/**
 * Revisa todos los animes del catálogo en emisión y busca nuevos episodios.
 */
export async function updateOngoingAnimes() {
  const jobId = `bot-${Date.now()}-update`;
  const job = {
    id: jobId,
    type: 'update_ongoing',
    animeId: null,
    status: 'running',
    progress: { current: 0, total: 0, message: 'Buscando animes en emisión en BD...' },
    errors: [],
    result: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  botJobs.set(jobId, job);

  runUpdateOngoingJob(job).catch(err => {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  });

  return { jobId, status: 'started' };
}

async function runUpdateOngoingJob(job) {
  try {
    const res = await pool.query(`SELECT id, title, title_english FROM anime_content WHERE status IN ('Releasing', 'Ongoing')`);
    const animes = res.rows;
    if (animes.length === 0) {
      job.status = 'done';
      job.progress.message = 'No hay animes en emisión en el catálogo.';
      job.finishedAt = new Date().toISOString();
      return;
    }

    job.progress.total = animes.length;
    let processed = 0;
    
    for (const anime of animes) {
      processed++;
      job.progress.current = processed;
      job.progress.message = `Buscando episodios de ${anime.title} (${processed}/${animes.length})...`;

      try {
        const scrapeJob = createJob('scrape', anime.id);
        // source 'auto' buscará en JKAnime y luego AnimeAV1
        await runScrapeJob(scrapeJob, anime.id, { source: 'auto', fromEpisode: 1, toEpisode: null, season: 1 });
      } catch (err) {
        job.errors.push(`Error en ${anime.title}: ${err.message}`);
      }
    }

    job.status = 'done';
    job.progress.message = `Actualización terminada. Se revisaron ${animes.length} animes.`;
    job.result = { total: animes.length };
    job.finishedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  }
}

/**
 * Escanea animes en emisión, los crea si no existen y extrae sus episodios.
 */
export async function syncAiringAnimes() {
  const jobId = `bot-${Date.now()}-sync`;
  const job = {
    id: jobId,
    type: 'sync',
    animeId: null,
    status: 'running',
    progress: { current: 0, total: 0, message: 'Obteniendo animes en emisión...' },
    errors: [],
    result: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  botJobs.set(jobId, job);

  runSyncAiringJob(job).catch(err => {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  });

  return { jobId, status: 'started' };
}

async function runSyncAiringJob(job) {
  try {
    // Usar animeav1.com como fuente principal de animes en emisión
    const slugs = await scrapeAiringAnimesAv1(3);
    if (!slugs || slugs.length === 0) {
      throw new Error('No se encontraron animes en emisión.');
    }

    job.progress.total = slugs.length;
    let processed = 0;
    let newAnimes = 0;
    let updatedAnimes = 0;

    for (const slug of slugs) {
      processed++;
      job.progress.current = processed;
      job.progress.message = `Procesando ${slug} (${processed}/${slugs.length})...`;

      try {
        // Crear título aproximado: "black-clover" -> "black clover"
        const titleQuery = slug.replace(/-/g, ' ');
        
        // 1. Buscar si ya existe por titulo o algo similar (búsqueda burda por ILIKE)
        let animeId = null;
        const existCheck = await pool.query(
          `SELECT id FROM anime_content WHERE title ILIKE $1 OR title_english ILIKE $1 LIMIT 1`,
          [`%${titleQuery}%`]
        );
        
        if (existCheck.rows.length > 0) {
          animeId = existCheck.rows[0].id;
          updatedAnimes++;
        } else {
          // 2. Si no existe, crearlo
          const insertResult = await pool.query(
            `INSERT INTO anime_content (title, status, is_active) VALUES ($1, 'Releasing', true) RETURNING id`,
            [titleQuery]
          );
          animeId = insertResult.rows[0].id;
          newAnimes++;
          
          // 3. Ejecutar metadatos (esperar a que termine para tener los campos listos)
          job.progress.message = `Autocompletando metadatos de ${slug}...`;
          const metaJob = createJob('metadata', animeId);
          await runMetadataJob(metaJob, animeId);
        }

        // 4. Scrapear episodios
        job.progress.message = `Scrapeando episodios de ${slug}...`;
        const scrapeJob = createJob('scrape', animeId);
        // Sobrescribimos el onProgress local para no ensuciar el job de sync, pero sí correrlo
        await runScrapeJob(scrapeJob, animeId, { jkSlug: slug, fromEpisode: 1, toEpisode: null, season: 1, source: 'auto' });

      } catch (err) {
        console.error(`[SmartBot] Error sincronizando ${slug}:`, err.message);
        job.errors.push(`Error en ${slug}: ${err.message}`);
      }
    }

    job.status = 'done';
    job.progress.message = `¡Sincronización terminada!`;
    job.result = { total: slugs.length, newAnimes, updatedAnimes };
    job.finishedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  }
}

async function runMetadataJob(job, animeId) {
  try {
    job.progress.message = 'Buscando anime en BD...';

    // Obtener datos actuales del anime
    const animeResult = await pool.query(
      'SELECT id, title, title_english, poster_url, description, genres, rating, total_episodes, release_date, status FROM anime_content WHERE id = $1',
      [animeId]
    );

    if (!animeResult.rows.length) {
      throw new Error(`Anime ID ${animeId} no encontrado en la BD`);
    }

    const anime = animeResult.rows[0];
    job.progress.message = `Buscando "${anime.title}" en AniList...`;

    // Buscar en AniList
    const metadata = await searchAniListMetadata(anime.title_english || anime.title);

    if (!metadata) {
      throw new Error(`No se encontró "${anime.title}" en AniList`);
    }

    // Construir UPDATE solo con campos vacíos
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const fieldMap = {
      description: metadata.description,
      poster_url: metadata.poster_url,
      banner_url: metadata.banner_url,
      title_english: metadata.title_english,
      title_japanese: metadata.title_japanese,
      release_date: metadata.release_date,
    };

    // Actualizar título siempre si AniList nos devuelve uno mejor (distinto al de búsqueda)
    if (metadata.title && anime.title !== metadata.title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(metadata.title);
    }

    for (const [field, newValue] of Object.entries(fieldMap)) {
      if (newValue && (!anime[field] || anime[field] === '')) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(newValue);
      }
    }

    // Géneros: actualizar si está vacío
    if (metadata.genres?.length && (!anime.genres || anime.genres.length === 0)) {
      updates.push(`genres = $${paramIndex++}`);
      values.push(metadata.genres);
    }

    // Rating: actualizar si es 0 o null
    if (metadata.rating && (!anime.rating || anime.rating === 0)) {
      updates.push(`rating = $${paramIndex++}`);
      values.push(metadata.rating);
    }

    // Total episodios: actualizar si es 0 o null
    if (metadata.total_episodes && (!anime.total_episodes || anime.total_episodes === 0)) {
      updates.push(`total_episodes = $${paramIndex++}`);
      values.push(metadata.total_episodes);
    }

    // Status: actualizar si es Unknown
    if (metadata.status && (!anime.status || anime.status === 'Unknown')) {
      updates.push(`status = $${paramIndex++}`);
      values.push(metadata.status);
    }

    if (updates.length === 0) {
      job.status = 'done';
      job.result = { message: 'El anime ya tiene todos los metadatos completos', updated: 0 };
      job.finishedAt = new Date().toISOString();
      return;
    }

    values.push(animeId);
    await pool.query(
      `UPDATE anime_content SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );

    job.status = 'done';
    job.result = {
      message: `Metadatos actualizados exitosamente`,
      updated: updates.length,
      fields: updates.map(u => u.split(' = ')[0]),
      anilist_data: metadata,
    };
    job.finishedAt = new Date().toISOString();
    console.log(`[SmartBot] Metadatos actualizados para anime ${animeId}: ${updates.length} campos`);
  } catch (error) {
    job.status = 'error';
    job.errors.push(error.message);
    job.finishedAt = new Date().toISOString();
    console.error(`[SmartBot] Error en job de metadatos:`, error.message);
  }
}

/**
 * Scrape episodios de JKAnime para un anime.
 * Guarda la URL del iframe como video_url en anime_episodes.
 * @param {number} animeId - ID del anime en la BD
 * @param {object} options
 * @param {string} options.jkSlug - Slug de JKAnime (si ya se conoce)
 * @param {number} options.fromEpisode - Episodio desde el que empezar
 * @param {number} options.toEpisode - Episodio hasta el que llegar
 * @param {number} options.season - Temporada a la que asignar los episodios (default: 1)
 * @param {string} options.source - Fuente de episodios: 'jkanime' | 'animeav1' | 'auto' (default: 'auto')
 */
export async function scrapeEpisodes(animeId, options = {}) {
  const job = createJob('scrape', animeId);

  runScrapeJob(job, animeId, options).catch(err => {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  });

  return { jobId: job.id, status: 'started' };
}

async function runScrapeJob(job, animeId, options) {
  try {
    const { jkSlug = null, av1Slug = null, fromEpisode = 1, toEpisode = null, season = 1, source = 'auto' } = options;

    // Obtener datos del anime
    const animeResult = await pool.query('SELECT id, title, title_english, total_episodes FROM anime_content WHERE id = $1', [animeId]);
    if (!animeResult.rows.length) throw new Error(`Anime ${animeId} no encontrado`);

    const anime = animeResult.rows[0];
    const searchTitle = anime.title_english || anime.title;
    const maxEp = toEpisode || anime.total_episodes || 1000;

    let episodes = [];
    let usedSource = null;

    // --- Intentar JKAnime ---
    if (source === 'jkanime' || source === 'auto') {
      job.progress.message = `Buscando "${anime.title}" en JKAnime...`;
      let slug = jkSlug;
      if (!slug) slug = await findJkAnimeSlug(searchTitle);

      if (slug) {
        job.progress.message = `Scrapeando episodios del slug JK "${slug}"...`;
        episodes = await scrapeAnimeEpisodes(slug, {
          fromEpisode,
          toEpisode: maxEp,
          onProgress: (current, total) => {
            job.progress.current = current;
            job.progress.total = total;
            job.progress.message = `[JKAnime] Episodio ${current}/${total}...`;
          },
        });
        if (episodes.length > 0) usedSource = 'jkanime';
      }

      if (source === 'jkanime' && episodes.length === 0) {
        const reason = jkSlug ? `no se encontraron episodios para el slug "${jkSlug}"` : `no se encontró slug para "${anime.title}"`;        
        throw new Error(`JKAnime: ${reason}`);
      }
    }

    // --- Fallback / forzar AnimeAV1 ---
    if ((source === 'animeav1' || (source === 'auto' && episodes.length === 0))) {
      job.progress.message = `Buscando "${anime.title}" en AnimeAV1...`;
      let slug = av1Slug;
      if (!slug) slug = await findAnimeAv1Slug(searchTitle);

      if (!slug && source === 'animeav1') {
        throw new Error(`AnimeAV1: no se encontró slug para "${anime.title}". Pasa el slug manualmente con av1Slug.`);
      }

      if (slug) {
        job.progress.message = `Scrapeando episodios del slug AV1 "${slug}"...`;
        episodes = await scrapeAnimeAv1Episodes(slug, {
          fromEpisode,
          toEpisode: maxEp,
          onProgress: (current, total) => {
            job.progress.current = current;
            job.progress.total = total;
            job.progress.message = `[AnimeAV1] Episodio ${current}/${total}...`;
          },
        });
        if (episodes.length > 0) usedSource = 'animeav1';
      }
    }

    if (episodes.length === 0) {
      throw new Error(`No se encontraron episodios para "${anime.title}" en ninguna fuente.`);
    }

    job.progress.message = `Guardando ${episodes.length} episodios en la BD...`;

    // Guardar episodios en la BD primero
    let inserted = 0;
    let updated = 0;
    const episodesToDownload = [];

    job.progress.message = `Insertando ${episodes.length} episodios a la BD...`;

    for (const ep of episodes) {
      const existing = await pool.query(
        'SELECT id, video_url FROM anime_episodes WHERE anime_id = $1 AND episode_number = $2 AND season = $3',
        [animeId, ep.episode_number, season]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (!row.video_url || row.video_url.includes('jkanime')) {
          await pool.query(
            `UPDATE anime_episodes SET video_url = $1, status = 'processing', updated_at = NOW() WHERE id = $2`,
            [ep.video_url, row.id]
          );
          updated++;
          if (ep.video_url && !ep.video_url.includes('jkplayer')) {
            episodesToDownload.push({ epId: row.id, videoUrl: ep.video_url, epNumber: ep.episode_number });
          }
        }
      } else {
        const insertResult = await pool.query(
          `INSERT INTO anime_episodes (anime_id, season, episode_number, title, video_url, status, is_active, storage_type)
           VALUES ($1, $2, $3, $4, $5, 'processing', true, 'external') RETURNING id`,
          [animeId, season, ep.episode_number, `Episodio ${ep.episode_number}`, ep.video_url]
        );
        const newEpId = insertResult.rows[0].id;
        inserted++;
        if (ep.video_url && !ep.video_url.includes('jkplayer')) {
          episodesToDownload.push({ epId: newEpId, videoUrl: ep.video_url, epNumber: ep.episode_number });
        }
      }
    }

    job.progress.message = `Iniciando descarga concurrente de ${episodesToDownload.length} episodios...`;

    // Procesamiento en lote concurrente (máximo 3 a la vez)
    const limitFn = pLimit(3);
    const downloadPromises = episodesToDownload.map((item) => limitFn(async () => {
      try {
        job.progress.message = `Descargando Ep ${item.epNumber} a R2...`;
        const r2Url = await downloadAndUploadEpisode(item.epId, item.videoUrl, anime.title_english || anime.title, item.epNumber);
        
        await pool.query(
          `UPDATE anime_episodes SET video_url = $1, status = 'ready', storage_type = $2, updated_at = NOW() WHERE id = $3`,
          [r2Url, r2Url.includes('r2') ? 'r2' : 'external', item.epId]
        );
      } catch (err) {
        console.error(`[SmartBot] Error descargando ep ${item.epNumber}:`, err.message);
        await pool.query(`UPDATE anime_episodes SET status = 'error', updated_at = NOW() WHERE id = $1`, [item.epId]);
      }
    }));

    await Promise.all(downloadPromises);

    job.status = 'done';
    job.result = {
      source: usedSource,
      totalFound: episodes.length,
      inserted,
      updated,
      skipped: episodes.length - inserted - updated,
    };
    job.finishedAt = new Date().toISOString();
    console.log(`[SmartBot] Scrape completado para ${anime.title} (${usedSource}): ${inserted} insertados, ${updated} actualizados`);
  } catch (error) {
    job.status = 'error';
    job.errors.push(error.message);
    job.finishedAt = new Date().toISOString();
    console.error(`[SmartBot] Error en scrape:`, error.message);
  }
}

/**
 * Obtiene el estado de un job.
 */
export function getBotJobStatus(jobId) {
  return botJobs.get(jobId) || null;
}

/**
 * Lista todos los jobs recientes.
 */
export function listBotJobs() {
  cleanOldJobs();
  return Array.from(botJobs.values()).sort(
    (a, b) => new Date(b.startedAt) - new Date(a.startedAt)
  );
}
