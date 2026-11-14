import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

// Auth: register
router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email y password requeridos' });
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes' });
  try {
    const existsResult = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existsResult.rows.length) return res.status(409).json({ message: 'Email ya registrado' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO usuarios (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, hashedPassword]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (e) {
    res.status(500).json({ message: 'Error al registrar', error: e.message });
  }
});

// Auth: login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email y password requeridos' });
  try {
    const result = await pool.query('SELECT id, password_hash FROM usuarios WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(401).json({ message: 'Credenciales inválidas' });
    const user = result.rows[0];
    // OAuth placeholders and legacy plaintext must never authenticate as passwords.
    if (!/^\$2[aby]\$/.test(String(user.password_hash))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '24h' });
    res.json({ id: user.id, email, token });
  } catch (e) {
    res.status(500).json({ message: 'Error al iniciar sesión', error: e.message });
  }
});

// Recuperacion pendiente de integracion con entrega de correo segura.
router.post('/forgot-password', async (req, res) => {
  // No entregar tokens de recuperacion a quien solo conoce el email.
  return res.status(503).json({ message: 'Recuperacion temporalmente no disponible. Contacta al administrador.' });

});

// Auth: reset password using token
router.post('/reset-password', async (req, res) => {
  const { email, token, new_password } = req.body || {};
  if (!email || !token || !new_password) return res.status(400).json({ message: 'email, token y new_password requeridos' });
  if (typeof new_password !== 'string' || new_password.length < 8 || Buffer.byteLength(new_password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Usa una contrasena de al menos 8 caracteres y como maximo 72 bytes' });
  }
  try {
    const usersResult = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (!usersResult.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    const userId = usersResult.rows[0].id;
    const tokensResult = await pool.query(
      'SELECT id FROM password_resets WHERE usuario_id = $1 AND token = $2 AND used = false AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [userId, token]
    );
    if (!tokensResult.rows.length) return res.status(400).json({ message: 'Token inválido o expirado' });
    const resetId = tokensResult.rows[0].id;
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(new_password, 12), userId]);
    await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [resetId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al restablecer contraseña', error: e.message });
  }
});

export default router;
