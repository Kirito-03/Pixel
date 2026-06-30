import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Utilidad: asegura que exista el registro de descargas para un perfil y devuelve su id
async function ensureDescargasForPerfil(perfilId) {
  const perfilResult = await pool.query('SELECT id FROM perfiles WHERE id = $1 LIMIT 1', [perfilId]);
  if (!perfilResult.rows.length) throw new Error('Perfil no encontrado');
  const result = await pool.query('SELECT id FROM descargas WHERE perfil_id = $1 LIMIT 1', [perfilId]);
  if (result.rows.length) return result.rows[0].id;
  const inserted = await pool.query(
    'INSERT INTO descargas (perfil_id, name) VALUES ($1, $2) RETURNING id',
    [perfilId, 'Descargas']
  );
  return inserted.rows[0].id;
}

// Downloads: get (auto-crea registro de descargas si falta)
router.get('/:perfilId', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  if (!perfilId) return res.status(400).json({ message: 'perfilId requerido' });
  try {
    console.log(`[Downloads][GET] perfilId=${perfilId}`);
    const descargaId = await ensureDescargasForPerfil(perfilId);
    console.log(`[Downloads][GET] ensureDescargasForPerfil -> descargaId=${descargaId}`);
    const itemsResult = await pool.query(
      'SELECT content_id, content_type, status, progress, file_path, added_at, updated_at FROM descarga_items WHERE descarga_id = $1 ORDER BY added_at DESC',
      [descargaId]
    );
    console.log(`[Downloads][GET] returned ${itemsResult.rows.length} items`);
    res.json(itemsResult.rows);
  } catch (e) {
    if (e.message === 'Perfil no encontrado') {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    res.status(500).json({ message: 'Error al obtener descargas', error: e.message });
  }
});

// Downloads: add or update (upsert)
router.post('/:perfilId/items', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  const { content_id, content_type, status, progress, file_path } = req.body || {};
  console.log(`[Downloads][POST] perfilId=${perfilId} body=`, { content_id, content_type, status, progress, file_path });
  if (!perfilId || !content_id || !content_type) return res.status(400).json({ message: 'Datos incompletos' });
  const allowedTypes = ['movie', 'tv', 'anime'];
  if (!allowedTypes.includes(String(content_type).toLowerCase())) {
    return res.status(400).json({ message: 'Tipo de contenido inválido', allowed: allowedTypes });
  }
  try {
    const descargaId = await ensureDescargasForPerfil(perfilId);
    console.log(`[Downloads][POST] ensureDescargasForPerfil -> descargaId=${descargaId}`);
    await pool.query(
      `INSERT INTO descarga_items (descarga_id, content_id, content_type, status, progress, file_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (descarga_id, content_id, content_type)
       DO UPDATE SET status = EXCLUDED.status, progress = EXCLUDED.progress, file_path = EXCLUDED.file_path, updated_at = CURRENT_TIMESTAMP`,
      [descargaId, content_id, content_type, status || 'PENDING', progress ?? 0, file_path || null]
    );
    console.log(`[Downloads][POST] upsert OK -> descarga_id=${descargaId}, content_id=${content_id}, type=${content_type}`);
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[Downloads][POST] error', e?.message);
    res.status(500).json({ message: 'Error al añadir/actualizar descarga', error: e.message });
  }
});

// Downloads: update progress/status
router.put('/:perfilId/items/:contentId/:type', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  const contentId = Number(req.params.contentId);
  const type = req.params.type;
  const { status, progress, file_path } = req.body || {};
  if (!perfilId || !contentId || !type) return res.status(400).json({ message: 'Datos incompletos' });
  const allowedTypes = ['movie', 'tv', 'anime'];
  if (!allowedTypes.includes(String(type).toLowerCase())) {
    return res.status(400).json({ message: 'Tipo de contenido inválido', allowed: allowedTypes });
  }
  try {
    const descargaId = await ensureDescargasForPerfil(perfilId);
    await pool.query(
      'UPDATE descarga_items SET status = $1, progress = $2, file_path = $3, updated_at = CURRENT_TIMESTAMP WHERE descarga_id = $4 AND content_id = $5 AND content_type = $6',
      [status || 'PENDING', progress ?? 0, file_path || null, descargaId, contentId, type]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al actualizar descarga', error: e.message });
  }
});

// Downloads: remove
router.delete('/:perfilId/items/:contentId/:type', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  const contentId = Number(req.params.contentId);
  const type = req.params.type;
  if (!perfilId || !contentId || !type) return res.status(400).json({ message: 'Datos incompletos' });
  const allowedTypes = ['movie', 'tv', 'anime'];
  if (!allowedTypes.includes(String(type).toLowerCase())) {
    return res.status(400).json({ message: 'Tipo de contenido inválido', allowed: allowedTypes });
  }
  try {
    const descargaId = await ensureDescargasForPerfil(perfilId);
    await pool.query('DELETE FROM descarga_items WHERE descarga_id = $1 AND content_id = $2 AND content_type = $3', [descargaId, contentId, type]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al quitar descarga', error: e.message });
  }
});

export default router;
