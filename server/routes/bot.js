/**
 * bot.js - Router del Bot Inteligente
 * Todos los endpoints requieren autenticación de admin.
 */
import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import pool from '../db.js';
import {
  getBotJobStatus,
  listBotJobs,
  autoFillMetadata,
  scrapeEpisodes,
  syncAiringAnimes,
  syncAllCatalog,
} from '../services/smartBotService.js';
import { findJkAnimeSlug } from '../services/jkanimeScraper.js';
import { searchAniListMetadata } from '../services/anilistService.js';
import { findAnimeAv1Slug, getAnimeAv1PageData } from '../services/animeav1Scraper.js';

const router = express.Router();
router.use(authenticateAdmin);

/**
 * GET /api/admin/bot/status
 * Lista todos los jobs del bot recientes.
 */
router.get('/status', (req, res) => {
  const jobs = listBotJobs();
  res.json({ ok: true, jobs });
});

/**
 * GET /api/admin/bot/job/:jobId
 * Estado de un job específico.
 */
router.get('/job/:jobId', (req, res) => {
  const job = getBotJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, message: 'Job no encontrado' });
  res.json({ ok: true, job });
});

/**
 * POST /api/admin/bot/metadata/:animeId
 * Autocompleta metadatos de un anime con AniList.
 * Devuelve jobId para consultar el estado.
 */
router.post('/metadata/:animeId', async (req, res) => {
  const animeId = parseInt(req.params.animeId);
  if (!animeId) return res.status(400).json({ ok: false, message: 'animeId inválido' });

  try {
    const { jobId, status } = await autoFillMetadata(animeId);
    res.json({ ok: true, jobId, status, message: 'Job iniciado. Consulta /job/:jobId para el estado.' });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/scrape/:animeId
 * Scrape episodios de JKAnime para un anime.
 * Body (opcional):
 *   - jkSlug: string (slug en JKAnime si ya se conoce)
 *   - fromEpisode: number (default: 1)
 *   - toEpisode: number (default: auto-detect)
 *   - season: number (default: 1)
 */
router.post('/scrape/:animeId', async (req, res) => {
  const animeId = parseInt(req.params.animeId);
  if (!animeId) return res.status(400).json({ ok: false, message: 'animeId inválido' });

  const { jkSlug, av1Slug, source, fromEpisode, toEpisode, season } = req.body || {};

  try {
    const { jobId, status } = await scrapeEpisodes(animeId, {
      jkSlug: jkSlug || null,
      av1Slug: av1Slug || null,
      source: source || 'auto',
      fromEpisode: fromEpisode ? parseInt(fromEpisode) : 1,
      toEpisode: toEpisode ? parseInt(toEpisode) : null,
      season: season ? parseInt(season) : 1,
    });
    res.json({
      ok: true,
      jobId,
      status,
      message: 'Scrape iniciado en segundo plano. Consulta /job/:jobId para el progreso.',
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/metadata-and-scrape/:animeId
 * Hace todo en un solo paso: metadatos + scrape de episodios.
 */
router.post('/metadata-and-scrape/:animeId', async (req, res) => {
  const animeId = parseInt(req.params.animeId);
  if (!animeId) return res.status(400).json({ ok: false, message: 'animeId inválido' });

  const { jkSlug, av1Slug, source, fromEpisode, toEpisode, season } = req.body || {};

  try {
    const metaJob = await autoFillMetadata(animeId);
    const scrapeJob = await scrapeEpisodes(animeId, {
      jkSlug: jkSlug || null,
      av1Slug: av1Slug || null,
      source: source || 'auto',
      fromEpisode: fromEpisode ? parseInt(fromEpisode) : 1,
      toEpisode: toEpisode ? parseInt(toEpisode) : null,
      season: season ? parseInt(season) : 1,
    });

    res.json({
      ok: true,
      jobs: { metadata: metaJob.jobId, scrape: scrapeJob.jobId },
      message: 'Ambos jobs iniciados. Consulta el estado de cada uno.',
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/find-slug
 * Busca el slug de un anime en JKAnime sin guardarlo.
 * Body: { title: string }
 */
router.post('/find-slug', async (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, message: 'title requerido' });

  try {
    const slug = await findJkAnimeSlug(title);
    res.json({ ok: true, slug, found: !!slug });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/preview-anilist
 * Previsualiza los datos que AniList devolvería sin guardarlos.
 * Body: { title: string }
 */
router.post('/preview-anilist', async (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, message: 'title requerido' });

  try {
    const data = await searchAniListMetadata(title);
    if (!data) return res.json({ ok: false, message: `No se encontró "${title}" en AniList` });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/create-and-scrape
 * Crea un anime solo con el título y lanza todo el bot.
 */
router.post('/create-and-scrape', async (req, res) => {
  const { title, jkSlug, av1Slug, source, fromEpisode, toEpisode, season } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, message: 'Título requerido' });

  try {
    // 1. Crear el anime en la BD
    const result = await pool.query(
      `INSERT INTO anime_content (title, status, is_active) VALUES ($1, 'Ongoing', true) RETURNING id`,
      [title]
    );
    const newAnimeId = result.rows[0].id;

    // 2. Lanzar los jobs
    const metaJob = await autoFillMetadata(newAnimeId);
    const scrapeJob = await scrapeEpisodes(newAnimeId, {
      jkSlug: jkSlug || null,
      av1Slug: av1Slug || null,
      source: source || 'auto',
      fromEpisode: fromEpisode ? parseInt(fromEpisode) : 1,
      toEpisode: toEpisode ? parseInt(toEpisode) : null,
      season: season ? parseInt(season) : 1,
    });

    res.json({
      ok: true,
      animeId: newAnimeId,
      jobs: [metaJob, scrapeJob],
      message: 'Anime creado y bot lanzado exitosamente.',
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/sync-airing
 * Inicia el proceso para escanear animes en emisión y descargarlos.
 */
router.post('/sync-airing', async (req, res) => {
  try {
    const syncJob = await syncAiringAnimes();
    res.json({
      ok: true,
      jobId: syncJob.jobId,
      message: 'Sincronización de animes en emisión iniciada.',
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/sync-all
 * Inicia el proceso de crawl masivo del catálogo (solo animes nuevos).
 * Body: { startPage: number, endPage: number }
 */
router.post('/sync-all', async (req, res) => {
  const { startPage = 1, endPage = 10 } = req.body || {};
  try {
    const syncJob = await syncAllCatalog(parseInt(startPage), parseInt(endPage));
    res.json({
      ok: true,
      jobId: syncJob.jobId,
      message: \`Crawl masivo iniciado (páginas \${startPage}-\${endPage}).\`,
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

export default router;

/**
 * POST /api/admin/bot/find-slug-av1
 * Busca el slug de un anime en AnimeAV1 sin guardarlo.
 * Body: { title: string }
 */
router.post('/find-slug-av1', async (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, message: 'title requerido' });

  try {
    const slug = await findAnimeAv1Slug(title);
    res.json({ ok: true, slug, found: !!slug });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/scrape-av1/:animeId
 * Fuerza el scrape desde AnimeAV1 exclusivamente.
 * Body (opcional):
 *   - av1Slug: string (slug en AnimeAV1 si ya se conoce)
 *   - fromEpisode: number (default: 1)
 *   - toEpisode: number (default: auto-detect)
 *   - season: number (default: 1)
 */
router.post('/scrape-av1/:animeId', async (req, res) => {
  const animeId = parseInt(req.params.animeId);
  if (!animeId) return res.status(400).json({ ok: false, message: 'animeId inválido' });

  const { av1Slug, fromEpisode, toEpisode, season } = req.body || {};

  try {
    const { jobId, status } = await scrapeEpisodes(animeId, {
      av1Slug: av1Slug || null,
      source: 'animeav1',
      fromEpisode: fromEpisode ? parseInt(fromEpisode) : 1,
      toEpisode: toEpisode ? parseInt(toEpisode) : null,
      season: season ? parseInt(season) : 1,
    });
    res.json({
      ok: true,
      jobId,
      status,
      message: 'Scrape AnimeAV1 iniciado. Consulta /job/:jobId para el progreso.',
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/**
 * POST /api/admin/bot/preview-av1
 * Previsualiza los metadatos de AnimeAV1 para un slug dado.
 * Body: { slug: string }
 */
router.post('/preview-av1', async (req, res) => {
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ ok: false, message: 'slug requerido' });

  try {
    const data = await getAnimeAv1PageData(slug);
    if (!data || !data.title) {
      return res.json({ ok: false, message: `No se pudo obtener datos para el slug "${slug}"` });
    }
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});
