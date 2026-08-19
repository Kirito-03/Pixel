/**
 * smartBotService.js
 * Orquestador del bot inteligente.
 * Combina:
 *  - AniList API para metadatos
 *  - JKAnime scraper para episodios
 *  - PostgreSQL para persistencia
 */
import pool from '../db.js';
import { searchAniListMetadata, searchAniListByMalId } from './anilistService.js';
import { findJkAnimeSlug, scrapeAnimeEpisodes } from './jkanimeScraper.js';
import { findAnimeAv1Slug, scrapeAnimeAv1Episodes, getAnimeAv1PageData, scrapeAiringAnimesAv1 } from './animeav1Scraper.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const MEMORY_FILE = '/tmp/bot_memory.json';

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

/**
 * Explora el catálogo completo y añade los animes que no existan.
 */
export async function syncAllCatalog(startPage = 1, endPage = 10) {
  const jobId = `sync-all-${Date.now()}`;
  const job = {
    type: 'sync-all',
    status: 'running',
    progress: { current: 0, total: 0, message: `Obteniendo catálogo completo (Páginas ${startPage}-${endPage})...` },
    errors: [],
    result: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  botJobs.set(jobId, job);

  runSyncAllCatalogJob(job, startPage, endPage).catch(err => {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  });

  return { jobId, status: 'started' };
}

async function runSyncAllCatalogJob(job, startPage, endPage) {
  try {
    const { scrapeFullCatalogAv1 } = await import('./animeav1Scraper.js');
    const slugs = await scrapeFullCatalogAv1(startPage, endPage);
    
    if (!slugs || slugs.length === 0) {
      throw new Error('No se encontraron animes en el catálogo.');
    }

    job.progress.total = slugs.length;
    let processed = 0;
    let newAnimes = 0;
    let skipped = 0;

    for (const slug of slugs) {
      processed++;
      job.progress.current = processed;
      job.progress.message = `Procesando catálogo: ${slug} (${processed}/${slugs.length})...`;

      try {
        let titleQuery = slug.replace(/-/g, ' ');
        let fallbackPoster = null;
        let fallbackBanner = null;
        let extractedMalId = null;

        // Intentar obtener datos precisos desde AnimeAV1 antes de crear
        let pageData = null;
        try {
          pageData = await getAnimeAv1PageData(slug);
          if (pageData) {
            titleQuery = pageData.title || titleQuery;
            extractedMalId = pageData.malId;
            fallbackPoster = pageData.poster || pageData.backdrop;
            fallbackBanner = pageData.backdrop;
          }
        } catch (e) {
          console.error(`[SmartBot] Error fetch AV1 page data para ${slug}:`, e.message);
        }

        // --- FILTRO DE FALSOS ANIMES ---
        if (!pageData) {
          console.log(`[SmartBot] Ignorando "${slug}": no es un anime válido (probablemente un género listado por error en AnimeAV1).`);
          continue;
        }

        // --- PREVENCIÓN DE DUPLICADOS ---
        // Obtener títulos oficiales de AniList para buscar en BD de forma robusta
        let titlesToCheck = [titleQuery];
        if (extractedMalId) {
          try {
            const aniListMeta = await searchAniListByMalId(extractedMalId);
            if (aniListMeta) {
              if (aniListMeta.title) titlesToCheck.push(aniListMeta.title);
              if (aniListMeta.title_english) titlesToCheck.push(aniListMeta.title_english);
            }
          } catch(e) {}
        }
        
        titlesToCheck = [...new Set(titlesToCheck.filter(Boolean))];
        let animeId = null;

        // Buscar si ya existe por cualquiera de las variaciones del título
        for (const t of titlesToCheck) {
          const existCheck = await pool.query(
            `SELECT id FROM anime_content WHERE title ILIKE $1 OR title_english ILIKE $1 LIMIT 1`,
            [`%${t}%`]
          );
          if (existCheck.rows.length > 0) {
            animeId = existCheck.rows[0].id;
            break;
          }
        }
        
        if (animeId) {
          skipped++;
          continue; // Ya existe, lo saltamos para no sobrecargar
        }

        // Si no existe, crearlo
        const insertResult = await pool.query(
          `INSERT INTO anime_content (title, poster_url, banner_url, status, is_active) VALUES ($1, $2, $3, 'Finished', true) RETURNING id`,
          [titleQuery, fallbackPoster, fallbackBanner]
        );
        animeId = insertResult.rows[0].id;
        newAnimes++;
        
        // Ejecutar metadatos
        job.progress.message = `[NUEVO] Autocompletando metadatos de ${slug}...`;
        const metaJob = createJob('metadata', animeId);
        await runMetadataJob(metaJob, animeId, extractedMalId);

        // Scrapear episodios
        job.progress.message = `[NUEVO] Scrapeando episodios de ${slug}...`;
        const scrapeJob = createJob('scrape', animeId);
        await runScrapeJob(scrapeJob, animeId, { av1Slug: slug, fromEpisode: 1, toEpisode: null, season: 1, source: 'animeav1' });

      } catch (err) {
        console.error(`[SmartBot] Error sincronizando catálogo ${slug}:`, err.message);
        job.errors.push(`Error en ${slug}: ${err.message}`);
      }
    }

    job.status = 'done';
    job.progress.message = `¡Crawl de catálogo terminado!`;
    job.result = { total: slugs.length, newAnimes, skipped };
    job.finishedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'error';
    job.errors.push(err.message);
    job.finishedAt = new Date().toISOString();
  }
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
        let titleQuery = slug.replace(/-/g, ' ');
        let fallbackPoster = null;
        let fallbackBanner = null;
        let extractedMalId = null;

        // Intentar obtener datos precisos desde AnimeAV1 antes de crear
        let pageData = null;
        try {
          pageData = await getAnimeAv1PageData(slug);
          if (pageData) {
            titleQuery = pageData.title || titleQuery;
            extractedMalId = pageData.malId;
            fallbackPoster = pageData.poster || pageData.backdrop;
            fallbackBanner = pageData.backdrop;
          }
        } catch (e) {
          console.error(`[SmartBot] Error fetch AV1 page data para ${slug}:`, e.message);
        }

        // --- FILTRO DE FALSOS ANIMES ---
        // Si no se obtuvo pageData (dio 404), es un género o una película inválida en el catálogo
        if (!pageData) {
          console.log(`[SmartBot] Ignorando "${slug}": no es un anime válido (probablemente un género listado por error en AnimeAV1).`);
          continue;
        }

        // --- PREVENCIÓN DE DUPLICADOS ---
        let titlesToCheck = [titleQuery];
        if (extractedMalId) {
          try {
            const aniListMeta = await searchAniListByMalId(extractedMalId);
            if (aniListMeta) {
              if (aniListMeta.title) titlesToCheck.push(aniListMeta.title);
              if (aniListMeta.title_english) titlesToCheck.push(aniListMeta.title_english);
            }
          } catch(e) {}
        }
        
        titlesToCheck = [...new Set(titlesToCheck.filter(Boolean))];
        let animeId = null;

        for (const t of titlesToCheck) {
          const existCheck = await pool.query(
            `SELECT id FROM anime_content WHERE title ILIKE $1 OR title_english ILIKE $1 LIMIT 1`,
            [`%${t}%`]
          );
          if (existCheck.rows.length > 0) {
            animeId = existCheck.rows[0].id;
            break;
          }
        }
        
        if (animeId) {
          updatedAnimes++;
        } else {
          // 2. Si no existe, crearlo con datos fallback si existen
          const insertResult = await pool.query(
            `INSERT INTO anime_content (title, poster_url, banner_url, status, is_active) VALUES ($1, $2, $3, 'Releasing', true) RETURNING id`,
            [titleQuery, fallbackPoster, fallbackBanner]
          );
          animeId = insertResult.rows[0].id;
          newAnimes++;
          
          // 3. Ejecutar metadatos (esperar a que termine para tener los campos listos)
          job.progress.message = `Autocompletando metadatos de ${slug}...`;
          const metaJob = createJob('metadata', animeId);
          await runMetadataJob(metaJob, animeId, extractedMalId);
        }

        // 4. Scrapear episodios
        job.progress.message = `Scrapeando episodios de ${slug}...`;
        const scrapeJob = createJob('scrape', animeId);
        // Sobrescribimos el onProgress local para no ensuciar el job de sync, pero sí correrlo
        await runScrapeJob(scrapeJob, animeId, { av1Slug: slug, fromEpisode: 1, toEpisode: null, season: 1, source: 'animeav1' });

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

async function runMetadataJob(job, animeId, forceMalId = null) {
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
    let metadata = null;

    // Buscar en AniList usando el ID exacto (100% de precisión)
    if (forceMalId) {
      job.progress.message = `Buscando MAL ID ${forceMalId} en AniList...`;
      metadata = await searchAniListByMalId(forceMalId);
    }

    // Fallback a buscar por título
    if (!metadata) {
      job.progress.message = `Buscando "${anime.title}" en AniList...`;
      metadata = await searchAniListMetadata(anime.title_english || anime.title);
    }

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

    let startEp = fromEpisode;

    // Si empezamos desde el episodio 1, verificar si podemos hacer un scraping incremental
    if (fromEpisode === 1) {
      const highestEpResult = await pool.query(
        'SELECT MAX(episode_number) as max_ep FROM anime_episodes WHERE anime_id = $1 AND season = $2',
        [animeId, season]
      );
      if (highestEpResult.rows[0].max_ep !== null) {
        startEp = highestEpResult.rows[0].max_ep + 1;
        job.progress.message = `Scraping incremental: saltando hasta el ep ${startEp}...`;
        console.log(`[SmartBot] Scraping incremental para anime ${animeId}: empezando desde ep ${startEp}`);
      }
    }

    let episodes = [];
    let usedSource = null;

    // --- Intentar AnimeAV1 ---
    if (source === 'animeav1' || source === 'auto') {
      job.progress.message = `Buscando "${anime.title}" en AnimeAV1...`;
      let slug = av1Slug;
      if (!slug) slug = await findAnimeAv1Slug(searchTitle);

      if (slug) {
        job.progress.message = `Scrapeando episodios del slug AV1 "${slug}" (desde ep ${startEp})...`;
        episodes = await scrapeAnimeAv1Episodes(slug, {
          fromEpisode: startEp,
          toEpisode: maxEp,
          onProgress: (current, total) => {
            job.progress.current = current;
            job.progress.total = total;
            job.progress.message = `[AnimeAV1] Episodio ${current}/${total}...`;
          },
        });
        if (episodes.length > 0) usedSource = 'animeav1';
      }

      if (source === 'animeav1' && episodes.length === 0) {
        const reason = av1Slug ? `no se encontraron episodios para el slug "${av1Slug}"` : `no se encontró slug para "${anime.title}"`;        
        throw new Error(`AnimeAV1: ${reason}`);
      }
    }

    // --- Fallback / forzar JKAnime ---
    if ((source === 'jkanime' || (source === 'auto' && episodes.length === 0))) {
      job.progress.message = `Buscando "${anime.title}" en JKAnime...`;
      let slug = jkSlug;
      if (!slug) slug = await findJkAnimeSlug(searchTitle);

      if (!slug && source === 'jkanime') {
        throw new Error(`JKAnime: no se encontró slug para "${anime.title}". Pasa el slug manualmente con jkSlug.`);
      }

      if (slug) {
        job.progress.message = `Scrapeando episodios del slug JK "${slug}" (desde ep ${startEp})...`;
        episodes = await scrapeAnimeEpisodes(slug, {
          fromEpisode: startEp,
          toEpisode: maxEp,
          onProgress: (current, total) => {
            job.progress.current = current;
            job.progress.total = total;
            job.progress.message = `[JKAnime] Episodio ${current}/${total}...`;
          },
        });
        if (episodes.length > 0) usedSource = 'jkanime';
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

    job.progress.message = `Insertando ${episodes.length} episodios a la BD (modo scraping)...`;

    for (const ep of episodes) {
      const externalServersJson = JSON.stringify(ep.all_servers || []);
      
      const existing = await pool.query(
        'SELECT id FROM anime_episodes WHERE anime_id = $1 AND episode_number = $2 AND season = $3',
        [animeId, ep.episode_number, season]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        await pool.query(
          `UPDATE anime_episodes 
           SET video_url = $1, stream_url = $1, external_servers = $2, status = 'ready', storage_type = 'external', updated_at = NOW() 
           WHERE id = $3`,
          [ep.video_url, externalServersJson, row.id]
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO anime_episodes (anime_id, season, episode_number, title, video_url, stream_url, external_servers, status, is_active, storage_type)
           VALUES ($1, $2, $3, $4, $5, $5, $6, 'ready', true, 'external')`,
          [animeId, season, ep.episode_number, `Episodio ${ep.episode_number}`, ep.video_url, externalServersJson]
        );
        inserted++;
      }
    }

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

export async function syncNextCatalogPage() {
  console.log('[Cron] Ejecutando scraper incremental de catálogo...');
  
  let currentPage = 1;
  const MAX_PAGE = 120; // Ajustar si el catálogo crece más
  
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      if (data && data.lastCatalogPage) {
        currentPage = data.lastCatalogPage;
      }
    }
  } catch (e) {
    console.warn('[SmartBot] No se pudo leer bot_memory.json, empezando desde la página 1');
  }

  console.log(`[SmartBot] Scrapeando catálogo incremental: Página ${currentPage}`);
  
  // Creamos un job en memoria falso para reutilizar runSyncAllCatalogJob
  const fakeJob = {
    id: `cron-catalog-${Date.now()}`,
    progress: {},
    errors: []
  };

  try {
    // Usamos runSyncAllCatalogJob pero solo para 1 página
    await runSyncAllCatalogJob(fakeJob, currentPage, currentPage);
    console.log(`[SmartBot] Página ${currentPage} escaneada exitosamente.`);
    
    // Avanzar de página
    currentPage++;
    if (currentPage > MAX_PAGE) {
      currentPage = 1;
      console.log(`[SmartBot] Se llegó a la última página del catálogo, reiniciando a la página 1.`);
    }

    // Guardar memoria
    fs.writeFileSync(MEMORY_FILE, JSON.stringify({ lastCatalogPage: currentPage }));
  } catch (err) {
    console.error(`[SmartBot] Error en scraper incremental de catálogo (página ${currentPage}):`, err.message);
  }
}
