import express from 'express';
import multer from 'multer';
import { mkdirSync, readFileSync, unlinkSync } from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Crear carpeta de uploads si no existe
const uploadsDir = join(__dirname, '..', 'uploads', 'avatars');
try {
  mkdirSync(uploadsDir, { recursive: true });
} catch (error) {
  // La carpeta ya existe o no se pudo crear
}

// Configuración de multer para avatares
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[file.mimetype];
    cb(null, `avatar-${uniqueSuffix}.${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagen no permitido'));

  }
});

// Endpoint de prueba para verificar que el servidor está funcionando
router.get('/test', (req, res) => {
  res.json({ message: 'Upload endpoint test OK', timestamp: new Date().toISOString() });
});

// Upload: avatar
router.post('/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No se proporcionó ninguna imagen' });
  try {
    const bytes = readFileSync(req.file.path);
    const valid = {
      'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      'image/png': bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/gif': ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')),
      'image/webp': bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
    }[req.file.mimetype];
    if (!valid) {
      unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Contenido de imagen inválido' });
    }
    // Fixed production origin: never reflect an untrusted client header or Host.
    const base = process.env.PUBLIC_BASE_URL || 'https://pixelnosekai.com';
    res.json({ url: `${base}/uploads/avatars/${req.file.filename}`, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch {
    try { unlinkSync(req.file.path); } catch {}
    res.status(500).json({ message: 'Error al procesar la imagen' });
  }
});

// Manejo de errores de multer (debe ir DESPUÉS de las rutas que usan multer)
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('Error de Multer:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'El archivo es demasiado grande. Máximo 5MB' });
    }
    return res.status(400).json({ message: 'Error al subir archivo', error: error.message });
  }
  if (error) {
    console.error('Error en upload:', error);
    return res.status(400).json({ message: error.message });
  }
  next();
});

export default router;
