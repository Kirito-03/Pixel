/**
 * r2Service.js
 * Servicio de Cloudflare R2 usando AWS SDK v3 (compatible con S3).
 * Responsabilidades:
 *   - Inicializar el cliente S3 apuntando al endpoint de R2
 *   - Subir un archivo individual con Content-Type correcto
 *   - Subir una carpeta HLS completa (index.m3u8 + segmentos .ts)
 *   - Devolver la URL pública del playlist
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { readFile, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, basename } from 'path';

// ---------------------------------------------------------------------------
// Validación de variables de entorno al momento de importar el módulo
// ---------------------------------------------------------------------------
const REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`[r2Service] Variable de entorno requerida faltante: ${key}`);
  }
}

// ---------------------------------------------------------------------------
// Cliente S3 apuntando a Cloudflare R2
// El endpoint sigue el patrón:
//   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
// ---------------------------------------------------------------------------
const r2Client = new S3Client({
  region: 'auto', // R2 requiere "auto" como región
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  // Forzar path-style para evitar problemas de CNAME
  forcePathStyle: false,
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, ''); // quitar slash final

// ---------------------------------------------------------------------------
// Mapeo de extensiones a Content-Type
// ---------------------------------------------------------------------------
const CONTENT_TYPE_MAP = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts':   'video/mp2t',
  '.mp4':  'video/mp4',
  '.m4s':  'video/iso.segment',
  '.key':  'application/octet-stream',
};

/**
 * Resuelve el Content-Type según la extensión del archivo.
 * @param {string} filePath
 * @returns {string}
 */
function resolveContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// uploadFileToR2
// ---------------------------------------------------------------------------
/**
 * Sube un único archivo a Cloudflare R2.
 *
 * @param {object} options
 * @param {string} options.localPath   - Ruta absoluta del archivo en disco
 * @param {string} options.r2Key       - Clave (path) dentro del bucket, ej: "hls/abc123/index.m3u8"
 * @returns {Promise<string>}          - URL pública del archivo subido
 */
export async function uploadFileToR2({ localPath, r2Key }) {
  if (!existsSync(localPath)) {
    throw new Error(`[r2Service] Archivo no encontrado: ${localPath}`);
  }

  const fileBody = await readFile(localPath);
  const contentType = resolveContentType(localPath);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    Body: fileBody,
    ContentType: contentType,
    // Los archivos .m3u8 no deben cachearse agresivamente
    CacheControl: contentType === 'application/vnd.apple.mpegurl'
      ? 'no-store'
      : 'public, max-age=86400',
  });

  await r2Client.send(command);

  const publicUrl = `${PUBLIC_URL}/${r2Key}`;
  console.log(`[r2Service] ✅ Subido: ${r2Key} → ${publicUrl}`);
  return publicUrl;
}

// ---------------------------------------------------------------------------
// uploadHlsFolderToR2
// ---------------------------------------------------------------------------
/**
 * Sube una carpeta HLS completa (index.m3u8 + todos los .ts) a R2.
 * La estructura en R2 será: hls/<hlsId>/index.m3u8
 *                            hls/<hlsId>/segment000.ts  ...
 *
 * @param {object} options
 * @param {string} options.localDir  - Ruta absoluta de la carpeta local (ej: server/hls/abc123)
 * @param {string} options.hlsId     - Identificador único del stream (md5 del src)
 * @returns {Promise<string>}        - URL pública del index.m3u8
 */
export async function uploadHlsFolderToR2({ localDir, hlsId }) {
  if (!existsSync(localDir)) {
    throw new Error(`[r2Service] Directorio HLS no encontrado: ${localDir}`);
  }

  const files = await readdir(localDir);

  if (files.length === 0) {
    throw new Error(`[r2Service] El directorio HLS está vacío: ${localDir}`);
  }

  // Verificar que exista index.m3u8
  if (!files.includes('index.m3u8')) {
    throw new Error(`[r2Service] No se encontró index.m3u8 en: ${localDir}`);
  }

  // Subir todos los archivos en paralelo
  const uploads = files.map((fileName) => {
    const localPath = join(localDir, fileName);
    const r2Key = `hls/${hlsId}/${fileName}`;
    return uploadFileToR2({ localPath, r2Key });
  });

  await Promise.all(uploads);

  const playlistUrl = `${PUBLIC_URL}/hls/${hlsId}/index.m3u8`;
  console.log(`[r2Service] 🎉 Carpeta HLS subida: hls/${hlsId}/ → ${playlistUrl}`);
  return playlistUrl;
}

// ---------------------------------------------------------------------------
// deleteLocalHlsFolder
// ---------------------------------------------------------------------------
/**
 * Elimina la carpeta HLS temporal del disco local tras una subida exitosa.
 *
 * @param {string} localDir - Ruta absoluta de la carpeta a eliminar
 * @returns {Promise<void>}
 */
export async function deleteLocalHlsFolder(localDir) {
  if (!existsSync(localDir)) {
    console.warn(`[r2Service] ⚠️  Carpeta ya no existe, skip: ${localDir}`);
    return;
  }
  await rm(localDir, { recursive: true, force: true });
  console.log(`[r2Service] 🗑️  Carpeta local eliminada: ${localDir}`);
}

export async function deleteR2Prefix(prefix) {
  const cleanPrefix = String(prefix || '').replace(/^\/+/, '');
  if (!cleanPrefix) return { deleted: 0 };

  let continuationToken = undefined;
  let deleted = 0;

  while (true) {
    const listed = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: cleanPrefix,
        ContinuationToken: continuationToken,
      })
    );

    const contents = Array.isArray(listed?.Contents) ? listed.Contents : [];
    const keys = contents.map((o) => o?.Key).filter(Boolean);

    if (keys.length) {
      const chunks = [];
      for (let i = 0; i < keys.length; i += 1000) chunks.push(keys.slice(i, i + 1000));
      for (const chunk of chunks) {
        await r2Client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
          })
        );
        deleted += chunk.length;
      }
    }

    if (!listed?.IsTruncated) break;
    continuationToken = listed?.NextContinuationToken;
    if (!continuationToken) break;
  }

  console.log(`[r2Service] 🗑️  Eliminados ${deleted} objetos bajo: ${cleanPrefix}`);
  return { deleted };
}
