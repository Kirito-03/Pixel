import express from 'express';
import pool from '../db.js';
import cache from '../services/cacheService.js';

const router = express.Router();

function parseBool(v) {
  if (v === true || v === 'true' || v === '1' || v === 1) return true;
  if (v === false || v === 'false' || v === '0' || v === 0) return false;
  return null;
}

router.get('/', async (req, res) => {
  const category = req.query?.category ? String(req.query.category) : '';
  const featured = parseBool(req.query?.featured);
  const page = Math.max(1, Number(req.query?.page || 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 20) || 20));
  const offset = (page - 1) * limit;

  try {
    const where = ['is_active = true', 'is_publishable = true'];
    const params = [];
    let i = 1;

    if (category) {
      where.push(`category = $${i++}`);
      params.push(category);
    }
    if (featured !== null) {
      where.push(`is_featured = $${i++}`);
      params.push(featured);
    }

    const rows = await pool.query(
      `
      SELECT
        id, title, slug, excerpt, source_name, image_url, published_at, category, tags, language, is_featured, external_url,
        has_valid_image, is_publishable, quality_score
      FROM news_articles
      WHERE ${where.join(' AND ')}
      ORDER BY quality_score DESC, published_at DESC NULLS LAST, id DESC
      LIMIT $${i++} OFFSET $${i++}
      `,
      [...params, limit, offset]
    );

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM news_articles WHERE ${where.join(' AND ')}`,
      params
    );

    return res.json({
      data: rows.rows,
      pagination: { page, limit, total: count.rows[0]?.total || 0 },
    });
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo noticias', error: e.message });
  }
});

router.get('/featured', async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query?.limit || 6) || 6));

  try {
    const data = await cache.getOrSet(`news:featured:${limit}`, 1800, async () => {
      const featuredWithImage = await pool.query(
        `
        SELECT
          id, title, slug, excerpt, source_name, image_url, published_at, category, tags, language, is_featured, external_url,
          has_valid_image, is_publishable, quality_score
        FROM news_articles
        WHERE is_active = true AND is_publishable = true AND is_featured = true AND has_valid_image = true
        ORDER BY quality_score DESC, published_at DESC NULLS LAST, id DESC
        LIMIT 1
        `
      );

      const fallbackWithImage = await pool.query(
        `
        SELECT
          id, title, slug, excerpt, source_name, image_url, published_at, category, tags, language, is_featured, external_url,
          has_valid_image, is_publishable, quality_score
        FROM news_articles
        WHERE is_active = true AND is_publishable = true AND has_valid_image = true
        ORDER BY is_featured DESC, quality_score DESC, published_at DESC NULLS LAST, id DESC
        LIMIT 1
        `
      );

      const main = featuredWithImage.rows[0] || fallbackWithImage.rows[0] || null;
      const noImageFallback = !main;

      const fallbackHero = {
        id: -1,
        title: 'Noticias Destacadas',
        slug: '__fallback-premium__',
        excerpt: 'Actualizando contenido. Vuelve en unos minutos para ver las últimas novedades.',
        source_name: 'Pixel no Sekai',
        image_url: null,
        published_at: new Date().toISOString(),
        category: 'industria',
        tags: [],
        language: 'es',
        is_featured: true,
        external_url: null,
        has_valid_image: false,
        is_publishable: true,
        quality_score: 100,
        use_fallback_image: true,
      };

      const secondary = await pool.query(
        `
        SELECT
          id, title, slug, excerpt, source_name, image_url, published_at, category, tags, language, is_featured, external_url,
          has_valid_image, is_publishable, quality_score
        FROM news_articles
        WHERE is_active = true AND is_publishable = true
          AND ($1::text IS NULL OR slug <> $1)
        ORDER BY has_valid_image DESC, quality_score DESC, published_at DESC NULLS LAST, id DESC
        LIMIT $2
        `,
        [main?.slug || null, limit]
      );

      return {
        featured: main || fallbackHero,
        items: secondary.rows,
        meta: { used_fallback_hero: noImageFallback },
      };
    });

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo featured', error: e.message });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const rows = await pool.query(
      `
      SELECT
        id, title, slug, excerpt, source_name, image_url, published_at, category, tags, language, is_featured, external_url,
        has_valid_image, is_publishable, quality_score
      FROM news_articles
      WHERE is_active = true AND is_publishable = true
      ORDER BY is_featured DESC, quality_score DESC, published_at DESC NULLS LAST, id DESC
      LIMIT 4
      `
    );
    return res.json({ items: rows.rows });
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo trending', error: e.message });
  }
});

router.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) return res.status(400).json({ message: 'slug requerido' });

  try {
    const result = await pool.query(
      `
      SELECT
        id, title, slug, excerpt, content, source_name, source_url, image_url, published_at, category, tags, language, is_featured, external_url,
        has_valid_image, is_publishable, quality_score
      FROM news_articles
      WHERE is_active = true AND is_publishable = true AND slug = $1
      LIMIT 1
      `,
      [slug]
    );

    if (!result.rows.length) return res.status(404).json({ message: 'Noticia no encontrada' });
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ message: 'Error obteniendo noticia', error: e.message });
  }
});

export default router;
