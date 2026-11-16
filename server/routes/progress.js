import { authenticateToken } from '../middleware/auth.js';
import { requireProfileOwner } from '../middleware/ownership.js';
import express from 'express';
import pool from '../db.js';

const router = express.Router();
router.use(authenticateToken, requireProfileOwner(getPerfilId));

function getPerfilId(req) {
  const raw =
    req.header('x-profile-id') ??
    req.header('x-perfil-id') ??
    req.body?.userId ??
    req.body?.perfil_id ??
    req.body?.profile_id ??
    req.query?.userId ??
    req.query?.perfil_id ??
    req.query?.profile_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

router.post('/', async (req, res) => {
  const perfilId = getPerfilId(req);
  const animeId = Number(req.body?.anime_id ?? req.body?.animeId ?? 0);
  const episodeId = Number(req.body?.episode_id ?? req.body?.episodeId ?? 0);
  const currentTime = Number(req.body?.current_time ?? req.body?.currentTime ?? 0);
  const durationRaw = Number(req.body?.duration ?? 0);

  if (!perfilId) return res.status(400).json({ message: 'userId/profile_id requerido' });
  if (!Number.isFinite(animeId) || animeId <= 0) return res.status(400).json({ message: 'animeId requerido' });
  if (!Number.isFinite(episodeId) || episodeId <= 0) return res.status(400).json({ message: 'episodeId requerido' });
  if (!Number.isFinite(currentTime) || currentTime < 0) return res.status(400).json({ message: 'currentTime inválido' });
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 0;

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO pns_watch_progress (profile_id, anime_id, episode_id, current_seconds, duration_seconds, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (profile_id, anime_id)
      DO UPDATE SET
        episode_id = EXCLUDED.episode_id,
        current_seconds = EXCLUDED.current_seconds,
        duration_seconds = EXCLUDED.duration_seconds,
        updated_at = CURRENT_TIMESTAMP
      RETURNING anime_id, episode_id, current_seconds AS current_time, duration_seconds AS duration, updated_at
      `,
      [perfilId, animeId, episodeId, Math.floor(currentTime), duration]
    );

    return res.status(200).json({ ok: true, progress: rows[0] });
  } catch (e) {
    console.error('[Progress][POST][ERR]', e?.message);
    return res.status(500).json({ message: 'Error al guardar progreso' });
  }
});

export default router;
