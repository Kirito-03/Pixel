import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/anime', async (req, res) => {
  const { page = '1', limit = '20', search = '', status = '', franchise = '' } = req.query;

  const safePage = Math.max(parseInt(String(page), 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 50);
  const offset = (safePage - 1) * safeLimit;

  try {
    let where = 'WHERE is_active = true';
    const params = [];
    let i = 1;

    if (status) {
      where += ` AND status = $${i++}`;
      params.push(status);
    }

    if (franchise) {
      where += ` AND franchise_key = $${i++}`;
      params.push(franchise);
    }

    if (search) {
      where += ` AND (title ILIKE $${i} OR title_english ILIKE $${i} OR title_japanese ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    const countQuery = `SELECT COUNT(*)::int AS count FROM anime_content ${where}`;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows?.[0]?.count || 0;
    const totalPages = Math.max(Math.ceil(total / safeLimit), 1);

    const listQuery = `
      SELECT
        id,
        tmdb_id,
        title,
        franchise_key,
        title_english,
        title_japanese,
        description,
        poster_url,
        banner_url,
        genres,
        status,
        total_episodes,
        rating,
        release_date,
        created_at
      FROM anime_content
      ${where}
      ORDER BY created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;

    const listResult = await pool.query(listQuery, [...params, safeLimit, offset]);
    res.json({
      data: listResult.rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    });
  } catch (e) {
    res.status(500).json({ message: 'Error listando anime', error: e.message });
  }
});

router.get('/anime/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          tmdb_id,
          title,
          franchise_key,
          title_english,
          title_japanese,
          description,
          poster_url,
          banner_url,
          genres,
          status,
          total_episodes,
          rating,
          release_date,
          created_at
        FROM anime_content
        WHERE id = $1 AND is_active = true
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Anime no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error obteniendo anime', error: e.message });
  }
});

router.get('/anime/:id/episodes', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          season,
          episode_number,
          title,
          duration,
          status,
          video_url,
          stream_url,
          external_servers
        FROM anime_episodes
        WHERE anime_id = $1 AND is_active = true
        ORDER BY season ASC, episode_number ASC
      `,
      [id]
    );

    res.json({ episodes: result.rows });
  } catch (e) {
    res.status(500).json({ message: 'Error listando episodios', error: e.message });
  }
});

router.get('/search', async (req, res) => {
  const { q = '', page = '1', limit = '20', status = '', franchise = '' } = req.query;

  const query = String(q || '').trim();
  if (!query) {
    return res.status(400).json({ message: 'q requerido' });
  }

  const safePage = Math.max(parseInt(String(page), 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 50);
  const offset = (safePage - 1) * safeLimit;

  try {
    let where = 'WHERE is_active = true';
    const params = [];
    let i = 1;

    if (status) {
      where += ` AND status = $${i++}`;
      params.push(status);
    }

    if (franchise) {
      where += ` AND franchise_key = $${i++}`;
      params.push(franchise);
    }

    where += ` AND (
      title ILIKE $${i}
      OR title_english ILIKE $${i}
      OR title_japanese ILIKE $${i}
      OR franchise_key ILIKE $${i}
      OR EXISTS (
        SELECT 1
        FROM unnest(genres) g
        WHERE g ILIKE $${i}
      )
    )`;
    params.push(`%${query}%`);
    i++;

    const countQuery = `SELECT COUNT(*)::int AS count FROM anime_content ${where}`;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows?.[0]?.count || 0;
    const totalPages = Math.max(Math.ceil(total / safeLimit), 1);

    const listQuery = `
      SELECT
        id,
        tmdb_id,
        title,
        franchise_key,
        title_english,
        title_japanese,
        description,
        poster_url,
        banner_url,
        genres,
        status,
        total_episodes,
        rating,
        release_date,
        created_at
      FROM anime_content
      ${where}
      ORDER BY created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;

    const listResult = await pool.query(listQuery, [...params, safeLimit, offset]);
    res.json({
      data: listResult.rows,
      pagination: { page: safePage, limit: safeLimit, total, totalPages },
    });
  } catch (e) {
    res.status(500).json({ message: 'Error buscando anime', error: e.message });
  }
});

export default router;

