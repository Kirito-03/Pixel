import express from 'express';
import pool from '../db.js';
import { getChapterPages, getMangaChapters, getMangaDetail, getMangaList, getPopularManga } from '../services/mangaService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query?.page || 1) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 24) || 24));
    const status = String(req.query?.status || '').trim();
    const search = String(req.query?.search || '').trim();
    const order = String(req.query?.order || '').trim();

    const result = await getMangaList(pool, { page, limit, status, search, order });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo mangas', error: e.message });
  }
});

router.get('/popular', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 12) || 12));
    const result = await getPopularManga(pool, { limit });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo mangas populares', error: e.message });
  }
});

router.get('/chapter/:chapterId/pages', async (req, res) => {
  try {
    const chapterId = String(req.params.chapterId || '').trim();
    if (!chapterId) return res.status(400).json({ message: 'chapterId requerido' });
    const result = await getChapterPages(pool, chapterId);
    return res.json(result || { baseUrl: null, pages: [], chapterId });
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo páginas del capítulo', error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id requerido' });
    const item = await getMangaDetail(pool, id);
    if (!item) return res.status(404).json({ message: 'Manga no encontrado' });
    return res.json(item);
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo manga', error: e.message });
  }
});

router.get('/:id/chapters', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id requerido' });
    const limit = Math.min(500, Math.max(1, Number(req.query?.limit || 200) || 200));
    const preferredLanguage = String(req.query?.preferredLanguage || 'es').trim();
    const allowEnglishFallback =
      req.query?.allowEnglishFallback === undefined
        ? true
        : req.query?.allowEnglishFallback === true ||
        req.query?.allowEnglishFallback === 'true' ||
        req.query?.allowEnglishFallback === 1 ||
        req.query?.allowEnglishFallback === '1';
    const forceRefresh =
      req.query?.refresh === true ||
      req.query?.refresh === 'true' ||
      req.query?.refresh === 1 ||
      req.query?.refresh === '1';
    const result = await getMangaChapters(pool, id, { limit, preferredLanguage, allowEnglishFallback, forceRefresh });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo capítulos', error: e.message });
  }
});

export default router;
