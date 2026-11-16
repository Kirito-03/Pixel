#!/usr/bin/env node
/**
 * Pixel No Sekai - Google Drive Ingest & Optimizer CLI
 *
 * Usage:
 *   node tools/pixel-drive-ingest.mjs --anime-id 5
 *   node tools/pixel-drive-ingest.mjs --episode-id 85
 *   node tools/pixel-drive-ingest.mjs --batch --limit 5
 */

import { existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

import { spawn, spawnSync } from 'node:child_process';
const { default: pool } = await import('../server/db.js');

const INGEST_DIR = join(homedir(), 'server/data/pixel-ingest');
const RCLONE_REMOTE = 'pixel-drive:PixelNoSekai';
const RCLONE_BIN = existsSync('/data/data/com.termux/files/usr/bin/rclone') ? '/data/data/com.termux/files/usr/bin/rclone' : 'rclone';
const YTDLP_BIN = process.env.PIXEL_YTDLP_BIN || join(homedir(), 'server/tools/media-resolver/bin/yt-dlp');
const FFMPEG_BIN = process.env.PIXEL_FFMPEG_BIN || 'ffmpeg';
const FFPROBE_BIN = process.env.PIXEL_FFPROBE_BIN || 'ffprobe';
const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream';

if (!existsSync(INGEST_DIR)) {
  mkdirSync(INGEST_DIR, { recursive: true, mode: 0o700 });
}

function runCommand(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit', ...options });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${bin} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function runCapture(bin, args) {
  const res = spawnSync(bin, args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(res.stderr || `Command ${bin} exited with status ${res.status}`);
  }
  return res.stdout.trim();
}

/** Check remote file size (> 0 if exists) checking local rclone HTTP server first (<50ms), then rclone ls */
function getRemoteFileSize(remotePath) {
  try {
    const rel = String(remotePath).replace(/^pixel-drive:PixelNoSekai\/?/, '');
    const encodedRel = rel.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const httpCheck = spawnSync('curl', ['-sI', '-f', '--max-time', '4', `http://127.0.0.1:8086/${encodedRel}`], { encoding: 'utf8' });
    if (httpCheck.status === 0) {
      const lenMatch = (httpCheck.stdout || '').match(/Content-Length:\s*(\d+)/i);
      const bytes = lenMatch ? Number(lenMatch[1]) : 0;
      if (bytes > 0) return bytes;
    }
  } catch {}
  try {
    const out = runCapture(RCLONE_BIN, ['ls', remotePath]);
    if (!out) return 0;
    const match = out.match(/^\s*(\d+)\s+/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/** Check if a remote path exists in Google Drive */
function remoteFileExists(remotePath) {
  return getRemoteFileSize(remotePath) > 0;
}

const RCLONE_THROTTLE = ['--transfers', '1', '--checkers', '2', '--bwlimit', '8M'];

/** Download poster, banner & trailer if not already in Drive */
export async function syncAnimeImages(animeId) {
  const { rows } = await pool.query(
    'SELECT id, title, poster_url, banner_url, trailer_id, trailer_site FROM anime_content WHERE id = $1',
    [animeId]
  );
  if (!rows.length) return false;
  const anime = rows[0];

  const posterRemote = `${RCLONE_REMOTE}/Anime/${animeId}/poster.jpg`;
  if (anime.poster_url && !remoteFileExists(posterRemote)) {
    console.log(`[DriveIngest] Sincronizando portada de anime ${animeId} (${anime.title})...`);
    const tmpPoster = join(INGEST_DIR, `tmp_poster_${animeId}.jpg`);
    try {
      await runCommand('curl', ['-sS', '-L', '--max-time', '60', anime.poster_url, '-o', tmpPoster]);
      if (existsSync(tmpPoster) && statSync(tmpPoster).size > 500) {
        await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpPoster, posterRemote]);
        if (getRemoteFileSize(posterRemote) > 500) {
          console.log(`[DriveIngest] ✓ Portada subida a Drive: ${posterRemote}`);
        }
      }
    } catch (e) {
      console.error(`[DriveIngest] Error subiendo portada:`, e.message);
    } finally {
      if (existsSync(tmpPoster)) unlinkSync(tmpPoster);
    }
  }

  const bannerRemote = `${RCLONE_REMOTE}/Anime/${animeId}/banner.jpg`;
  if (anime.banner_url && !remoteFileExists(bannerRemote)) {
    console.log(`[DriveIngest] Sincronizando banner de anime ${animeId}...`);
    const tmpBanner = join(INGEST_DIR, `tmp_banner_${animeId}.jpg`);
    try {
      await runCommand('curl', ['-sS', '-L', '--max-time', '60', anime.banner_url, '-o', tmpBanner]);
      if (existsSync(tmpBanner) && statSync(tmpBanner).size > 500) {
        await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpBanner, bannerRemote]);
        if (getRemoteFileSize(bannerRemote) > 500) {
          console.log(`[DriveIngest] ✓ Banner subido a Drive: ${bannerRemote}`);
        }
      }
    } catch (e) {
      console.error(`[DriveIngest] Error subiendo banner:`, e.message);
    } finally {
      if (existsSync(tmpBanner)) unlinkSync(tmpBanner);
    }
  }

  const trailerRemote = `${RCLONE_REMOTE}/Anime/${animeId}/trailer.mp4`;
  if (!anime.trailer_id) return false;

  const existingTrailerSize = getRemoteFileSize(trailerRemote);
  if (existingTrailerSize > 10240) {
    if (String(anime.trailer_site || '').toLowerCase() !== 'gdrive') {
      await pool.query(
        `UPDATE anime_content SET trailer_site = 'gdrive', updated_at = NOW() WHERE id = $1`,
        [animeId]
      );
      console.log(`[DriveIngest] ✓ Trailer ya existía en Drive (${existingTrailerSize} bytes); BD vinculada (Anime ${animeId}).`);
    }
    return true;
  }

  console.log(`[DriveIngest] Descargando trailer de anime ${animeId} (${anime.trailer_id})...`);
  const tmpTrailer = join(INGEST_DIR, `tmp_trailer_${animeId}.mp4`);
  const ytDlpCmd = existsSync(YTDLP_BIN) ? YTDLP_BIN : 'yt-dlp';
  try {
    await runCommand(ytDlpCmd, [
      '--force-ipv4',
      '--socket-timeout', '20',
      '--retries', '2',
      '--no-playlist',
      '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best',
      '--merge-output-format', 'mp4',
      `https://www.youtube.com/watch?v=${anime.trailer_id}`,
      '-o', tmpTrailer,
    ]);
    const localSize = existsSync(tmpTrailer) ? statSync(tmpTrailer).size : 0;
    if (localSize <= 10240) {
      throw new Error(`Trailer descargado inválido o vacío (${localSize} bytes)`);
    }
    await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpTrailer, trailerRemote]);
    const remoteSize = getRemoteFileSize(trailerRemote);
    if (remoteSize <= 10240 || remoteSize < Math.floor(localSize * 0.95)) {
      throw new Error(`Verificación de trailer en Drive falló (${remoteSize} / ${localSize} bytes)`);
    }
    await pool.query(
      `UPDATE anime_content SET trailer_site = 'gdrive', trailer_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [animeId]
    );
    console.log(`[DriveIngest] ✓ Trailer verificado y vinculado en Drive (${remoteSize} bytes): ${trailerRemote}`);
    return true;
  } catch (e) {
    await pool.query(`UPDATE anime_content SET trailer_checked_at = NOW() WHERE id = $1`, [animeId]).catch(() => {});
    console.error(`[DriveIngest] Error subiendo trailer (Anime ${animeId}):`, e.message);
    return false;
  } finally {
    if (existsSync(tmpTrailer)) unlinkSync(tmpTrailer);
  }
}

/** Resolve direct video URL from external servers */
function resolveVideoUrl(externalServers) {
  if (!Array.isArray(externalServers)) return null;
  // Priority order: MP4Upload -> YourUpload -> direct .mp4 -> others
  const supported = externalServers.find((s) => {
    const url = String(s?.url || '');
    return url.includes('mp4upload.com') || url.includes('yourupload.com') || /\.mp4(\?|$)/i.test(url);
  });
  if (!supported) return null;

  try {
    const ytDlpCmd = existsSync(YTDLP_BIN) ? YTDLP_BIN : 'yt-dlp';
    const directUrl = runCapture(ytDlpCmd, ['--force-ipv4', '--socket-timeout', '20', '-g', supported.url]);
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      return { directUrl, referer: supported.url, serverName: supported.server };
    }
  } catch (e) {
    console.error(`[DriveIngest] Error resolviendo con yt-dlp:`, e.message);
  }
  return null;
}

/** Process a single episode: download, optimize (720p or remux), upload to Drive, update DB */
export async function ingestEpisode(episodeId) {
  const { rows } = await pool.query(
    'SELECT id, anime_id, episode_number, title, external_servers, stream_url, thumbnail_url FROM anime_episodes WHERE id = $1',
    [episodeId]
  );
  if (!rows.length) {
    console.log(`[DriveIngest] Episodio ${episodeId} no encontrado en BD.`);
    return false;
  }
  const ep = rows[0];
  const animeId = ep.anime_id;
  const epNum = ep.episode_number;

  await syncAnimeImages(animeId);

  const driveRemoteTarget = `${RCLONE_REMOTE}/Anime/${animeId}/${epNum}/episode.mp4`;
  const publicStreamUrl = `${BASE_STREAM_URL}/Anime/${animeId}/${epNum}/episode.mp4`;

  // 1. Check if already uploaded (must be > 100 KB)
  const existingSize = getRemoteFileSize(driveRemoteTarget);
  if (existingSize > 102400) {
    console.log(`[DriveIngest] Episodio ${episodeId} (Anime ${animeId} Ep ${epNum}) ya existe en Drive (${existingSize} bytes).`);
    await updateDatabaseRecord(episodeId, publicStreamUrl, existingSize);
    return true;
  }

  // 2. Resolve source
  const resolved = resolveVideoUrl(ep.external_servers);
  if (!resolved) {
    console.log(`[DriveIngest] No se encontró servidor compatible (MP4Upload/YourUpload/mp4) para Ep ${episodeId}.`);
    return false;
  }

  console.log(`[DriveIngest] Descargando Ep ${episodeId} desde ${resolved.serverName}...`);
  const tmpDownload = join(INGEST_DIR, `raw_${episodeId}.mp4`);
  const tmpProcessed = join(INGEST_DIR, `opt_${episodeId}.mp4`);

  try {
    // Download via curl with referer
    const curlArgs = ['-sS', '-L', '--max-time', '1800'];
    if (resolved.referer) {
      curlArgs.push('-e', resolved.referer);
    }
    curlArgs.push(resolved.directUrl, '-o', tmpDownload);
    await runCommand('curl', curlArgs);

    const stats = statSync(tmpDownload);
    const sizeMb = stats.size / (1024 * 1024);
    console.log(`[DriveIngest] Descargado (${sizeMb.toFixed(1)} MB). Procesando...`);

    // 3. Optimization strategy
    // If <= 140MB, simply apply faststart (5-10s)
    // If > 140MB, encode to 720p CRF 26 with tune animation
    if (sizeMb <= 140) {
      console.log(`[DriveIngest] Peso adecuado (<= 140 MB). Aplicando faststart directo (copia rápida)...`);
      await runCommand(FFMPEG_BIN, [
        '-y', '-i', tmpDownload,
        '-c', 'copy',
        '-movflags', '+faststart',
        tmpProcessed,
      ]);
    } else {
      console.log(`[DriveIngest] Comprimiendo a 720p Ultra-Liviano (CRF 26 + tune animation, 2 hilos)...`);
      await runCommand(FFMPEG_BIN, [
        '-y', '-i', tmpDownload,
        '-threads', '2',
        '-vf', 'scale=1280:-2',
        '-c:v', 'libx264',
        '-crf', '26',
        '-preset', 'veryfast',
        '-tune', 'animation',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        tmpProcessed,
      ]);
    }

    const optStats = statSync(tmpProcessed);
    const optSizeMb = optStats.size / (1024 * 1024);
    console.log(`[DriveIngest] Archivo optimizado: ${optSizeMb.toFixed(1)} MB. Subiendo a Google Drive...`);

    // 4. Upload to Drive (throttled) and verify integrity
    await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpProcessed, driveRemoteTarget]);
    const verifiedSize = getRemoteFileSize(driveRemoteTarget);
    if (verifiedSize < Math.floor(optStats.size * 0.95) || verifiedSize <= 102400) {
      throw new Error(`Verificación de integridad falló en Drive (${verifiedSize} / ${optStats.size} bytes)`);
    }
    console.log(`[DriveIngest] ✓ Subido y verificado en Drive (${verifiedSize} bytes): ${driveRemoteTarget}`);

    // 5. Update Database
    await updateDatabaseRecord(episodeId, publicStreamUrl, verifiedSize);

    // 6. Generate single-frame thumbnail from temp file before deleting it (if not already set)
    if (!ep.thumbnail_url) {
      await generateAndUploadEpisodeThumbnail(episodeId, animeId, epNum, tmpProcessed).catch((e) => {
        console.warn(`[DriveIngest] No se pudo generar miniatura para Ep ${episodeId}:`, e.message);
      });
    }
    return true;
  } catch (err) {
    console.error(`[DriveIngest] Fallo en episodio ${episodeId}:`, err.message);
    return false;
  } finally {
    if (existsSync(tmpDownload)) unlinkSync(tmpDownload);
    if (existsSync(tmpProcessed)) unlinkSync(tmpProcessed);
  }
}

/** Add Pixel VIP (Drive) to external_servers and set stream_url + storage_type = 'gdrive' */
async function updateDatabaseRecord(episodeId, streamUrl, fileSize = null) {
  const vipServer = { server: 'Pixel VIP (Drive)', url: streamUrl };
  await pool.query(
    `
      UPDATE anime_episodes
      SET stream_url = $1,
          storage_type = 'gdrive',
          file_size = COALESCE($4, file_size),
          external_servers = jsonb_insert(
            COALESCE(
              (
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(COALESCE(external_servers::jsonb, '[]'::jsonb)) elem
                WHERE elem->>'server' != 'Pixel VIP (Drive)'
              ),
              '[]'::jsonb
            ),
            '{0}',
            $2::jsonb
          )
      WHERE id = $3
    `,
    [streamUrl, JSON.stringify(vipServer), episodeId, fileSize]
  );
  console.log(`[DriveIngest] ✓ Base de datos actualizada para Ep ${episodeId}: Servidor VIP disponible (GDrive).`);
}

function getVideoDurationSeconds(inputPathOrUrl) {
  try {
    const out = runCapture(FFPROBE_BIN, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPathOrUrl,
    ]);
    const secs = parseFloat(out);
    return Number.isFinite(secs) && secs > 0 ? Math.floor(secs) : 0;
  } catch {
    return 0;
  }
}

function pickThumbnailTimestamp(durationSeconds) {
  const minTarget = 6 * 60; // 360s (minuto 6)
  const maxTarget = 19 * 60; // 1140s (minuto 19)
  if (durationSeconds >= maxTarget + 20) {
    return Math.floor(minTarget + Math.random() * (maxTarget - minTarget + 1));
  }
  if (durationSeconds > minTarget + 40) {
    const upper = Math.floor(durationSeconds - 20);
    return Math.floor(minTarget + Math.random() * Math.max(1, upper - minTarget + 1));
  }
  if (durationSeconds > 20) {
    const low = Math.max(5, Math.floor(durationSeconds * 0.25));
    const high = Math.max(low + 1, Math.floor(durationSeconds * 0.8));
    return Math.floor(low + Math.random() * (high - low + 1));
  }
  return 5;
}

/** Extract 1 JPEG frame from local file or Drive HTTP stream without re-encoding video */
export async function generateAndUploadEpisodeThumbnail(episodeId, animeId, epNum, sourcePathOrUrl) {
  const thumbRemote = `${RCLONE_REMOTE}/Anime/${animeId}/${epNum}/thumb.jpg`;
  const publicThumbUrl = `${BASE_STREAM_URL}/Anime/${animeId}/${epNum}/thumb.jpg`;

  const existingThumbSize = getRemoteFileSize(thumbRemote);
  if (existingThumbSize > 1000) {
    await pool.query(
      `UPDATE anime_episodes SET thumbnail_url = COALESCE(NULLIF(thumbnail_url, ''), $1), updated_at = NOW() WHERE id = $2`,
      [publicThumbUrl, episodeId]
    );
    return true;
  }

  const durationSecs = getVideoDurationSeconds(sourcePathOrUrl);
  const captureAt = pickThumbnailTimestamp(durationSecs);
  const tmpThumb = join(INGEST_DIR, `tmp_thumb_${episodeId}.jpg`);

  try {
    console.log(`[DriveThumb] Extrayendo fotograma único Ep ${episodeId} en t=${captureAt}s (duración=${durationSecs || '?'}s)...`);
    await runCommand(FFMPEG_BIN, [
      '-y',
      '-ss', String(captureAt),
      '-i', sourcePathOrUrl,
      '-frames:v', '1',
      '-vf', 'scale=480:-2',
      '-q:v', '4',
      tmpThumb,
    ]);
    const localSize = existsSync(tmpThumb) ? statSync(tmpThumb).size : 0;
    if (localSize <= 1000) {
      throw new Error(`Miniatura inválida o vacía (${localSize} bytes)`);
    }
    await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpThumb, thumbRemote]);
    const verifiedThumb = getRemoteFileSize(thumbRemote);
    if (verifiedThumb <= 1000) {
      throw new Error(`Verificación de miniatura en Drive falló (${verifiedThumb} bytes)`);
    }
    await pool.query(
      `UPDATE anime_episodes
       SET thumbnail_url = $1,
           duration = COALESCE(duration, $2),
           updated_at = NOW()
       WHERE id = $3 AND (thumbnail_url IS NULL OR thumbnail_url = '')`,
      [publicThumbUrl, durationSecs > 0 ? durationSecs : null, episodeId]
    );
    console.log(`[DriveThumb] ✓ Miniatura guardada y verificada (${verifiedThumb} B): ${publicThumbUrl}`);
    return true;
  } finally {
    if (existsSync(tmpThumb)) unlinkSync(tmpThumb);
  }
}

/** Generate thumbnails 1-at-a-time for episodes already in Drive missing thumbnail_url */
export async function ingestBatchThumbnails(limit = 1) {
  const safeLimit = Math.min(5, Math.max(1, Number(limit) || 1));
  console.log(`[DriveThumb] Buscando hasta ${safeLimit} episodios en Drive sin miniatura...`);
  const { rows } = await pool.query(
    `SELECT id, anime_id, episode_number
     FROM anime_episodes
     WHERE is_active = true
       AND stream_url LIKE '%/api/stream/Anime/%'
       AND (thumbnail_url IS NULL OR thumbnail_url = '')
     ORDER BY anime_id ASC, episode_number ASC
     LIMIT $1`,
    [safeLimit]
  );
  let done = 0;
  for (const row of rows) {
    const httpSrc = `http://127.0.0.1:8086/Anime/${row.anime_id}/${row.episode_number}/episode.mp4`;
    try {
      if (await generateAndUploadEpisodeThumbnail(row.id, row.anime_id, row.episode_number, httpSrc)) {
        done++;
      }
    } catch (e) {
      console.warn(`[DriveThumb] Error en Ep ${row.id}:`, e.message);
    }
  }
  console.log(`[DriveThumb] ✓ Lote de miniaturas terminado: ${done}/${rows.length}`);
  return { total: rows.length, done };
}

/** Sync pending anime trailers to Google Drive in small batches */
export async function ingestBatchTrailers(limit = 3) {
  console.log(`[DriveIngest] Buscando hasta ${limit} trailers pendientes para Drive...`);
  const { rows } = await pool.query(
    `
      SELECT id, title, trailer_id, trailer_site
      FROM anime_content
      WHERE is_active = true
        AND trailer_id IS NOT NULL
        AND trailer_id != ''
        AND (trailer_site IS NULL OR LOWER(trailer_site) != 'gdrive')
      ORDER BY trailer_checked_at ASC NULLS FIRST, id ASC
      LIMIT $1
    `,
    [limit]
  );
  console.log(`[DriveIngest] Procesando lote de ${rows.length} trailers...`);
  let synced = 0;
  for (const row of rows) {
    if (await syncAnimeImages(row.id)) synced++;
  }
  console.log(`[DriveIngest] ✓ Lote de trailers terminado: ${synced}/${rows.length} en Drive.`);
  return { total: rows.length, synced };
}

/** CLI entrypoint */
async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const parsedLimit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : NaN;

  if (args.includes('--thumbnails')) {
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1;
    await ingestBatchThumbnails(limit);
  } else if (args.includes('--trailers')) {
    if (args.includes('--anime-id')) {
      const animeId = Number(args[args.indexOf('--anime-id') + 1]);
      if (!animeId) throw new Error('ID de anime inválido');
      await syncAnimeImages(animeId);
    } else {
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 3;
      await ingestBatchTrailers(limit);
    }
  } else if (args.includes('--episode-id')) {
    const epId = Number(args[args.indexOf('--episode-id') + 1]);
    if (!epId) throw new Error('ID de episodio inválido');
    await ingestEpisode(epId);
  } else if (args.includes('--anime-id')) {
    const animeId = Number(args[args.indexOf('--anime-id') + 1]);
    if (!animeId) throw new Error('ID de anime inválido');
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100;
    console.log(`[DriveIngest] Obteniendo episodios pendientes de Anime ${animeId} (máx ${limit})...`);
    const { rows } = await pool.query(
      `SELECT id, episode_number
       FROM anime_episodes
       WHERE anime_id = $1
         AND is_active = true
         AND (stream_url IS NULL OR stream_url NOT LIKE '%/api/stream/%')
       ORDER BY episode_number ASC
       LIMIT $2`,
      [animeId, limit]
    );
    console.log(`[DriveIngest] Encontrados ${rows.length} episodios pendientes. Procesando en cola...`);
    for (const row of rows) {
      await ingestEpisode(row.id);
    }
  } else if (args.includes('--batch')) {
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
    console.log(`[DriveIngest] Buscando próximos hasta ${limit} episodios del anime en curso para completar antes de pasar al siguiente...`);
    const { rows } = await pool.query(
      `
        WITH target_anime AS (
          SELECT
            e.anime_id,
            COUNT(*) FILTER (WHERE e.stream_url LIKE '%/api/stream/%' OR e.storage_type = 'gdrive') AS synced_count
          FROM anime_episodes e
          JOIN anime_content ac ON ac.id = e.anime_id
          WHERE e.is_active = true
            AND ac.is_active = true
          GROUP BY e.anime_id
          HAVING COUNT(*) FILTER (
            WHERE e.external_servers @> '[{"server":"MP4Upload"}]'::jsonb
              AND (e.stream_url IS NULL OR e.stream_url NOT LIKE '%/api/stream/%')
          ) > 0
          ORDER BY
            (COUNT(*) FILTER (WHERE e.stream_url LIKE '%/api/stream/%' OR e.storage_type = 'gdrive') > 0) DESC,
            e.anime_id ASC
          LIMIT 1
        )
        SELECT e.id, e.anime_id, e.episode_number
        FROM anime_episodes e
        JOIN target_anime ta ON ta.anime_id = e.anime_id
        WHERE e.is_active = true
          AND e.external_servers @> '[{"server":"MP4Upload"}]'::jsonb
          AND (e.stream_url IS NULL OR NOT e.stream_url LIKE '%/api/stream/%')
        ORDER BY e.episode_number ASC
        LIMIT $1
      `,
      [limit]
    );
    if (rows.length > 0) {
      console.log(`[DriveIngest] Completando Anime #${rows[0].anime_id} (${rows.length} episodios en este lote)...`);
    } else {
      console.log(`[DriveIngest] No hay episodios pendientes con MP4Upload.`);
    }
    for (const row of rows) {
      await ingestEpisode(row.id);
    }
  } else {
    console.log(`
Uso de pixel-drive-ingest:
  node tools/pixel-drive-ingest.mjs --episode-id <ID>      Descarga y sube un episodio específico
  node tools/pixel-drive-ingest.mjs --anime-id <ID>        Descarga y sube episodios pendientes de un anime
  node tools/pixel-drive-ingest.mjs --batch --limit 2      Descarga los siguientes N episodios pendientes
  node tools/pixel-drive-ingest.mjs --trailers --limit 2   Descarga y verifica trailers de anime en Drive
    `);
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error('[DriveIngest] Error:', e.message);
    pool.end();
    process.exit(1);
  });
