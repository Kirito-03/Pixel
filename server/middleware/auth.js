import jwt from 'jsonwebtoken';
import pool from '../db.js';

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const getAllowedEmails = () =>
    (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(normalizeEmail)
        .filter(Boolean);

/**
 * Middleware para autenticar administradores
 * Verifica JWT y valida que el rol del usuario sea 'admin' en la BD
 */
export const authenticateAdmin = async (req, res, next) => {
    const token = req.cookies?.admin_token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            message: 'No autorizado - Token no proporcionado',
            code: 'NO_TOKEN'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Consultar la base de datos para obtener el rol del usuario
        const result = await pool.query('SELECT role FROM usuarios WHERE id = $1', [decoded.id]);

        if (result.rows.length === 0) {
            return res.status(403).json({
                message: 'Acceso denegado - Usuario no encontrado',
                code: 'FORBIDDEN'
            });
        }

        let userRole = result.rows[0].role;

        if (userRole !== 'admin') {
            const allowedEmails = getAllowedEmails();
            if (allowedEmails.includes(normalizeEmail(decoded.email))) {
                await pool.query('UPDATE usuarios SET role = $1 WHERE id = $2', ['admin', decoded.id]);
                userRole = 'admin';
            } else {
                return res.status(403).json({
                    message: 'Acceso denegado - Permisos insuficientes',
                    code: 'FORBIDDEN'
                });
            }
        }

        req.admin = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                message: 'Token expirado',
                code: 'TOKEN_EXPIRED'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                message: 'Token inválido',
                code: 'INVALID_TOKEN'
            });
        }

        console.error('Error de autenticación:', error);
        return res.status(500).json({
            message: 'Error al verificar autenticación',
            error: error.message
        });
    }
};

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

/**
 * Middleware opcional para verificar admin sin bloquear
 * Útil para endpoints que pueden funcionar con o sin autenticación
 */
export const optionalAdmin = (req, res, next) => {
    const token = req.cookies?.admin_token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        req.admin = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const allowedEmails = getAllowedEmails();

        if (allowedEmails.includes(normalizeEmail(decoded.email))) {
            req.admin = {
                id: decoded.id,
                email: decoded.email,
                name: decoded.name,
                picture: decoded.picture
            };
        } else {
            req.admin = null;
        }
    } catch (error) {
        req.admin = null;
    }

    next();
};
