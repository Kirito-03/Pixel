import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.js';

const router = express.Router();

// Auth: register
router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email y password requeridos' });
  if (String(password).length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
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
    // Soportar migración: si el hash no empieza con $2, es texto plano legacy
    const isHashed = String(user.password_hash).startsWith('$2');
    const ok = isHashed
      ? await bcrypt.compare(password, user.password_hash)
      : password === user.password_hash;
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });
    // Si era plaintext legacy, actualizar a bcrypt ahora
    if (!isHashed) {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(password, salt);
      await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hashed, user.id]);
    }
    res.json({ id: user.id, email });
  } catch (e) {
    res.status(500).json({ message: 'Error al iniciar sesión', error: e.message });
  }
});

// Auth: forgot password (dev-friendly - returns token)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'email requerido' });
  try {
    const result = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    const userId = result.rows[0].id;
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await pool.query(
      'INSERT INTO password_resets (usuario_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt]
    );
    res.json({ ok: true, token, expires_in_minutes: 30 });
  } catch (e) {
    res.status(500).json({ message: 'Error al generar token de recuperación', error: e.message });
  }
});

// Auth: reset password using token
router.post('/reset-password', async (req, res) => {
  const { email, token, new_password } = req.body || {};
  if (!email || !token || !new_password) return res.status(400).json({ message: 'email, token y new_password requeridos' });
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
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [new_password, userId]);
    await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [resetId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al restablecer contraseña', error: e.message });
  }
});

export default router;
