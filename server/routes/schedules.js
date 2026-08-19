/**
 * routes/schedules.js
 * Proxy de Jikan API v4 para horarios de anime.
 * Evita problemas de CORS llamando desde el backend.
 */
import express from 'express';
import axios from 'axios';

const router = express.Router();

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const JIKAN_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'PixelNoSekai/1.0',
};

// Cache simple en memoria para no saturar Jikan (cache 30 min por día)
const scheduleCache = new Map(); // key: day → { data, ts }
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

/**
 * GET /api/schedules?filter=monday|tuesday|...
 * Retorna los animes en emisión para el día indicado según MyAnimeList via Jikan.
 */
router.get('/', async (req, res) => {
  const day = (req.query.filter || 'monday').toLowerCase();
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  if (!validDays.includes(day)) {
    return res.status(400).json({ error: 'Día inválido. Usar: monday|tuesday|wednesday|thursday|friday|saturday|sunday' });
  }

  // Verificar cache
  const cached = scheduleCache.get(day);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json({ data: cached.data, cached: true, day });
  }

  try {
    const response = await axios.get(`${JIKAN_BASE}/schedules`, {
      params: { filter: day, limit: 25 },
      headers: JIKAN_HEADERS,
      timeout: 15000,
    });

    const data = response.data?.data || [];

    // Guardar en cache
    scheduleCache.set(day, { data, ts: Date.now() });

    return res.json({ data, cached: false, day });
  } catch (error) {
    if (error.response?.status === 429) {
      // Rate limit de Jikan — devolver cache viejo si existe
      if (cached) {
        return res.json({ data: cached.data, cached: true, day, warning: 'Rate limit Jikan, usando cache.' });
      }
      return res.status(429).json({ error: 'Rate limit de Jikan API. Intenta en unos segundos.' });
    }
    console.error('[Schedules] Error llamando a Jikan:', error.message);
    return res.status(500).json({ error: 'Error obteniendo horarios', detail: error.message });
  }
});

export default router;
