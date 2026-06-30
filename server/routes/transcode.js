/**
 * transcode.js  →  server/routes/transcode.js
 * 
 * Endpoint POST /transcode/hls
 * Pipeline completo:
 *   1. Recibe `src` (URL de video) y `episodeId` (opcional)
 *   2. Genera HLS localmente con ffmpeg
 *   3. Sube la carpeta HLS a Cloudflare R2
 *   4. Guarda stream_url en PostgreSQL si se proporcionó episodeId
 *   5. Elimina la carpeta temporal local
 *   6. Devuelve { ok, stream_url }
 */

import express from 'express';
import crypto from 'crypto';
import { transcodeHls } from '../services/transcodeHlsService.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /transcode/hls
// ---------------------------------------------------------------------------
/**
 * Body JSON:
 *   src        {string}  URL del video a transcodificar [requerido]
 *   episodeId  {number}  ID del episodio en anime_episodes [opcional]
 *
 * Respuesta exitosa:
 *   { ok: true, id, stream_url }
 *
 * Respuesta de error:
 *   { ok: false, error }
 */
router.post('/hls', async (req, res) => {
  const src = req.body?.src || req.query?.src || '';
  const episodeId = req.body?.episodeId ?? null;
  const id = src ? crypto.createHash('md5').update(src).digest('hex') : null;

  if (!src) {
    return res.status(400).json({ ok: false, error: 'El campo "src" es requerido' });
  }

  try {
    const result = await transcodeHls({ src, episodeId });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      id,
      error: err.message,
    });
  }
});

export default router;
