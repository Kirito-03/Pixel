import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Images: upload image metadata
router.post('/', async (req, res) => {
  const { filename, original_name, mime_type, size, width, height, url, type, entity_id, entity_type } = req.body || {};
  if (!filename || !url || !type || !['poster', 'backdrop', 'avatar', 'thumbnail'].includes(type)) {
    return res.status(400).json({ message: 'Datos de imagen incompletos o inválidos' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO imagenes (filename, original_name, mime_type, size, width, height, url, type, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [filename, original_name, mime_type, size, width, height, url, type, entity_id, entity_type]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (e) {
    res.status(500).json({ message: 'Error al guardar imagen', error: e.message });
  }
});

// Images: get images by entity
router.get('/:entity_type/:entity_id', async (req, res) => {
  const { entity_type, entity_id } = req.params;
  if (!['contenido', 'perfil'].includes(entity_type)) {
    return res.status(400).json({ message: 'Tipo de entidad inválido' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM imagenes WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC',
      [entity_type, entity_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener imágenes', error: e.message });
  }
});

export default router;
