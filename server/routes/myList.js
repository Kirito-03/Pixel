import express from 'express';
import pool from '../db.js';

const router = express.Router();

function getPerfilId(req) {
  const raw = req.header('x-profile-id') ?? req.header('x-perfil-id') ?? req.body?.perfil_id ?? req.body?.profile_id ?? req.query?.perfil_id ?? req.query?.profile_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

router.get('/', async (req, res) => {
  const perfilId = getPerfilId(req);
  if (!perfilId) return res.status(400).json({ message: 'perfilId requerido (header x-profile-id)' });

  try {
    const { rows } = await pool.query(
      SELECT
        m.content_id,
        m.content_type,
        m.added_at,
        COALESCE(ac.title, mc.title) AS anime_title,
        COALESCE(ac.poster_url, mc.cover_url) AS poster_url,
        ac.banner_url,
        COALESCE(ac.total_episodes, mc.chapter_count) AS total_episodes,
        p.episode_id,
        p.current_seconds AS current_time,
        p.duration_seconds AS duration,
        p.updated_at AS last_watched_at,
        CASE
          WHEN p.duration_seconds > 0 THEN LEAST(100, GREATEST(0, ROUND((p.current_seconds::numeric / p.duration_seconds) * 100)))
          ELSE 0
        END AS progress_percent,
        ae.season,
        ae.episode_number,
        ae.title AS episode_title
      FROM pns_my_list_items m
      LEFT JOIN pns_watch_progress p
        ON m.content_type = 'anime'
       AND p.profile_id = m.profile_id
       AND p.anime_id::text = m.content_id
      LEFT JOIN anime_content ac
        ON m.content_type = 'anime'
       AND ac.id::text = m.content_id
      LEFT JOIN anime_episodes ae
        ON m.content_type = 'anime'
       AND ae.id = p.episode_id
      LEFT JOIN manga_cache mc
        ON m.content_type = 'manga'
       AND mc.manga_id = m.content_id
      WHERE m.profile_id = $1
      ORDER BY m.added_at DESC
      `,
      [perfilId]
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: 'Error al obtener Mi lista', error: e.message });
  }
});

router.post('/', async (req, res) => {
  const perfilId = getPerfilId(req);
  const contentId = req.body?.content_id ?? req.body?.contentId ?? req.body?.animeId ?? req.body?.anime_id;
  const contentTypeRaw = String(req.body?.content_type ?? req.body?.contentType ?? 'anime').toLowerCase();

  if (!perfilId) return res.status(400).json({ message: 'perfilId requerido (header x-profile-id)' });
  if (!contentId) return res.status(400).json({ message: 'content_id requerido' });
  if (!['movie', 'tv', 'anime', 'manga'].includes(contentTypeRaw)) {
    return res.status(400).json({ message: 'content_type inválido', allowed: ['movie', 'tv', 'anime', 'manga'] });
  }

  try {
    await pool.query(
      `INSERT INTO pns_my_list_items (profile_id, content_id, content_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (profile_id, content_id, content_type)
       DO UPDATE SET added_at = CURRENT_TIMESTAMP`,
      [perfilId, contentId, contentTypeRaw]
    );
    return res.status(201).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Error al añadir a Mi lista', error: e.message });
  }
});

router.delete('/:contentId', async (req, res) => {
  const perfilId = getPerfilId(req);
  const contentId = req.params.contentId;
  const contentTypeRaw = String(req.query?.type ?? req.query?.content_type ?? req.header('x-content-type') ?? 'anime').toLowerCase();

  if (!perfilId) return res.status(400).json({ message: 'perfilId requerido (header x-profile-id)' });
  if (!contentId) return res.status(400).json({ message: 'contentId inválido' });
  if (!['movie', 'tv', 'anime', 'manga'].includes(contentTypeRaw)) {
    return res.status(400).json({ message: 'content_type inválido', allowed: ['movie', 'tv', 'anime', 'manga'] });
  }

  try {
    console.log('[MyList][DELETE]', { profileId: perfilId, contentId, contentType: contentTypeRaw });
    await pool.query(
      'DELETE FROM pns_my_list_items WHERE profile_id = $1 AND content_id = $2 AND content_type = $3',
      [perfilId, contentId, contentTypeRaw]
    );
    console.log('[MyList][DELETE][OK]', { profileId: perfilId, contentId, contentType: contentTypeRaw });
    return res.json({ ok: true });
  } catch (e) {
    console.log('[MyList][DELETE][ERR]', e?.message);
    return res.status(500).json({ message: 'Error al quitar de Mi lista', error: e.message });
  }
});

export default router;
