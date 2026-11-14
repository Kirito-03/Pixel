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
    req.query?.profileId ??
    req.query?.userId ??
    req.query?.profile_id ??
    req.query?.perfil_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

router.get('/:animeId', async (req, res) => {
  const profileId = getProfileId(req);
  const animeId = Number(req.params.animeId);

  if (!profileId) return res.status(400).json({ message: 'profileId/userId requerido' });
  if (!Number.isFinite(animeId) || animeId <= 0) return res.status(400).json({ message: 'animeId inválido' });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pns_watch_progress (
        id SERIAL PRIMARY KEY,
        profile_id BIGINT NOT NULL,
        anime_id INTEGER NOT NULL,
        episode_id INTEGER NOT NULL,
        current_seconds INTEGER NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_pns_watch_progress_profile_anime ON pns_watch_progress(profile_id, anime_id);`);

    const progress = await pool.query(
      `
      SELECT
        p.anime_id,
        p.episode_id,
        p.current_seconds AS resume_time,
        ae.season,
        ae.episode_number
      FROM pns_watch_progress p
      LEFT JOIN anime_episodes ae ON ae.id = p.episode_id
      WHERE p.profile_id = $1 AND p.anime_id = $2 AND p.current_seconds > 0
      LIMIT 1
      `,
      [profileId, animeId]
    );

    if (progress.rows.length) {
      const row = progress.rows[0];
      return res.json({
        animeId: Number(row.anime_id),
        episodeId: Number(row.episode_id),
        season: row.season == null ? null : Number(row.season),
        episodeNumber: row.episode_number == null ? null : Number(row.episode_number),
        resumeTime: Number(row.resume_time || 0),
      });
    }

    const first = await pool.query(
      `
      SELECT id AS episode_id, season, episode_number
      FROM anime_episodes
      WHERE anime_id = $1
        AND is_active = true
        AND (stream_url IS NOT NULL OR video_url IS NOT NULL)
      ORDER BY season ASC, episode_number ASC
      LIMIT 1
      `,
      [animeId]
    );

    if (!first.rows.length) {
      return res.json({ animeId, episodeId: null, season: null, episodeNumber: null, resumeTime: 0 });
    }

    const row = first.rows[0];
    return res.json({
      animeId,
      episodeId: Number(row.episode_id),
      season: row.season == null ? null : Number(row.season),
      episodeNumber: row.episode_number == null ? null : Number(row.episode_number),
      resumeTime: 0,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Error al resolver resume-target', error: e?.message || String(e) });
  }
});

export default router;

