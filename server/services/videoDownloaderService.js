import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { uploadFileToR2 } from './r2Service.js';
import pool from '../db.js';
import { File } from 'megajs';

/**
 * Descarga un video (mp4 o m3u8) usando ffmpeg y lo sube a Cloudflare R2
 * @param {number} episodeId - ID del episodio en la BD
 * @param {string} videoUrl - URL directa del video (.mp4 o .m3u8)
 * @param {string} animeSlug - Slug del anime para organizar carpetas en R2
 * @param {number} episodeNumber - Número del episodio
 */
export async function downloadAndUploadEpisode(episodeId, videoUrl, animeSlug, episodeNumber) {
  if (videoUrl.includes('mega.nz')) {
    const cleanUrl = videoUrl.replace('/embed/', '/file/');
    return handleMegaDownload(episodeId, cleanUrl, animeSlug, episodeNumber);
  }
  return handleFfmpegDownload(episodeId, videoUrl, animeSlug, episodeNumber);
}

function handleMegaDownload(episodeId, videoUrl, animeSlug, episodeNumber) {
  return new Promise(async (resolve, reject) => {
    const tmpDir = '/tmp';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const fileName = `${animeSlug}_ep${episodeNumber}_mega.mp4`;
    const outputPath = path.join(tmpDir, fileName);
    
    console.log(`[Downloader] Iniciando descarga MEGA de ${animeSlug} ep ${episodeNumber}...`);
    
    try {
      const file = File.fromURL(videoUrl);
      await file.loadAttributes();
      
      const stream = file.download();
      const writeStream = fs.createWriteStream(outputPath);
      
      stream.pipe(writeStream);
      
      stream.on('error', (err) => {
        console.error(`[Downloader] Error stream MEGA:`, err);
        reject(err);
      });
      
      writeStream.on('error', (err) => {
        console.error(`[Downloader] Error escribiendo MEGA:`, err);
        reject(err);
      });
      
      writeStream.on('finish', async () => {
        console.log(`[Downloader] Descarga MEGA local completada: ${outputPath}`);
        try {
          const r2Key = `anime/${animeSlug}/${fileName}`;
          const r2Url = await uploadFileToR2({ localPath: outputPath, r2Key });
          
          await pool.query('UPDATE anime_episodes SET video_url = $1 WHERE id = $2', [r2Url, episodeId]);
          fs.unlinkSync(outputPath);
          resolve(r2Url);
        } catch (err) {
          console.error(`[Downloader] Error MEGA subida R2:`, err.message);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          reject(err);
        }
      });
    } catch (err) {
      console.error(`[Downloader] Error iniciando MEGA:`, err);
      reject(err);
    }
  });
}

function handleFfmpegDownload(episodeId, videoUrl, animeSlug, episodeNumber) {
  return new Promise((resolve, reject) => {
    // Usar el directorio /tmp (válido dentro del contenedor Docker de Linux)
    const tmpDir = '/tmp';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const fileName = `${animeSlug}_ep${episodeNumber}.mp4`;
    const outputPath = path.join(tmpDir, fileName);
    
    console.log(`[Downloader] Iniciando descarga de ${animeSlug} ep ${episodeNumber}...`);
    console.log(`[Downloader] Origen: ${videoUrl}`);

    // Ejecutar ffmpeg para descargar el flujo a un archivo mp4 local
    // -c copy asegura que no haya recodificación (rápido)
    // -y sobrescribe si ya existe
    const ffmpegArgs = [
      '-i', videoUrl,
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc', // Asegurar compatibilidad de audio al pasar de HLS a MP4
      '-y',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    let errorOutput = '';

    ffmpegProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // ffmpeg imprime su progreso en stderr
    });

    ffmpegProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error(`[Downloader] Error ffmpeg: ${errorOutput}`);
        return reject(new Error(`FFmpeg falló con código ${code}`));
      }

      console.log(`[Downloader] Descarga completada: ${outputPath}`);

      try {
        // Subir a R2
        console.log(`[Downloader] Subiendo a R2...`);
        const r2Key = `anime/${animeSlug}/${fileName}`;
        const r2Url = await uploadFileToR2({ localPath: outputPath, r2Key });
        console.log(`[Downloader] Subida a R2 exitosa: ${r2Url}`);

        // Actualizar la base de datos
        await pool.query(
          'UPDATE anime_episodes SET video_url = $1 WHERE id = $2',
          [r2Url, episodeId]
        );
        console.log(`[Downloader] Episodio ${episodeId} actualizado en la BD.`);

        // Limpiar archivo temporal
        fs.unlinkSync(outputPath);
        console.log(`[Downloader] Archivo temporal limpiado.`);

        resolve(r2Url);
      } catch (err) {
        console.error(`[Downloader] Error al subir a R2 o actualizar BD:`, err.message);
        // Intentar limpiar
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        reject(err);
      }
    });
  });
}
