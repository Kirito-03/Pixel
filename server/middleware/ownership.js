import pool from '../db.js';

export const requireProfileOwner = (getProfileId) => async (req, res, next) => {
  const profileId = Number(getProfileId(req));
  if (!Number.isSafeInteger(profileId) || profileId <= 0) return res.status(400).json({ message: 'Perfil inválido' });
  try {
    const result = await pool.query('SELECT id FROM perfiles WHERE id = $1 AND usuario_id = $2', [profileId, req.user.id]);
    if (!result.rows.length) return res.status(403).json({ message: 'Acceso denegado' });
    next();
  } catch {
    res.status(500).json({ message: 'No se pudo verificar el perfil' });
  }
};

export const requireOwnUser = (getUserId) => (req, res, next) => {
  if (Number(getUserId(req)) !== Number(req.user.id)) return res.status(403).json({ message: 'Acceso denegado' });
  next();
};
