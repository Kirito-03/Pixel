import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import session from 'express-session';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import pool from './db.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const hasNewsApiKey = !!(process.env.NEWSAPI_KEY && String(process.env.NEWSAPI_KEY).trim());
const newsApiKeyPreview = hasNewsApiKey
  ? `${String(process.env.NEWSAPI_KEY).trim().slice(0, 4)}…(${String(process.env.NEWSAPI_KEY).trim().length})`
  : 'MISSING';
console.log('[News] NEWSAPI_KEY:', newsApiKeyPreview);

// ── Import routers existentes ──────────────────────────────────
const { default: authRoutes }             = await import('./routes/auth.js');
const { default: adminRoutes }            = await import('./routes/admin.js');
const { default: userRoutes }             = await import('./routes/user.js');
const { default: transcodeRoutes }        = await import('./routes/transcode.js');
const { default: catalogRoutes }          = await import('./routes/catalog.js');
const { default: myListRoutes }           = await import('./routes/myList.js');
const { default: progressRoutes }         = await import('./routes/progress.js');
const { default: continueWatchingRoutes } = await import('./routes/continueWatching.js');
const { default: resumeTargetRoutes }     = await import('./routes/resumeTarget.js');
const { default: newsRoutes }             = await import('./routes/news.js');
const { default: mangaRoutes }            = await import('./routes/manga.js');

// ── Import routers nuevos ──────────────────────────────────────
const { default: userAuthRoutes }   = await import('./routes/userAuth.js');
const { default: profilesRoutes }   = await import('./routes/profiles.js');
const { default: downloadsRoutes }  = await import('./routes/downloads.js');
const { default: proxyRoutes }      = await import('./routes/proxy.js');
const { default: uploadsRoutes }    = await import('./routes/uploads.js');
const { default: contentRoutes }    = await import('./routes/content.js');
const { default: botRoutes }        = await import('./routes/bot.js');
const { default: schedulesRoutes }  = await import('./routes/schedules.js');

// ── Express app ────────────────────────────────────────────────
const app = express();

// Confiar en el proxy (Cloudflare/Traefik) para express-rate-limit
app.set('trust proxy', 1);

// Seguridad: Cabeceras HTTP
app.use(helmet({
  crossOriginResourcePolicy: false, // Permitir que la app móvil acceda a recursos estáticos (imágenes/videos)
}));

// Seguridad: Rate Limiting Global (1000 peticiones por 15 min por IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde.' }
});
app.use(globalLimiter);

// Configuración estricta de CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:8081', 'http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por la política CORS: ' + origin + ' no permitido'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Aceptar tanto mayúsculas como minúsculas para el header personalizado
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Client-BaseURL', 'x-client-baseurl', 'X-Profile-Id', 'x-profile-id', 'X-Perfil-Id', 'x-perfil-id'],
  exposedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cookie parser para JWT
app.use(cookieParser());

// Session middleware para OAuth
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' 
  ? (() => { throw new Error('CRÍTICO: SESSION_SECRET es requerido en producción por seguridad'); })()
  : 'pixel-session-secret-default');

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// ── Archivos estáticos ─────────────────────────────────────────
app.use('/videos', express.static(join(__dirname, 'videos')));
app.use('/uploads', express.static(join(__dirname, 'uploads')));
app.use('/hls', express.static(join(__dirname, 'hls')));

// Admin panel
const adminDir = join(__dirname, 'admin');
try {
  mkdirSync(adminDir, { recursive: true });
  console.log('Admin panel directory ready:', adminDir);
} catch (error) {
  console.log('Admin panel directory already exists or error:', error.message);
}
app.use('/admin', express.static(adminDir));

// ── Middleware de logging (dev) ────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}

// ── Health endpoints ───────────────────────────────────────────
app.get('/health', async (req, res) => {
  const status = {
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: { ok: false },
  };
  try {
    const result = await pool.query('SELECT 1 as ok');
    status.db.ok = true;
  } catch (e) {
    status.db.ok = false;
    status.db.error = e.message;
  }
  res.status(200).json(status);
});

app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as ok');
    res.json({ ok: true, rows: result.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Montar routers ─────────────────────────────────────────────

// Rate Limiter más estricto para rutas de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30, // 30 intentos por IP
  message: { message: 'Demasiados intentos de autenticación. Intenta de nuevo en 15 minutos.' }
});

// User auth (register, login, forgot/reset password) — debe ir ANTES de authRoutes
app.use('/auth', authLimiter, userAuthRoutes);
// Admin auth (Google OAuth, Firebase, admin/me, admin/logout, admin/check)
app.use('/auth', authLimiter, authRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/admin/bot', botRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/user', userRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/manga', mangaRoutes);
app.use('/transcode', transcodeRoutes);
app.use('/my-list', myListRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/progress', progressRoutes);
app.use('/continue-watching', continueWatchingRoutes);
app.use('/resume-target', resumeTargetRoutes);

// Proxy: cors-proxy va bajo /api, translate y anilist bajo /proxy
app.use('/api', proxyRoutes);
app.use('/proxy', proxyRoutes);

// Nuevos routers extraídos
app.use('/profiles', profilesRoutes);
app.use('/downloads', downloadsRoutes);
app.use('/upload', uploadsRoutes);
app.use('/content', contentRoutes);

// ── Rutas legacy de my-list (param-based) ──────────────────────
// Estas rutas usan /my-list/:perfilId — distinto al header-based de myList.js
app.get('/my-list/:perfilId', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  if (!perfilId) return res.status(400).json({ message: 'perfilId requerido' });
  try {
    const listasResult = await pool.query("SELECT id FROM listas WHERE perfil_id = $1 AND type = 'MY_LIST'", [perfilId]);
    if (!listasResult.rows.length) return res.json([]);
    const listaId = listasResult.rows[0].id;
    const itemsResult = await pool.query(
      'SELECT content_id, content_type, added_at FROM lista_items WHERE lista_id = $1 ORDER BY added_at DESC',
      [listaId]
    );
    res.json(itemsResult.rows);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener Mi lista', error: e.message });
  }
});

app.post('/my-list/:perfilId/items', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  const { content_id, content_type } = req.body || {};
  if (!perfilId || !content_id || !content_type) return res.status(400).json({ message: 'Datos incompletos' });
  const allowedTypes = ['movie', 'tv', 'anime'];
  if (!allowedTypes.includes(String(content_type).toLowerCase())) {
    return res.status(400).json({ message: 'Tipo de contenido inválido', allowed: allowedTypes });
  }
  try {
    const listasResult = await pool.query("SELECT id FROM listas WHERE perfil_id = $1 AND type = 'MY_LIST'", [perfilId]);
    if (!listasResult.rows.length) return res.status(404).json({ message: 'Mi lista no encontrada' });
    const listaId = listasResult.rows[0].id;
    await pool.query(
      'INSERT INTO lista_items (lista_id, content_id, content_type) VALUES ($1, $2, $3) ON CONFLICT (lista_id, content_id, content_type) DO UPDATE SET added_at = CURRENT_TIMESTAMP',
      [listaId, content_id, content_type]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al añadir a Mi lista', error: e.message });
  }
});

app.delete('/my-list/:perfilId/items/:contentId/:type', async (req, res) => {
  const perfilId = Number(req.params.perfilId);
  const contentId = Number(req.params.contentId);
  const type = req.params.type;
  if (!perfilId || !contentId || !type) return res.status(400).json({ message: 'Datos incompletos' });
  const allowedTypes = ['movie', 'tv', 'anime'];
  if (!allowedTypes.includes(String(type).toLowerCase())) {
    return res.status(400).json({ message: 'Tipo de contenido inválido', allowed: allowedTypes });
  }
  try {
    const listasResult = await pool.query("SELECT id FROM listas WHERE perfil_id = $1 AND type = 'MY_LIST'", [perfilId]);
    if (!listasResult.rows.length) return res.status(404).json({ message: 'Mi lista no encontrada' });
    const listaId = listasResult.rows[0].id;
    await pool.query('DELETE FROM lista_items WHERE lista_id = $1 AND content_id = $2 AND content_type = $3', [listaId, contentId, type]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al quitar de Mi lista', error: e.message });
  }
});

// ── Images metadata ────────────────────────────────────────────
app.post('/images', async (req, res) => {
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

app.get('/images/:entity_type/:entity_id', async (req, res) => {
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

// ── Users: get by id ───────────────────────────────────────────
app.get('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'id requerido' });
  try {
    const result = await pool.query('SELECT id, email, created_at FROM usuarios WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener usuario', error: e.message });
  }
});

// ── Videos: serve M3U file ─────────────────────────────────────
app.get('/videos/animes_madre.m3u', (req, res) => {
  try {
    const m3uPath = join(__dirname, 'videos', 'animes_madre.m3u');
    const content = readFileSync(m3uPath, 'utf-8');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Content-Disposition', 'inline; filename="animes_madre.m3u"');
    res.send(content);
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener archivo M3U', error: e.message });
  }
});

export default app;
