import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Profiles: list
router.get('/', async (req, res) => {
  const userId = Number(req.query.userId);
  if (!userId) return res.status(400).json({ message: 'userId requerido' });
  try {
    const result = await pool.query('SELECT id, usuario_id, name, avatar_url FROM perfiles WHERE usuario_id = $1', [userId]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener perfiles', error: e.message });
  }
});

// Profiles: create (and ensure "Mi lista" + "Descargas")
router.post('/', async (req, res) => {
  const { usuario_id, name, avatar_url } = req.body || {};
  if (!usuario_id || !name || !avatar_url) return res.status(400).json({ message: 'Datos de perfil incompletos' });
  try {
    const uCheck = await pool.query('SELECT id FROM usuarios WHERE id = $1', [usuario_id]);
    if (!uCheck.rows.length) return res.status(404).json({ message: 'Usuario no encontrado para crear perfil' });

    const perfilResult = await pool.query(
      'INSERT INTO perfiles (usuario_id, name, avatar_url) VALUES ($1, $2, $3) RETURNING id',
      [usuario_id, name, avatar_url]
    );
    const perfilId = perfilResult.rows[0].id;
    await pool.query('INSERT INTO listas (perfil_id, name, type) VALUES ($1, $2, $3)', [perfilId, 'Mi lista', 'MY_LIST']);
    await pool.query('INSERT INTO descargas (perfil_id, name) VALUES ($1, $2)', [perfilId, 'Descargas']);
    res.status(201).json({ id: perfilId });
  } catch (e) {
    console.error('Error al crear perfil:', e.message);
    res.status(500).json({ message: 'Error al crear perfil', error: e.message });
  }
});

// Profiles: update
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, avatar_url } = req.body || {};
  if (!id) return res.status(400).json({ message: 'id requerido' });

  const updates = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }
  if (avatar_url !== undefined) {
    updates.push(`avatar_url = $${idx++}`);
    values.push(avatar_url);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar' });
  }

  values.push(id);

  try {
    await pool.query(
      `UPDATE perfiles SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al actualizar perfil', error: e.message });
  }
});

// Profiles: delete
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'id requerido' });
  try {
    await pool.query('DELETE FROM perfiles WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar perfil', error: e.message });
  }
});

export default router;
