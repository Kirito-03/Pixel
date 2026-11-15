#!/usr/bin/env node
/**
 * tools/pixel-drive-hentai.mjs
 * Pixel No Sekai - Hentai / NSFW Google Drive Ingest Bot
 *
 * Usage:
 *   node tools/pixel-drive-hentai.mjs --episode-id <ID>
 *   node tools/pixel-drive-hentai.mjs --hentai-id <ID>
 *   node tools/pixel-drive-hentai.mjs --slug <SLUG>
 *   node tools/pixel-drive-hentai.mjs --batch --limit 5
 */

import { existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const { default: pool } = await import('../server/db.js');

const INGEST_DIR = join(homedir(), 'server/data/pixel-ingest/hentai');
const RCLONE_REMOTE = 'pixel-drive:PixelNoSekai';
const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream';
const FFMPEG_BIN = process.env.PIXEL_FFMPEG_BIN || 'ffmpeg';

function findYtDlp() {
  const candidates = [
    process.env.PIXEL_YTDLP_BIN,
    '/data/data/com.termux/files/home/server/tools/media-resolver/bin/yt-dlp',
    join(homedir(), 'server/tools/media-resolver/bin/yt-dlp'),
    'yt-dlp'
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'yt-dlp';
}

const YTDLP_BIN = findYtDlp();

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

function remoteFileExists(remotePath) {
  try {
    const res = spawnSync('rclone', ['lsf', remotePath]);
    return res.status === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Resolve direct video URL from video_servers */
function resolveVideoUrl(videoServers) {
  if (!Array.isArray(videoServers)) return null;

  // Prioritize MP4Upload
  const supported = videoServers.find((s) => {
    const url = String(s?.url || '');
    return url.includes('mp4upload.com') || /\.mp4(\?|$)/i.test(url);
  });

  if (!supported) return null;

  try {
    const directUrl = runCapture(YTDLP_BIN, ['-g', supported.url]);
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      return { directUrl, referer: supported.url, serverName: supported.server };
    }
  } catch (e) {
    console.error(`[HentaiIngest] Error resolviendo enlace con yt-dlp:`, e.message);
  }
  return null;
}

/** Ingest a single hentai episode */
export async function ingestHentaiEpisode(episodeId) {
  const { rows } = await pool.query(
    `SELECT he.id, he.hentai_id, he.episode_number, he.video_servers, hc.slug, hc.title
     FROM hentai_episodes he
     JOIN hentai_content hc ON hc.id = he.hentai_id
     WHERE he.id = $1`,
    [episodeId]
  );

  if (rows.length === 0) {
    console.warn(`[HentaiIngest] Episodio ID ${episodeId} no encontrado.`);
    return false;
  }

  const ep = rows[0];
  const hentaiId = ep.hentai_id;
  const epNum = ep.episode_number;
  const driveRemoteTarget = `${RCLONE_REMOTE}/Hentai/${hentaiId}/${epNum}/episode.mp4`;
  const publicStreamUrl = `${BASE_STREAM_URL}/Hentai/${hentaiId}/${epNum}/episode.mp4`;

  console.log(`\n[HentaiIngest] ─────────────────────────────────────────────`);
  console.log(`[HentaiIngest] Procesando: ${ep.title} (ID: ${hentaiId}) | Episodio: ${epNum}`);

  // 1. Verificar si ya existe en Drive
  if (remoteFileExists(driveRemoteTarget)) {
    console.log(`[HentaiIngest] Episodio ${episodeId} ya existe en Google Drive.`);
    await updateHentaiDatabase(episodeId, publicStreamUrl);
    return true;
  }

  // 2. Resolver enlace de video
  const resolved = resolveVideoUrl(ep.video_servers);
  if (!resolved) {
    console.warn(`[HentaiIngest] Ep ${episodeId}: no se encontró enlace compatible (MP4Upload).`);
    return false;
  }

  console.log(`[HentaiIngest] Descargando desde ${resolved.serverName}...`);
  const tmpDownload = join(INGEST_DIR, `raw_h_${episodeId}.mp4`);
  const tmpProcessed = join(INGEST_DIR, `opt_h_${episodeId}.mp4`);

  try {
    // Descarga con curl
    const curlArgs = ['-sS', '-L', '--max-time', '1800'];
    if (resolved.referer) curlArgs.push('-e', resolved.referer);
    curlArgs.push(resolved.directUrl, '-o', tmpDownload);
    await runCommand('curl', curlArgs);

    const stats = statSync(tmpDownload);
    const sizeMb = stats.size / (1024 * 1024);
    console.log(`[HentaiIngest] Descargado (${sizeMb.toFixed(1)} MB). Procesando compresión...`);

    // 3. Estrategia de compresión
    if (sizeMb <= 140) {
      console.log(`[HentaiIngest] Peso ligero (<= 140 MB). Aplicando faststart directo...`);
      await runCommand(FFMPEG_BIN, [
        '-y', '-i', tmpDownload,
        '-c', 'copy',
        '-movflags', '+faststart',
        tmpProcessed,
      ]);
    } else {
      console.log(`[HentaiIngest] Comprimiendo a 720p Ultra-Liviano (CRF 26 + faststart)...`);
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
    console.log(`[HentaiIngest] Archivo optimizado: ${optSizeMb.toFixed(1)} MB. Subiendo a Google Drive...`);

    // 4. Subir a Google Drive
    await runCommand('rclone', ['copyto', tmpProcessed, driveRemoteTarget]);
    console.log(`[HentaiIngest] ✓ Subido a Drive: ${driveRemoteTarget}`);

    // 5. Actualizar Base de Datos
    await updateHentaiDatabase(episodeId, publicStreamUrl);
    return true;
  } catch (err) {
    console.error(`[HentaiIngest] Error en episodio ${episodeId}:`, err.message);
    return false;
  } finally {
    if (existsSync(tmpDownload)) unlinkSync(tmpDownload);
    if (existsSync(tmpProcessed)) unlinkSync(tmpProcessed);
  }
}

/** Update hentai_episodes video_servers adding Pixel VIP (Drive) as first server */
async function updateHentaiDatabase(episodeId, streamUrl) {
  const vipServer = { server: 'Pixel VIP (Drive)', url: streamUrl };
  await pool.query(
    `
      UPDATE hentai_episodes
      SET video_servers = jsonb_insert(
            COALESCE(
              (
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(COALESCE(video_servers::jsonb, '[]'::jsonb)) elem
                WHERE elem->>'server' != 'Pixel VIP (Drive)'
              ),
              '[]'::jsonb
            ),
            '{0}',
            $1::jsonb
          ),
          updated_at = NOW()
      WHERE id = $2
    `,
    [JSON.stringify(vipServer), episodeId]
  );
  console.log(`[HentaiIngest] ✓ Base de datos actualizada: Servidor Pixel VIP (Drive) listo.`);
}

/** Ingest all episodes for a hentai ID or slug */
export async function ingestHentai(hentaiIdOrSlug) {
  const isNum = !isNaN(Number(hentaiIdOrSlug));
  const where = isNum ? 'hc.id = $1' : 'hc.slug = $1';

  const { rows } = await pool.query(
    `SELECT he.id, he.episode_number, hc.title
     FROM hentai_episodes he
     JOIN hentai_content hc ON hc.id = he.hentai_id
     WHERE ${where} AND he.is_active = true
     ORDER BY he.episode_number ASC`,
    [hentaiIdOrSlug]
  );

  if (!rows.length) {
    console.warn(`[HentaiIngest] No se encontraron episodios para: ${hentaiIdOrSlug}`);
    return;
  }

  console.log(`[HentaiIngest] Sincronizando ${rows.length} episodios de "${rows[0].title}"...`);
  for (const row of rows) {
    await ingestHentaiEpisode(row.id);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--episode-id')) {
    const epId = Number(args[args.indexOf('--episode-id') + 1]);
    await ingestHentaiEpisode(epId);
  } else if (args.includes('--hentai-id')) {
    const hId = Number(args[args.indexOf('--hentai-id') + 1]);
    await ingestHentai(hId);
  } else if (args.includes('--slug')) {
    const slug = args[args.indexOf('--slug') + 1];
    await ingestHentai(slug);
  } else if (args.includes('--batch')) {
    const limit = Number(args[args.indexOf('--limit') + 1]) || 5;
    const { rows } = await pool.query(
      `SELECT he.id
       FROM hentai_episodes he
       WHERE he.video_servers @> '[{"server":"MP4Upload"}]'::jsonb
         AND NOT (he.video_servers::text LIKE '%/api/stream/%')
       ORDER BY he.hentai_id ASC, he.episode_number ASC
       LIMIT $1`,
      [limit]
    );
    console.log(`[HentaiIngest] Procesando lote de ${rows.length} episodios...`);
    for (const r of rows) {
      await ingestHentaiEpisode(r.id);
    }
  } else {
    console.log(`
Uso de pixel-drive-hentai:
  node tools/pixel-drive-hentai.mjs --episode-id <ID>
  node tools/pixel-drive-hentai.mjs --hentai-id <ID>
  node tools/pixel-drive-hentai.mjs --slug <SLUG>
  node tools/pixel-drive-hentai.mjs --batch --limit 5
    `);
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error('[HentaiIngest] Error:', e.message);
    pool.end();
    process.exit(1);
  });
