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
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 horas de cache para mitigar caídas de Jikan

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
    let response;
    let retries = 3;
    while (retries > 0) {
      try {
        response = await axios.get(`${JIKAN_BASE}/schedules`, {
          params: { filter: day, limit: 25 },
          headers: JIKAN_HEADERS,
          timeout: 10000,
        });
        break; // Success, exit retry loop
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const data = response.data?.data || [];

    // Guardar en cache (ahora dura 2 horas para mayor resiliencia)
    scheduleCache.set(day, { data, ts: Date.now() });

    return res.json({ data, cached: false, day });
  } catch (error) {
    console.error(`[Schedules] Error llamando a Jikan para ${day}:`, error.message);
    
    // Si hay cualquier error (429, 504, 500) y tenemos cache viejo, usamos el cache sin importar el TTL
    if (cached) {
      console.warn(`[Schedules] Fallback a cache viejo para ${day}.`);
      return res.json({ data: cached.data, cached: true, day, warning: 'Error API Jikan, usando cache viejo.' });
    }

    return res.status(error.response?.status || 500).json({ error: 'Error obteniendo horarios', detail: error.message });
  }
});

export default router;
