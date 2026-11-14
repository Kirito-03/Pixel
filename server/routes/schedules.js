/**
 * routes/schedules.js
 * Horarios de anime en emisión por día de la semana.
 * Fuente principal: Jikan API v4 (MyAnimeList) con fallback automático a AniList GraphQL.
 * Persistencia en memoria + Redis (con caché de respaldo ante caídas externas).
 */
import express from 'express';
import axios from 'axios';
import cache from '../services/cacheService.js';

const router = express.Router();

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'PixelNoSekai/1.0',
};

const VALID_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS_ES = {
  sunday: 'Domingos',
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábados',
};

const scheduleCache = new Map(); // key: day -> { data, ts, source }
const MEM_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas
const REDIS_TTL_SEC = 6 * 60 * 60; // 6 horas
const REDIS_STALE_TTL_SEC = 7 * 24 * 60 * 60; // 7 días de respaldo

function getJstDayWindowSeconds(day) {
  const targetDayIdx = VALID_DAYS.indexOf(day);
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  const currentDayIdx = nowJst.getUTCDay();
  const diffDays = targetDayIdx - currentDayIdx;

  const startJstMs = Date.UTC(
    nowJst.getUTCFullYear(),
    nowJst.getUTCMonth(),
    nowJst.getUTCDate() + diffDays,
    0, 0, 0, 0
  ) - JST_OFFSET_MS;

  const startSec = Math.floor(startJstMs / 1000);
  return { startSec, endSec: startSec + 86400 - 1 };
}

function formatJstTime(airingAtSec) {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const d = new Date(airingAtSec * 1000 + JST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function fetchFromJikan(day) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.get(`${JIKAN_BASE}/schedules`, {
        params: { filter: day, limit: 25 },
        headers: JIKAN_HEADERS,
        timeout: 5500,
      });
      const list = response.data?.data;
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
      throw new Error('Jikan devolvió lista vacía');
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
  }
  throw lastErr;
}

async function fetchFromAniList(day) {
  const { startSec, endSec } = getJstDayWindowSeconds(day);
  const query = `
    query ($start: Int, $end: Int) {
      Page(page: 1, perPage: 35) {
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          airingAt
          episode
          media {
            id
            idMal
            isAdult
            averageScore
            status
            description(asHtml: false)
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
    }
  `;

  const { data: resp } = await axios.post(
    ANILIST_URL,
    { query, variables: { start: startSec, end: endSec } },
    { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 10000 }
  );

  const schedules = resp?.data?.Page?.airingSchedules || [];
  const seen = new Set();
  const mapped = [];

  for (const entry of schedules) {
    const m = entry?.media;
    if (!m || m.isAdult) continue;
    const malId = m.idMal || m.id;
    if (seen.has(malId)) continue;
    seen.add(malId);

    const timeStr = entry.airingAt ? formatJstTime(entry.airingAt) : '00:00';
    const cleanDesc = (m.description || '').replace(/<[^>]+>/g, '').trim();

    mapped.push({
      mal_id: malId,
      title: m.title?.romaji || m.title?.english || m.title?.native || 'Sin título',
      synopsis: cleanDesc,
      score: typeof m.averageScore === 'number' ? Number((m.averageScore / 10).toFixed(2)) : null,
      status: m.status === 'RELEASING' ? 'Currently Airing' : (m.status || ''),
      images: {
        jpg: {
          large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || '',
        },
      },
      broadcast: {
        time: timeStr,
        string: `${DAY_LABELS_ES[day] || day} ${timeStr} (JST)`,
      },
    });
  }

  return mapped.slice(0, 25);
}

/**
 * GET /api/schedules?filter=monday|tuesday|...
 * Retorna los animes en emisión para el día indicado.
 */
router.get('/', async (req, res) => {
  const day = (req.query.filter || 'monday').toLowerCase();

  if (!VALID_DAYS.includes(day)) {
    return res.status(400).json({ error: 'Día inválido. Usar: monday|tuesday|wednesday|thursday|friday|saturday|sunday' });
  }

  // 1. Caché en memoria
  const memCached = scheduleCache.get(day);
  if (memCached && Date.now() - memCached.ts < MEM_TTL_MS) {
    return res.json({ data: memCached.data, cached: true, source: memCached.source, day });
  }

  // 2. Caché en Redis
  const redisCached = await cache.get(`schedules:${day}`);
  if (Array.isArray(redisCached) && redisCached.length > 0) {
    scheduleCache.set(day, { data: redisCached, ts: Date.now(), source: 'redis' });
    return res.json({ data: redisCached, cached: true, source: 'redis', day });
  }

  // 3. Intentar Jikan y caer a AniList si Jikan falla o hace timeout
  let data = null;
  let source = 'jikan';

  try {
    data = await fetchFromJikan(day);
  } catch (jikanErr) {
    console.warn(`[Schedules] Jikan falló para ${day} (${jikanErr.message}). Usando AniList...`);
    try {
      data = await fetchFromAniList(day);
      source = 'anilist';
    } catch (anilistErr) {
      console.error(`[Schedules] AniList también falló para ${day}:`, anilistErr.message);
    }
  }

  if (Array.isArray(data) && data.length > 0) {
    scheduleCache.set(day, { data, ts: Date.now(), source });
    await cache.set(`schedules:${day}`, data, REDIS_TTL_SEC);
    await cache.set(`schedules:stale:${day}`, data, REDIS_STALE_TTL_SEC);
    return res.json({ data, cached: false, source, day });
  }

  // 4. Último recurso: caché stale en memoria o Redis
  if (memCached?.data?.length) {
    return res.json({ data: memCached.data, cached: true, source: 'stale-memory', day });
  }
  const staleRedis = await cache.get(`schedules:stale:${day}`);
  if (Array.isArray(staleRedis) && staleRedis.length > 0) {
    return res.json({ data: staleRedis, cached: true, source: 'stale-redis', day });
  }

  return res.status(503).json({ error: 'No se pudieron obtener horarios de Jikan ni AniList' });
});

export default router;
