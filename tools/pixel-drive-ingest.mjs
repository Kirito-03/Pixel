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
const YTDLP_BIN = process.env.PIXEL_YTDLP_BIN || join(homedir(), 'server/tools/media-resolver/bin/yt-dlp');
const FFMPEG_BIN = process.env.PIXEL_FFMPEG_BIN || 'ffmpeg';
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

/** Check if a remote path exists in Google Drive via rclone ls */
function remoteFileExists(remotePath) {
  try {
    const out = runCapture('rclone', ['ls', remotePath]);
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Download poster & banner if not already in Drive */
async function syncAnimeImages(animeId) {
  const { rows } = await pool.query(
    'SELECT id, title, poster_url, banner_url FROM anime_content WHERE id = $1',
    [animeId]
  );
  if (!rows.length) return;
  const anime = rows[0];

  const posterRemote = `${RCLONE_REMOTE}/Anime/${animeId}/poster.jpg`;
  if (anime.poster_url && !remoteFileExists(posterRemote)) {
    console.log(`[DriveIngest] Sincronizando portada de anime ${animeId} (${anime.title})...`);
    const tmpPoster = join(INGEST_DIR, `tmp_poster_${animeId}.jpg`);
    try {
      await runCommand('curl', ['-sS', '-L', anime.poster_url, '-o', tmpPoster]);
      await runCommand('rclone', ['copyto', tmpPoster, posterRemote]);
      console.log(`[DriveIngest] ✓ Portada subida a Drive: ${posterRemote}`);
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
      await runCommand('curl', ['-sS', '-L', anime.banner_url, '-o', tmpBanner]);
      await runCommand('rclone', ['copyto', tmpBanner, bannerRemote]);
      console.log(`[DriveIngest] ✓ Banner subido a Drive: ${bannerRemote}`);
    } catch (e) {
      console.error(`[DriveIngest] Error subiendo banner:`, e.message);
    } finally {
      if (existsSync(tmpBanner)) unlinkSync(tmpBanner);
    }
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
    const directUrl = runCapture(ytDlpCmd, ['-g', supported.url]);
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
    'SELECT id, anime_id, episode_number, title, external_servers, stream_url FROM anime_episodes WHERE id = $1',
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

  // 1. Check if already uploaded
  if (remoteFileExists(driveRemoteTarget)) {
    console.log(`[DriveIngest] Episodio ${episodeId} (Anime ${animeId} Ep ${epNum}) ya existe en Drive.`);
    await updateDatabaseRecord(episodeId, publicStreamUrl);
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
      console.log(`[DriveIngest] Comprimiendo a 720p Ultra-Liviano (CRF 26 + tune animation)...`);
      await runCommand(FFMPEG_BIN, [
        '-y', '-i', tmpDownload,
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

    // 4. Upload to Drive
    await runCommand('rclone', ['copyto', tmpProcessed, driveRemoteTarget]);
    console.log(`[DriveIngest] ✓ Subido a Drive: ${driveRemoteTarget}`);

    // 5. Update Database
    await updateDatabaseRecord(episodeId, publicStreamUrl);
    return true;
  } catch (err) {
    console.error(`[DriveIngest] Fallo en episodio ${episodeId}:`, err.message);
    return false;
  } finally {
    if (existsSync(tmpDownload)) unlinkSync(tmpDownload);
    if (existsSync(tmpProcessed)) unlinkSync(tmpProcessed);
  }
}

/** Add Pixel VIP (Drive) to external_servers and set stream_url */
async function updateDatabaseRecord(episodeId, streamUrl) {
  const vipServer = { server: 'Pixel VIP (Drive)', url: streamUrl };
  await pool.query(
    `
      UPDATE anime_episodes
      SET stream_url = $1,
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
    [streamUrl, JSON.stringify(vipServer), episodeId]
  );
  console.log(`[DriveIngest] ✓ Base de datos actualizada para Ep ${episodeId}: Servidor VIP disponible.`);
}

/** CLI entrypoint */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--episode-id')) {
    const epId = Number(args[args.indexOf('--episode-id') + 1]);
    if (!epId) throw new Error('ID de episodio inválido');
    await ingestEpisode(epId);
  } else if (args.includes('--anime-id')) {
    const animeId = Number(args[args.indexOf('--anime-id') + 1]);
    if (!animeId) throw new Error('ID de anime inválido');
    console.log(`[DriveIngest] Obteniendo episodios de Anime ${animeId}...`);
    const { rows } = await pool.query(
      'SELECT id, episode_number FROM anime_episodes WHERE anime_id = $1 AND is_active = true ORDER BY episode_number ASC',
      [animeId]
    );
    console.log(`[DriveIngest] Encontrados ${rows.length} episodios. Procesando en cola...`);
    for (const row of rows) {
      await ingestEpisode(row.id);
    }
  } else if (args.includes('--batch')) {
    const limit = Number(args[args.indexOf('--limit') + 1]) || 5;
    console.log(`[DriveIngest] Buscando los próximos ${limit} episodios pendientes con MP4Upload...`);
    const { rows } = await pool.query(
      `
        SELECT e.id, e.anime_id, e.episode_number
        FROM anime_episodes e
        WHERE e.external_servers @> '[{"server":"MP4Upload"}]'::jsonb
          AND (e.stream_url IS NULL OR NOT e.stream_url LIKE '%/api/stream/%')
        ORDER BY e.anime_id ASC, e.episode_number ASC
        LIMIT $1
      `,
      [limit]
    );
    console.log(`[DriveIngest] Procesando lote de ${rows.length} episodios...`);
    for (const row of rows) {
      await ingestEpisode(row.id);
    }
  } else {
    console.log(`
Uso de pixel-drive-ingest:
  node tools/pixel-drive-ingest.mjs --episode-id <ID>   Descarga y sube un episodio específico
  node tools/pixel-drive-ingest.mjs --anime-id <ID>     Descarga y sube todos los episodios de un anime
  node tools/pixel-drive-ingest.mjs --batch --limit 5   Descarga los siguientes N episodios pendientes
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
