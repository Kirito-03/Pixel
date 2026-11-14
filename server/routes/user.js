import express from 'express';
const router = express.Router();
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

router.get('/details', authenticateToken, async (req, res) => {
  try {
    const { id } = req.user;
    const result = await pool.query('SELECT email, role FROM usuarios WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    res.json({ email: user.email, role: user.role });
  } catch (error) {
    console.error('Error al obtener detalles del usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
