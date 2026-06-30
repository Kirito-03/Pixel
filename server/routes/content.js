import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Content: get all content
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contenido ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener contenido', error: e.message });
  }
});

// Content: get content by type
router.get('/:type', async (req, res) => {
  const type = req.params.type;
  if (!['movie', 'tv', 'anime'].includes(type)) return res.status(400).json({ message: 'Tipo de contenido inválido' });
  try {
    const result = await pool.query('SELECT * FROM contenido WHERE type = $1 ORDER BY created_at DESC', [type]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener contenido', error: e.message });
  }
});

// Content: add new content
router.post('/', async (req, res) => {
  const { title, type, overview, poster_url, backdrop_url } = req.body || {};
  if (!title || !type || !['movie', 'tv', 'anime'].includes(type)) {
    return res.status(400).json({ message: 'Datos de contenido incompletos o inválidos' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO contenido (title, type, overview, poster_url, backdrop_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [title, type, overview, poster_url, backdrop_url]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (e) {
    res.status(500).json({ message: 'Error al crear contenido', error: e.message });
  }
});

// Videos: serve M3U file
router.get('/m3u', (req, res) => {
  try {
    const m3uPath = join(__dirname, '..', 'videos', 'animes_madre.m3u');
    const content = readFileSync(m3uPath, 'utf-8');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'inline; filename="animes_madre.m3u"');
    res.send(content);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener archivo M3U', error: e.message });
  }
});

export default router;
