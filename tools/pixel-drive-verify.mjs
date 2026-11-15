#!/usr/bin/env node
/**
 * Pixel No Sekai - Google Drive Integrity Verifier & Self-Repair Bot
 *
 * Checks PostgreSQL records pointing to /api/stream/... against actual files served by
 * http://127.0.0.1:8086 (with rclone ls double-check before repair) and optionally repairs broken links.
 *
 * Usage:
 *   node tools/pixel-drive-verify.mjs
 *   node tools/pixel-drive-verify.mjs --repair
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const { default: pool } = await import('../server/db.js');

const RCLONE_BIN = existsSync('/data/data/com.termux/files/usr/bin/rclone')
  ? '/data/data/com.termux/files/usr/bin/rclone'
  : 'rclone';
const HTTP_DRIVE_BASE = 'http://127.0.0.1:8086';

function isHttpDriveServerUp() {
  const res = spawnSync('curl', ['-sI', '--max-time', '4', `${HTTP_DRIVE_BASE}/`], { encoding: 'utf8' });
  return res.status === 0 && /HTTP\/\d/i.test(res.stdout || '');
}

function streamUrlToRelPath(urlOrRel) {
  let raw = String(urlOrRel || '').trim();
  if (raw.includes('/api/stream/')) {
    raw = raw.split('/api/stream/')[1] || '';
  } else {
    raw = raw.replace(/^pixel-drive:PixelNoSekai\/?/, '');
  }
  return raw
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
}

function getHttpSize(relPath) {
  const encodedRel = relPath.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  const res = spawnSync('curl', ['-sI', '-f', '--max-time', '5', `${HTTP_DRIVE_BASE}/${encodedRel}`], {
    encoding: 'utf8',
  });
  if (res.status !== 0) return { ok: false, bytes: 0 };
  const match = (res.stdout || '').match(/Content-Length:\s*(\d+)/i);
  const bytes = match ? Number(match[1]) : 0;
  return { ok: bytes > 0, bytes };
}

function getRcloneSize(relPath) {
  try {
    const res = spawnSync(RCLONE_BIN, ['ls', `pixel-drive:PixelNoSekai/${relPath}`], { encoding: 'utf8' });
    if (res.status !== 0 || !res.stdout) return 0;
    const match = res.stdout.trim().match(/^\s*(\d+)\s+/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

function checkDriveObject(urlOrRel, minBytes, expectedBytes = null) {
  const relPath = streamUrlToRelPath(urlOrRel);
  if (!relPath) return { valid: false, bytes: 0, reason: 'ruta vacía' };

  const http = getHttpSize(relPath);
  if (http.ok && http.bytes >= minBytes) {
    if (expectedBytes && expectedBytes >= minBytes && http.bytes < Math.floor(expectedBytes * 0.95)) {
      return { valid: false, bytes: http.bytes, reason: `truncado HTTP (${http.bytes} < 95% de ${expectedBytes})` };
    }
    return { valid: true, bytes: http.bytes };
  }

  // Double-check directly via rclone ls so a fresh upload not yet in 5m HTTP dir-cache is not wiped
  const rcloneBytes = getRcloneSize(relPath);
  if (rcloneBytes >= minBytes) {
    if (expectedBytes && expectedBytes >= minBytes && rcloneBytes < Math.floor(expectedBytes * 0.95)) {
      return { valid: false, bytes: rcloneBytes, reason: `truncado en Drive (${rcloneBytes} < 95% de ${expectedBytes})` };
    }
    return { valid: true, bytes: rcloneBytes, note: 'en Drive API (caché HTTP refrescando)' };
  }

  return {
    valid: false,
    bytes: Math.max(http.bytes, rcloneBytes),
    reason: `no encontrado o tamaño insuficiente (${Math.max(http.bytes, rcloneBytes)} < ${minBytes} B)`,
  };
}

async function main() {
  const repair = process.argv.includes('--repair');

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`🔍 PIXEL NO SEKAI - VERIFICACIÓN DE INTEGRIDAD GOOGLE DRIVE`);
  console.log(`Modo: ${repair ? 'REPARACIÓN AUTOMÁTICA (--repair)' : 'SOLO LECTURA'}`);
  console.log(`══════════════════════════════════════════════════════════════`);

  if (!isHttpDriveServerUp()) {
    console.error(`✖ El servidor local Drive HTTP (${HTTP_DRIVE_BASE}) no responde. Abortando sin modificar la BD.`);
    process.exitCode = 1;
    return;
  }

  const stats = {
    animeEpisodes: { checked: 0, ok: 0, broken: 0, repaired: 0 },
    animeTrailers: { checked: 0, ok: 0, broken: 0, repaired: 0 },
    mangaChapters: { checked: 0, ok: 0, broken: 0, repaired: 0 },
    hentaiEpisodes: { checked: 0, ok: 0, broken: 0, repaired: 0 },
  };

  // 1. Anime Episodes
  const { rows: animeEps } = await pool.query(`
    SELECT id, anime_id, episode_number, stream_url, file_size
    FROM anime_episodes
    WHERE is_active = true
      AND stream_url LIKE '%/api/stream/Anime/%'
    ORDER BY id ASC
  `);
  for (const ep of animeEps) {
    stats.animeEpisodes.checked++;
    const check = checkDriveObject(ep.stream_url, 102400, ep.file_size ? Number(ep.file_size) : null);
    if (check.valid) {
      stats.animeEpisodes.ok++;
    } else {
      stats.animeEpisodes.broken++;
      console.warn(`⚠ [Anime Ep ${ep.id}] Anime ${ep.anime_id} Ep ${ep.episode_number}: ${check.reason}`);
      if (repair) {
        await pool.query(
          `UPDATE anime_episodes
           SET stream_url = NULL,
               storage_type = 'external',
               file_size = NULL,
               external_servers = COALESCE(
                 (
                   SELECT jsonb_agg(elem)
                   FROM jsonb_array_elements(COALESCE(external_servers::jsonb, '[]'::jsonb)) elem
                   WHERE elem->>'server' != 'Pixel VIP (Drive)'
                     AND COALESCE(elem->>'url', '') NOT LIKE '%/api/stream/%'
                 ),
                 '[]'::jsonb
               )
           WHERE id = $1`,
          [ep.id]
        );
        stats.animeEpisodes.repaired++;
        console.log(`  ↳ Reparado en BD: Ep ${ep.id} marcado como externo pendiente.`);
      }
    }
  }

  // 2. Anime Trailers
  const { rows: trailers } = await pool.query(`
    SELECT id, title, trailer_id, trailer_site
    FROM anime_content
    WHERE is_active = true
      AND LOWER(COALESCE(trailer_site, '')) = 'gdrive'
    ORDER BY id ASC
  `);
  for (const t of trailers) {
    stats.animeTrailers.checked++;
    const check = checkDriveObject(`Anime/${t.id}/trailer.mp4`, 10240);
    if (check.valid) {
      stats.animeTrailers.ok++;
    } else {
      stats.animeTrailers.broken++;
      console.warn(`⚠ [Trailer Anime ${t.id}] ${t.title}: ${check.reason}`);
      if (repair) {
        await pool.query(
          `UPDATE anime_content
           SET trailer_site = CASE WHEN trailer_id IS NOT NULL AND trailer_id != '' THEN 'youtube' ELSE NULL END,
               updated_at = NOW()
           WHERE id = $1`,
          [t.id]
        );
        stats.animeTrailers.repaired++;
        console.log(`  ↳ Reparado en BD: Anime ${t.id} devuelto a ${t.trailer_id ? 'youtube' : 'NULL'}.`);
      }
    }
  }

  // 3. Manga Chapters
  const { rows: mangaRows } = await pool.query(`
    SELECT chapter_url, pages
    FROM manga_page_cache
    WHERE pages::text LIKE '%/api/stream/Manga/%'
  `);
  for (const row of mangaRows) {
    stats.mangaChapters.checked++;
    const pages = Array.isArray(row.pages) ? row.pages : [];
    const firstCheck = pages.length ? checkDriveObject(pages[0], 500) : { valid: false, reason: 'array vacío' };
    const lastCheck =
      pages.length > 1 ? checkDriveObject(pages[pages.length - 1], 500) : firstCheck;

    if (firstCheck.valid && lastCheck.valid) {
      stats.mangaChapters.ok++;
    } else {
      stats.mangaChapters.broken++;
      console.warn(`⚠ [Manga] ${row.chapter_url}: ${firstCheck.valid ? lastCheck.reason : firstCheck.reason}`);
      if (repair) {
        await pool.query('DELETE FROM manga_page_cache WHERE chapter_url = $1', [row.chapter_url]);
        stats.mangaChapters.repaired++;
        console.log(`  ↳ Reparado en BD: caché eliminada para re-ingestar desde origen.`);
      }
    }
  }

  // 4. Hentai Episodes
  const { rows: hentaiEps } = await pool.query(`
    SELECT id, hentai_id, episode_number, video_servers
    FROM hentai_episodes
    WHERE is_active = true
      AND video_servers::text LIKE '%/api/stream/Hentai/%'
    ORDER BY id ASC
  `);
  for (const ep of hentaiEps) {
    stats.hentaiEpisodes.checked++;
    const servers = Array.isArray(ep.video_servers) ? ep.video_servers : [];
    const driveServer = servers.find((s) => String(s?.url || '').includes('/api/stream/Hentai/'));
    const check = driveServer
      ? checkDriveObject(driveServer.url, 102400)
      : { valid: false, reason: 'URL de Drive faltante' };

    if (check.valid) {
      stats.hentaiEpisodes.ok++;
    } else {
      stats.hentaiEpisodes.broken++;
      console.warn(`⚠ [Hentai Ep ${ep.id}] Hentai ${ep.hentai_id} Ep ${ep.episode_number}: ${check.reason}`);
      if (repair) {
        await pool.query(
          `UPDATE hentai_episodes
           SET video_servers = COALESCE(
                 (
                   SELECT jsonb_agg(elem)
                   FROM jsonb_array_elements(COALESCE(video_servers::jsonb, '[]'::jsonb)) elem
                   WHERE elem->>'server' != 'Pixel VIP (Drive)'
                     AND COALESCE(elem->>'url', '') NOT LIKE '%/api/stream/%'
                 ),
                 '[]'::jsonb
               )
           WHERE id = $1`,
          [ep.id]
        );
        stats.hentaiEpisodes.repaired++;
        console.log(`  ↳ Reparado en BD: servidor VIP eliminado en Hentai Ep ${ep.id}.`);
      }
    }
  }

  console.log(`\n📊 RESUMEN DE VERIFICACIÓN:`);
  console.log(`- Anime Episodios : ${stats.animeEpisodes.ok}/${stats.animeEpisodes.checked} íntegros (rotos: ${stats.animeEpisodes.broken}, reparados: ${stats.animeEpisodes.repaired})`);
  console.log(`- Anime Trailers  : ${stats.animeTrailers.ok}/${stats.animeTrailers.checked} íntegros (rotos: ${stats.animeTrailers.broken}, reparados: ${stats.animeTrailers.repaired})`);
  console.log(`- Manga Capítulos : ${stats.mangaChapters.ok}/${stats.mangaChapters.checked} íntegros (rotos: ${stats.mangaChapters.broken}, reparados: ${stats.mangaChapters.repaired})`);
  console.log(`- Hentai Episodios: ${stats.hentaiEpisodes.ok}/${stats.hentaiEpisodes.checked} íntegros (rotos: ${stats.hentaiEpisodes.broken}, reparados: ${stats.hentaiEpisodes.repaired})`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
}

main()
  .catch((err) => {
    console.error('[DriveVerify] Error fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
