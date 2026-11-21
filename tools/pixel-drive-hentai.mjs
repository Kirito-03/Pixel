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
import { prepareAv1Video, probeVideo } from './lib/drive-video.mjs';
import { withVideoLock, ensureVideoDownload, verifyDriveUpload, cleanVideoCheckpoint } from './lib/drive-transfer.mjs';
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
const RCLONE_BIN = existsSync('/data/data/com.termux/files/usr/bin/rclone') ? '/data/data/com.termux/files/usr/bin/rclone' : 'rclone';
const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream';
const FFMPEG_BIN = process.env.PIXEL_FFMPEG_BIN || 'ffmpeg';
const FFPROBE_BIN = process.env.PIXEL_FFPROBE_BIN || 'ffprobe';

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

const RCLONE_THROTTLE = ['--transfers', '1', '--checkers', '2', '--bwlimit', '8M'];

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
    const out = runCapture(RCLONE_BIN, ['ls', '--contimeout', '15s', '--timeout', '30s', remotePath]);
    if (!out) return 0;
    const match = out.match(/^\s*(\d+)\s+/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

function remoteFileExists(remotePath) {
  return getRemoteFileSize(remotePath) > 102400;
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
    const directUrl = runCapture(YTDLP_BIN, ['--force-ipv4', '--socket-timeout', '20', '--retries', '2', '-g', supported.url]);
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      return { directUrl, referer: supported.url, serverName: supported.server };
    }
  } catch (e) {
    console.error(`[HentaiIngest] Error resolviendo enlace con yt-dlp:`, e.message);
  }
  return null;
}

/** Sync hentai cover image first (lightweight & fast) */
async function syncHentaiCover(hentaiId, posterUrl) {
  if (!posterUrl || !/^https?:\/\//i.test(posterUrl)) return false;
  const posterRemote = `${RCLONE_REMOTE}/Hentai/${hentaiId}/poster.jpg`;
  if (getRemoteFileSize(posterRemote) > 500) return true;
  console.log(`[HentaiIngest] Subiendo portada de Hentai #${hentaiId}...`);
  const tmpPoster = join(INGEST_DIR, `tmp_h_poster_${hentaiId}.jpg`);
  try {
    await runCommand('curl', ['-sS', '-L', '--max-time', '45', posterUrl, '-o', tmpPoster]);
    if (existsSync(tmpPoster) && statSync(tmpPoster).size > 500) {
      await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpPoster, posterRemote]);
      if (getRemoteFileSize(posterRemote) > 500) {
        console.log(`[HentaiIngest] ✓ Portada de Hentai subida: ${posterRemote}`);
        return true;
      }
    }
  } catch (e) {
    console.warn(`[HentaiIngest] Error subiendo portada de Hentai #${hentaiId}:`, e.message);
  } finally {
    if (existsSync(tmpPoster)) unlinkSync(tmpPoster);
  }
  return false;
}

/** Ingest a single hentai episode */
export async function ingestHentaiEpisode(episodeId) {
  return withVideoLock(join(homedir(), 'server/data/pixel-ingest'), () => ingestHentaiEpisodeUnlocked(episodeId));
}

async function ingestHentaiEpisodeUnlocked(episodeId) {
  const { rows } = await pool.query(
    `SELECT he.id, he.hentai_id, he.episode_number, he.video_servers, hc.slug, hc.title, hc.poster_url
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

  await syncHentaiCover(hentaiId, ep.poster_url);

  // 1. Verificar si ya existe en Drive
  if (remoteFileExists(driveRemoteTarget)) {
    console.log(`[HentaiIngest] Episodio ${episodeId} ya existe en Google Drive.`);
    await updateHentaiDatabase(episodeId, publicStreamUrl);
    return true;
  }

  const tmpDownload = join(INGEST_DIR, `raw_h_${episodeId}.mp4`);
  const tmpProcessed = join(INGEST_DIR, `opt_h_${episodeId}.mp4`);
  let committed = false;
  try {
    await ensureVideoDownload({
      filePath: tmpDownload,
      sourceKey: JSON.stringify({ kind: 'hentai', episodeId, servers: (ep.video_servers || []).filter((s) => s.server !== 'Pixel VIP (Drive)') }),
      resolve: () => resolveVideoUrl(ep.video_servers),
      run: runCommand,
      probe: (path) => probeVideo(path, FFPROBE_BIN),
      // Only an operator-confirmed complete legacy download may be adopted once.
      adoptLegacy: process.env.PIXEL_ADOPT_LEGACY_DOWNLOADS === '1',
    });
    const prepared = await prepareAv1Video({ inputPath: tmpDownload, outputPath: tmpProcessed, ffmpegBin: FFMPEG_BIN, ffprobeBin: FFPROBE_BIN });
    console.log(`[HentaiIngest] AV1 preparado (${(prepared.bytes / 1048576).toFixed(1)} MB, ${prepared.mode}). Subiendo a Drive...`);
    await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpProcessed, driveRemoteTarget]);
    const verifiedSize = await verifyDriveUpload(tmpProcessed, driveRemoteTarget, RCLONE_BIN);
    console.log(`[HentaiIngest] ✓ Tamaño y MD5 verificados en Drive (${verifiedSize} bytes).`);

    // 5. Actualizar Base de Datos
    await updateHentaiDatabase(episodeId, publicStreamUrl);
    committed = true;
    return true;
  } catch (err) {
    console.error(`[HentaiIngest] Error en episodio ${episodeId}:`, err.message);
    return false;
  } finally {
    if (committed) await cleanVideoCheckpoint(tmpDownload, tmpProcessed);
    else console.log('[DriveResume] Descarga y AV1 preparado conservados para reintentar este episodio.');
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
  let failed = 0;
  for (const row of rows) {
    if (!await ingestHentaiEpisode(row.id)) failed++;
  }
  if (failed) throw new Error(`${failed} episodios H quedan pendientes para reintentar.`);
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const parsedLimit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : NaN;

  if (args.includes('--episode-id')) {
    const epId = Number(args[args.indexOf('--episode-id') + 1]);
    if (!await ingestHentaiEpisode(epId)) throw new Error('El episodio H queda pendiente para reintentar.');
  } else if (args.includes('--hentai-id')) {
    const hId = Number(args[args.indexOf('--hentai-id') + 1]);
    await ingestHentai(hId);
  } else if (args.includes('--slug')) {
    const slug = args[args.indexOf('--slug') + 1];
    await ingestHentai(slug);
  } else if (args.includes('--batch')) {
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
    const { rows } = await pool.query(
      `WITH target_hentai AS (
         SELECT
           he.hentai_id,
           COUNT(*) FILTER (WHERE he.video_servers::text LIKE '%/api/stream/%') AS synced_count
         FROM hentai_episodes he
         JOIN hentai_content hc ON hc.id = he.hentai_id
         WHERE he.is_active = true
           AND hc.is_active = true
         GROUP BY he.hentai_id
         HAVING COUNT(*) FILTER (
           WHERE he.video_servers @> '[{"server":"MP4Upload"}]'::jsonb
             AND NOT (he.video_servers::text LIKE '%/api/stream/%')
         ) > 0
         ORDER BY
           (COUNT(*) FILTER (WHERE he.video_servers::text LIKE '%/api/stream/%') > 0) DESC,
           he.hentai_id ASC
         LIMIT 1
       )
       SELECT he.id, he.hentai_id, he.episode_number
       FROM hentai_episodes he
       JOIN target_hentai th ON th.hentai_id = he.hentai_id
       WHERE he.is_active = true
         AND he.video_servers @> '[{"server":"MP4Upload"}]'::jsonb
         AND NOT (he.video_servers::text LIKE '%/api/stream/%')
       ORDER BY he.episode_number ASC
       LIMIT $1`,
      [Math.max(limit * 4, 8)]
    );
    if (rows.length > 0) {
      console.log(`[HentaiIngest] Completando Hentai #${rows[0].hentai_id} (meta=${limit}, candidatos=${rows.length})...`);
    } else {
      console.log(`[HentaiIngest] No hay episodios Hentai pendientes con MP4Upload.`);
    }
    let succeeded = 0;
    let failed = 0;
    for (const r of rows) {
      if (succeeded >= limit) break;
      if (await ingestHentaiEpisode(r.id)) succeeded++;
      else failed++;
    }
    if (succeeded === 0 && failed > 0) {
      throw new Error(`${failed} episodios Hentai candidatos fallaron en este lote.`);
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
