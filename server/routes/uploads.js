import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'fs';
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
    const ext = file.originalname.split('.').pop();
    cb(null, `avatar-${uniqueSuffix}.${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB límite
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Endpoint de prueba para verificar que el servidor está funcionando
router.get('/test', (req, res) => {
  res.json({ message: 'Upload endpoint test OK', timestamp: new Date().toISOString() });
});

// Upload: avatar
router.post('/avatar', upload.single('avatar'), (req, res) => {
  console.log('Request recibido para subir avatar');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Archivo recibido:', req.file ? 'Sí' : 'No');

  try {
    if (!req.file) {
      console.error('No se recibió ningún archivo');
      console.log('Body recibido:', req.body);
      console.log('Headers:', req.headers);
      return res.status(400).json({ message: 'No se proporcionó ninguna imagen' });
    }

    console.log('Archivo recibido:', {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Intentar usar el BASE_URL del cliente si está disponible
    const clientBaseURL = req.headers['x-client-baseurl'];
    let imageUrl;

    if (clientBaseURL) {
      // Usar el BASE_URL del cliente para construir la URL correcta
      imageUrl = `${clientBaseURL}/uploads/avatars/${req.file.filename}`;
      console.log('Usando BASE_URL del cliente:', clientBaseURL);
    } else {
      // Fallback: usar el host del request
      const protocol = req.protocol || 'http';
      const host = req.get('host') || `${process.env.HOST || 'localhost'}:${process.env.PORT || 3001}`;
      imageUrl = `${protocol}://${host}/uploads/avatars/${req.file.filename}`;
      console.log('No se recibió BASE_URL del cliente, usando host del request:', host);
    }

    console.log('Avatar subido exitosamente. URL:', imageUrl);

    res.json({
      url: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('Error al subir avatar:', error);
    res.status(500).json({ message: 'Error al procesar la imagen', error: error.message });
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
