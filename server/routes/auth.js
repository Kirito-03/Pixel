import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';

const router = express.Router();

import pool from '../db.js';

const ADMIN_EMAILS_LIST = () =>
    (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);

function isAllowedMobileRedirect(rawUri) {
    if (typeof rawUri !== 'string') return false;
    const trimmed = rawUri.trim();
    if (!/^(pixelnosekai|exp):\/\/[A-Za-z0-9._~:/?#[\]!$&'()*+,;=%-]+$/.test(trimmed)) {
        return false;
    }
    return !trimmed.includes('@') && !trimmed.includes('//localhost');
}

// Configurar Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = String(profile.emails?.[0]?.value || '').trim().toLowerCase();
            const adminEmails = (process.env.ADMIN_EMAILS || '')
                .split(',')
                .map(e => e.trim().toLowerCase())
                .filter(Boolean);
            const role = adminEmails.includes(email) ? 'admin' : 'user';

            const result = await pool.query(
                `INSERT INTO usuarios (email, password_hash, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (email)
                 DO UPDATE SET
                   email = EXCLUDED.email,
                   role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE usuarios.role END
                 RETURNING id, email, role`,
                [email, 'google_auth', role]
            );

            return done(null, result.rows[0]);
        } catch (error) {
            return done(error, null);
        }
    }
));

// Serialización para sesiones (opcional, usamos JWT principalmente)
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// ========================================
// Rutas de autenticación
// ========================================

/**
 * GET /auth/google
 * Inicia el flujo de autenticación con Google
 */
router.get('/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account' // Forzar selección de cuenta
    })
);

/**
 * GET /auth/google/callback
 * Callback de Google OAuth
 */
router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/admin?error=auth_failed',
        session: false
    }),
    (req, res) => {
        try {
            if (req.user?.role !== 'admin') {
                const platform = req.query.platform;
                const redirectUri = req.query.redirect_uri;
                if (platform === 'mobile' && isAllowedMobileRedirect(redirectUri)) {
                    const separator = redirectUri.includes('?') ? '&' : '?';
                    res.redirect(`${redirectUri}${separator}error=unauthorized`);
                } else {
                    res.redirect('/admin?error=unauthorized');
                }
                return;
            }

            // Generar JWT
            const token = jwt.sign(
                {
                    id: req.user.id,
                    email: req.user.email,
                    role: req.user.role
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Detectar si es mobile (React Native)
            const platform = req.query.platform;
            const redirectUri = req.query.redirect_uri;

            if (platform === 'mobile' && isAllowedMobileRedirect(redirectUri)) {
                // Deep link validado para React Native con token en URL
                const separator = redirectUri.includes('?') ? '&' : '?';
                res.redirect(`${redirectUri}${separator}token=${token}`);
            } else {
                // Cookie para web
                res.cookie('admin_token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 24 * 60 * 60 * 1000, // 24 horas
                    sameSite: 'lax'
                });

                // Redirigir al dashboard web
                res.redirect('/admin/dashboard.html');
            }
        } catch (error) {
            console.error('Error generando JWT:', error);

            const platform = req.query.platform;
            const redirectUri = req.query.redirect_uri;

            if (platform === 'mobile' && isAllowedMobileRedirect(redirectUri)) {
                const separator = redirectUri.includes('?') ? '&' : '?';
                res.redirect(`${redirectUri}${separator}error=token_generation_failed`);
            } else {
                res.redirect('/admin?error=token_generation_failed');
            }
        }
    }
);

import axios from 'axios';

let firebaseCertsCache = { certs: null, expiresAt: 0 };

async function getFirebaseCerts() {
    const now = Date.now();
    if (firebaseCertsCache.certs && firebaseCertsCache.expiresAt > now) {
        return firebaseCertsCache.certs;
    }
    const response = await axios.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    const cacheControl = response.headers['cache-control'] || '';
    const match = cacheControl.match(/max-age=(\d+)/);
    const maxAge = match ? Number(match[1]) * 1000 : 3600 * 1000;
    firebaseCertsCache = { certs: response.data, expiresAt: now + maxAge };
    return firebaseCertsCache.certs;
}

async function verifyFirebaseIdToken(idToken) {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || !decoded.header?.kid) {
        throw new Error('Token inválido');
    }
    const certs = await getFirebaseCerts();
    const cert = certs[decoded.header.kid];
    if (!cert) {
        throw new Error('Certificado no encontrado');
    }
    const payload = jwt.verify(idToken, cert, { algorithms: ['RS256'] });
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    if (projectId) {
        if (payload.aud !== projectId) throw new Error('Audiencia inválida');
        if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Emisor inválido');
    } else {
        if (!payload.aud) throw new Error('Audiencia inválida');
        if (!String(payload.iss || '').startsWith('https://securetoken.google.com/')) throw new Error('Emisor inválido');
    }
    return payload;
}

/**
 * POST /auth/admin/firebase-login
 * Inicia sesión admin usando un token de Firebase (Client SDK)
 */
router.post('/admin/firebase-login', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ message: 'Token requerido' });
        }

        const payload = await verifyFirebaseIdToken(idToken);
        const email = String(payload.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
        const adminEmails = (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);
        const role = adminEmails.includes(email) ? 'admin' : 'user';
        if (role !== 'admin') {
            return res.status(403).json({ message: 'Email no autorizado para acceso de administrador', code: 'UNAUTHORIZED' });
        }

        const result = await pool.query(
            `INSERT INTO usuarios (email, password_hash, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (email)
             DO UPDATE SET
               email = EXCLUDED.email,
               role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE usuarios.role END
             RETURNING id, email, role`,
            [email, 'firebase_auth', role]
        );

        const user = result.rows[0];

        // Generar JWT de Admin (el que usa el backend)
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Si es web, establecer cookie también para consistencia
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none'
        });

        return res.json({ token, user });

    } catch (error) {
        console.error('Firebase Admin Login Error:', error.response?.data || error.message);
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }
});

/**
 * GET /auth/admin/me
 * Obtiene información del administrador autenticado
 */
router.get('/admin/me', async (req, res) => {
    const token = req.cookies?.admin_token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No autenticado' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const normalizedEmail = String(decoded.email || '').trim().toLowerCase();
        const isAllowedEmail = ADMIN_EMAILS_LIST().includes(normalizedEmail);
        if (decoded.role !== 'admin' && !isAllowedEmail) {
            return res.status(403).json({ message: 'Acceso denegado - Permisos insuficientes' });
        }
        res.json({
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
            role: 'admin'
        });
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }
});

/**
 * POST /auth/admin/logout
 * Cierra sesión del administrador
 */
router.post('/admin/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ ok: true, message: 'Sesión cerrada exitosamente' });
});

/**
 * GET /auth/admin/check
 * Verifica si el usuario está autenticado (para frontend)
 */
router.get('/admin/check', (req, res) => {
    const token = req.cookies?.admin_token;

    if (!token) {
        return res.json({ authenticated: false });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const normalizedEmail = String(decoded.email || '').trim().toLowerCase();
        const isAdmin = decoded.role === 'admin' || ADMIN_EMAILS_LIST().includes(normalizedEmail);
        res.json({ authenticated: Boolean(isAdmin) });
    } catch (error) {
        res.json({ authenticated: false });
    }
});

export default router;
