import { authenticateToken } from '../middleware/auth.js';
import { requireProfileOwner } from '../middleware/ownership.js';
import express from 'express';
import pool from '../db.js';

const router = express.Router();
router.use(authenticateToken, requireProfileOwner(getProfileId));

function getProfileId(req) {
  const raw =
    req.header('x-profile-id') ??
    req.header('x-perfil-id') ??
    req.query?.userId ??
    req.query?.profile_id ??
    req.query?.perfil_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

router.get('/', async (req, res) => {
  const profileId = getProfileId(req);
  if (!profileId) return res.status(400).json({ message: 'userId/profileId requerido' });

  try {
    const { rows } = await pool.query(
      `
      SELECT
        p.anime_id,
        p.episode_id,
        p.current_seconds AS current_time,
        p.duration_seconds AS duration,
        CASE
          WHEN p.duration_seconds > 0
            THEN LEAST(100, GREATEST(0, ROUND((p.current_seconds::numeric / p.duration_seconds) * 100)))
          ELSE 0
        END AS progress_percent,
        COALESCE(ac.banner_url, ac.poster_url, '') AS thumbnail,
        COALESCE(ac.title, CONCAT('Anime #', p.anime_id::text)) AS title,
        ae.episode_number,
        ae.season,
        p.updated_at
      FROM pns_watch_progress p
      LEFT JOIN anime_content ac ON ac.id = p.anime_id
      LEFT JOIN anime_episodes ae ON ae.id = p.episode_id
      WHERE p.profile_id = $1
        AND p.current_seconds > 0
        AND (
          p.duration_seconds <= 0
          OR (p.current_seconds::numeric / NULLIF(p.duration_seconds, 0)) < 0.95
        )
      ORDER BY p.updated_at DESC
      `,
      [profileId]
    );
    console.log('[ContinueWatching][GET]', { profileId, count: rows.length });
    return res.json(rows);
  } catch (e) {
    console.log('[ContinueWatching][GET][ERR]', e?.message);
    return res.status(500).json({ message: 'Error al obtener continue-watching', error: e.message });
  }
});

export default router;
