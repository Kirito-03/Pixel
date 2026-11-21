#!/usr/bin/env node
/**
 * Pixel No Sekai - Google Drive Link Integrity Verifier & Restorer
 *
 * Uses a single authoritative `rclone lsjson -R --files-only` inventory so
 * transient WiFi/DNS drops can never masquerade as missing files and wipe PostgreSQL.
 *
 * Usage:
 *   node --env-file=.env tools/pixel-drive-verify.mjs
 *   node --env-file=.env tools/pixel-drive-verify.mjs --repair
 *   node --env-file=.env tools/pixel-drive-verify.mjs --restore
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BASE_STREAM_URL,
  buildInventoryMap,
  verifyAgainstInventory,
  canSafelyApplyRepair,
  buildRestorePlan,
} from './lib/drive-verify.mjs';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
let pool;
async function getPool() {
  if (!pool) {
    const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
    if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
      process.loadEnvFile(envFile);
    }
    ({ default: pool } = await import('../server/db.js'));
  }
  return pool;
}

const RCLONE_BIN = existsSync('/data/data/com.termux/files/usr/bin/rclone')
  ? '/data/data/com.termux/files/usr/bin/rclone'
  : 'rclone';
const RCLONE_REMOTE = 'pixel-drive:PixelNoSekai';

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Check local rclone HTTP bridge (`127.0.0.1:8086`) with retry tolerance. */
export function isHttpDriveServerUp({ baseUrl = 'http://127.0.0.1:8086', attempts = 3 } = {}) {
  const probeUrls = [`${baseUrl}/`, `${baseUrl}/Anime/`];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const url of probeUrls) {
      const probe = spawnSync(
        'curl',
        ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-I', '--connect-timeout', '5', '--max-time', '20', url],
        { encoding: 'utf8' }
      );
      const status = Number(String(probe.stdout || '').trim());
      if (probe.status === 0 && status >= 200 && status < 400) {
        return true;
      }
    }
    if (attempt < attempts) sleepSync(2000);
  }
  return false;
}

/** Fetch full authoritative file listing from Google Drive; throws on failure. */
export function fetchAuthoritativeInventory({ rcloneBin = RCLONE_BIN, remote = RCLONE_REMOTE, attempts = 2 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = spawnSync(
      rcloneBin,
      ['lsjson', '-R', '--files-only', '--contimeout', '15s', '--timeout', '90s', remote],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    if (!res.error && res.status === 0 && res.stdout) {
      try {
        const parsed = JSON.parse(res.stdout);
        return buildInventoryMap(parsed);
      } catch (err) {
        lastErr = new Error(`JSON inválido desde rclone lsjson: ${err.message}`);
      }
    } else {
      const msg = res.error?.message || String(res.stderr || '').trim() || `exit ${res.status}`;
      lastErr = new Error(`rclone lsjson falló (intento ${attempt}/${attempts}): ${msg}`);
    }
    if (attempt < attempts) sleepSync(3000);
  }
  throw lastErr || new Error('No se pudo obtener el inventario de Google Drive');
}

async function applyRepairPlan(db, plan) {
  for (const ep of plan.brokenAnimeEpisodes) {
    await db.query(
      `UPDATE anime_episodes
       SET stream_url = NULL,
           storage_type = CASE WHEN video_url IS NOT NULL AND video_url != '' THEN 'external' ELSE 'local' END,
           file_size = 0,
           external_servers = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(ep.cleanedServers), ep.id]
    );
  }

  for (const thumb of plan.brokenAnimeThumbs) {
    await db.query(
      `UPDATE anime_episodes SET thumbnail_url = NULL, updated_at = NOW() WHERE id = $1`,
      [thumb.id]
    );
  }

  for (const tr of plan.brokenTrailers) {
    await db.query(
      `UPDATE anime_content
       SET trailer_site = CASE WHEN trailer_id IS NOT NULL AND trailer_id != '' THEN 'youtube' ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1`,
      [tr.id]
    );
  }

  for (const hep of plan.brokenHentaiEpisodes) {
    await db.query(
      `UPDATE hentai_episodes
       SET video_servers = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(hep.cleanedServers), hep.id]
    );
  }

  for (const ch of plan.brokenMangaChapters) {
    await db.query(`DELETE FROM manga_page_cache WHERE chapter_url = $1`, [ch.chapter_url]);
  }
}

async function runRestore(db, inventoryMap, { quiet = false } = {}) {
  const [epRes, animeRes, hentaiRes, mangaCacheRes, existingPageCacheRes] = await Promise.all([
    db.query(
      `SELECT id, anime_id, episode_number, stream_url, storage_type, file_size, external_servers, thumbnail_url
       FROM anime_episodes
       WHERE is_active = true`
    ),
    db.query(`SELECT id, trailer_site FROM anime_content WHERE is_active = true`),
    db.query(`SELECT id, hentai_id, episode_number, video_servers FROM hentai_episodes WHERE is_active = true`),
    db.query(`SELECT manga_id, chapter_id, external_url, pages FROM manga_chapters_cache WHERE external_url IS NOT NULL AND external_url != ''`),
    db.query(`SELECT chapter_url, pages FROM manga_page_cache`),
  ]);

  const existingMangaPageCache = new Map();
  for (const row of existingPageCacheRes.rows) {
    existingMangaPageCache.set(row.chapter_url, Array.isArray(row.pages) ? row.pages : []);
  }

  const plan = buildRestorePlan(inventoryMap, {
    animeEpisodes: epRes.rows,
    animeContent: animeRes.rows,
    hentaiEpisodes: hentaiRes.rows,
    mangaChaptersCache: mangaCacheRes.rows,
    existingMangaPageCache,
    baseStreamUrl: BASE_STREAM_URL,
  });

  let restoredEpVideos = 0;
  let restoredEpThumbs = 0;
  for (const item of plan.restoreAnimeEpisodes) {
    await db.query(
      `UPDATE anime_episodes
       SET stream_url = COALESCE($1, stream_url),
           storage_type = COALESCE($2, storage_type),
           file_size = COALESCE($3, file_size),
           external_servers = $4::jsonb,
           thumbnail_url = COALESCE(NULLIF(thumbnail_url, ''), $5),
           updated_at = NOW()
       WHERE id = $6`,
      [
        item.streamUrl,
        item.storageType,
        item.fileSize,
        JSON.stringify(item.externalServers),
        item.thumbnailUrl,
        item.id,
      ]
    );
    if (item.restoredVideo) restoredEpVideos++;
    if (item.restoredThumb) restoredEpThumbs++;
  }

  for (const tr of plan.restoreTrailers) {
    await db.query(
      `UPDATE anime_content SET trailer_site = 'gdrive', updated_at = NOW() WHERE id = $1`,
      [tr.id]
    );
  }

  for (const hep of plan.restoreHentaiEpisodes) {
    await db.query(
      `UPDATE hentai_episodes SET video_servers = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(hep.videoServers), hep.id]
    );
  }

  for (const ch of plan.restoreMangaChapters) {
    await db.query(
      `INSERT INTO manga_page_cache (chapter_url, pages, fetched_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (chapter_url) DO UPDATE
       SET pages = EXCLUDED.pages, fetched_at = NOW()`,
      [ch.chapter_url, JSON.stringify(ch.pages)]
    );
  }

  if (!quiet) {
    console.log(
      `[DriveRestore] ✓ Inventario Drive: ${inventoryMap.size} archivos | eps=${plan.driveInventorySummary.videos}, thumbs=${plan.driveInventorySummary.thumbs}, trailers=${plan.driveInventorySummary.trailers}, hentai=${plan.driveInventorySummary.hentai}, mangaCols=${plan.driveInventorySummary.mangaFolders}`
    );
    console.log(
      `[DriveRestore] ✓ Restaurado en BD: ${restoredEpVideos} anime eps, ${restoredEpThumbs} miniaturas, ${plan.restoreTrailers.length} trailers, ${plan.restoreHentaiEpisodes.length} hentai eps, ${plan.restoreMangaChapters.length} capítulos manga`
    );
    if (plan.skippedIncompleteManga.length > 0) {
      console.log(
        `[DriveRestore] ⚠ Capítulos manga omitidos (${plan.skippedIncompleteManga.length}): ${plan.skippedIncompleteManga
          .slice(0, 5)
          .map((s) => `${s.key}:${s.reason}`)
          .join(', ')}`
      );
    }
  }

  return {
    restoredEpVideos,
    restoredEpThumbs,
    restoredTrailers: plan.restoreTrailers.length,
    restoredHentaiEpisodes: plan.restoreHentaiEpisodes.length,
    restoredMangaChapters: plan.restoreMangaChapters.length,
    skippedIncompleteManga: plan.skippedIncompleteManga.length,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const repair = args.has('--repair');
  const restore = args.has('--restore');
  const forceWipe = args.has('--force');
  const quiet = args.has('--quiet');

  if (!restore && !isHttpDriveServerUp()) {
    console.error('[DriveVerify] ✖ El servidor local Drive HTTP (http://127.0.0.1:8086) no responde.');
    process.exit(1);
  }

  const inventoryMap = fetchAuthoritativeInventory();
  const db = await getPool();

  if (restore) {
    await runRestore(db, inventoryMap, { quiet });
    return;
  }

  const [epRes, trRes, heRes, mgRes] = await Promise.all([
    db.query(
      `SELECT id, anime_id, episode_number, stream_url, storage_type, video_url, external_servers, thumbnail_url
       FROM anime_episodes
       WHERE is_active = true
         AND (stream_url LIKE '%/api/stream/%' OR storage_type = 'gdrive' OR thumbnail_url LIKE '%/api/stream/%')`
    ),
    db.query(
      `SELECT id, trailer_id, trailer_site
       FROM anime_content
       WHERE is_active = true AND LOWER(COALESCE(trailer_site, '')) = 'gdrive'`
    ),
    db.query(
      `SELECT id, hentai_id, episode_number, video_servers
       FROM hentai_episodes
       WHERE is_active = true AND video_servers::text LIKE '%/api/stream/%'`
    ),
    db.query(
      `SELECT chapter_url, pages
       FROM manga_page_cache
       WHERE pages::text LIKE '%/api/stream/Manga/%'`
    ),
  ]);

  const plan = verifyAgainstInventory(inventoryMap, {
    animeEpisodes: epRes.rows,
    animeTrailers: trRes.rows,
    hentaiEpisodes: heRes.rows,
    mangaChapters: mgRes.rows,
  });

  if (!quiet && plan.stats.brokenCount > 0) {
    for (const b of plan.brokenAnimeEpisodes) console.warn(`[DriveVerify] ✖ Anime Ep ${b.id} (${b.relPath}) faltante en Drive (${b.size}B)`);
    for (const b of plan.brokenAnimeThumbs) console.warn(`[DriveVerify] ✖ Thumb Ep ${b.id} (${b.relPath}) faltante en Drive (${b.size}B)`);
    for (const b of plan.brokenTrailers) console.warn(`[DriveVerify] ✖ Trailer Anime ${b.id} (${b.relPath}) faltante en Drive (${b.size}B)`);
    for (const b of plan.brokenHentaiEpisodes) console.warn(`[DriveVerify] ✖ Hentai Ep ${b.id} (${b.relPath}) faltante en Drive (${b.size}B)`);
    for (const b of plan.brokenMangaChapters) console.warn(`[DriveVerify] ✖ Manga ${b.chapter_url} página faltante ${b.relPath} (${b.size}B)`);
  }

  if (repair && (plan.stats.brokenCount > 0 || plan.brokenAnimeThumbs.length > 0)) {
    const safety = canSafelyApplyRepair({
      dbLinkedCount: plan.stats.checked,
      inventorySize: inventoryMap.size,
      verifiedOkCount: plan.stats.ok,
      brokenCount: plan.stats.brokenCount,
      forceWipe,
    });
    if (!safety.safe) {
      console.error(`[DriveVerify] ✖ ${safety.reason}`);
      process.exit(1);
    }
    await applyRepairPlan(db, plan);
    if (!quiet) {
      console.log(`[DriveVerify] ✓ BD reparada: ${plan.stats.brokenCount} enlaces rotos limpiados (+${plan.brokenAnimeThumbs.length} miniaturas).`);
    }
  }

  if (!quiet || plan.stats.brokenCount > 0) {
    console.log(
      `[DriveVerify] Verificación completada (${inventoryMap.size} archivos en Drive): ${plan.stats.checked} comprobados | ${plan.stats.ok} OK | ${plan.stats.brokenCount} rotos`
    );
  }

  if (!repair && plan.stats.brokenCount > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then(() => pool?.end())
    .catch((e) => {
      console.error('[DriveVerify] Error:', e.message);
      pool?.end();
      process.exit(1);
    });
}
