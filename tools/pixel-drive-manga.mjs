#!/usr/bin/env node
/**
 * Pixel No Sekai - Manhwa/Manga Google Drive Ingest Bot
 *
 * Usage:
 *   node tools/pixel-drive-manga.mjs --chapter-url "https://dragontranslation.org/manga/slug/capitulo-1/"
 *   node tools/pixel-drive-manga.mjs --manga-id "slug" --limit 5
 */

import { existsSync, mkdirSync, rmSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

import { spawn, spawnSync } from 'node:child_process';
const { default: pool } = await import('../server/db.js');

const INGEST_DIR = join(homedir(), 'server/data/pixel-ingest/manga');
const RCLONE_REMOTE = 'pixel-drive:PixelNoSekai/Manga';
const RCLONE_BIN = existsSync('/data/data/com.termux/files/usr/bin/rclone') ? '/data/data/com.termux/files/usr/bin/rclone' : 'rclone';
const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream/Manga';
const RCLONE_THROTTLE = ['--transfers', '2', '--checkers', '2', '--bwlimit', '8M'];

function getRemoteFileSize(remoteOrStreamUrl) {
  try {
    let rel = String(remoteOrStreamUrl || '');
    if (rel.includes('/api/stream/')) {
      rel = rel.split('/api/stream/')[1] || '';
    } else {
      rel = rel.replace(/^pixel-drive:PixelNoSekai\/?/, '');
    }
    const encodedRel = rel.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const httpCheck = spawnSync('curl', ['-sI', '-f', '--max-time', '4', `http://127.0.0.1:8086/${encodedRel}`], { encoding: 'utf8' });
    if (httpCheck.status === 0) {
      const lenMatch = (httpCheck.stdout || '').match(/Content-Length:\s*(\d+)/i);
      const bytes = lenMatch ? Number(lenMatch[1]) : 0;
      if (bytes > 0) return bytes;
    }
  } catch {}
  try {
    let rcloneTarget = String(remoteOrStreamUrl || '');
    if (rcloneTarget.includes('/api/stream/')) {
      const rel = rcloneTarget.split('/api/stream/')[1] || '';
      rcloneTarget = `pixel-drive:PixelNoSekai/${decodeURIComponent(rel)}`;
    }
    const out = runCapture(RCLONE_BIN, ['ls', rcloneTarget]);
    if (!out) return 0;
    const match = out.match(/^\s*(\d+)\s+/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

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

/** Parse manga slug and chapter slug from URL */
function parseMangaChapter(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.replace(/^\/manga\//, '').replace(/\/$/, '').split('/');
    if (parts.length >= 2) {
      return { mangaId: parts[0], chapterSlug: parts[1] };
    }
    return { mangaId: parts[0] || 'manga', chapterSlug: 'capitulo-1' };
  } catch {
    return { mangaId: 'manga', chapterSlug: 'capitulo-1' };
  }
}

/** Download a single image using curl with referer */
async function downloadImage(url, destPath) {
  await runCommand('curl', [
    '-sS',
    '-L',
    '--max-time', '30',
    '-e', 'https://dragontranslation.org/',
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    url,
    '-o', destPath,
  ]);
}

/** Sync manga cover image first (lightweight & fast) */
async function syncMangaCover(mangaId) {
  const coverRemote = `${RCLONE_REMOTE}/${mangaId}/cover.jpg`;
  if (getRemoteFileSize(coverRemote) > 500) return true;
  try {
    const { rows } = await pool.query('SELECT cover_url, title FROM manga_cache WHERE manga_id = $1 LIMIT 1', [mangaId]);
    const coverUrl = rows[0]?.cover_url;
    if (!coverUrl || !/^https?:\/\//i.test(coverUrl)) return false;
    console.log(`[MangaIngest] Subiendo portada de manga "${mangaId}"...`);
    const tmpCover = join(INGEST_DIR, `tmp_cover_${mangaId}.jpg`);
    try {
      await downloadImage(coverUrl, tmpCover);
      if (existsSync(tmpCover) && statSync(tmpCover).size > 500) {
        await runCommand(RCLONE_BIN, ['copyto', ...RCLONE_THROTTLE, tmpCover, coverRemote]);
        if (getRemoteFileSize(coverRemote) > 500) {
          console.log(`[MangaIngest] ✓ Portada de manga subida: ${coverRemote}`);
          return true;
        }
      }
    } finally {
      if (existsSync(tmpCover)) unlinkSync(tmpCover);
    }
  } catch (e) {
    console.warn(`[MangaIngest] No se pudo subir portada de ${mangaId}:`, e.message);
  }
  return false;
}

/** Ingest a single chapter into Google Drive */
export async function ingestChapter(chapterUrl) {
  const cleanUrl = String(chapterUrl || '').trim();
  const { mangaId, chapterSlug } = parseMangaChapter(cleanUrl);

  console.log(`\n[MangaIngest] ─────────────────────────────────────────────`);
  console.log(`[MangaIngest] Procesando Manhwa: ${mangaId} | Capítulo: ${chapterSlug}`);

  await syncMangaCover(mangaId);

  // 1. Obtener lista de páginas desde BD (manga_page_cache)
  const { rows } = await pool.query(
    'SELECT pages FROM manga_page_cache WHERE chapter_url = $1',
    [cleanUrl]
  );

  let rawPages = [];
  if (rows.length && Array.isArray(rows[0].pages)) {
    rawPages = rows[0].pages;
  } else {
    // Si aún no está en cache, llamar getChapterPages de mangaService
    console.log(`[MangaIngest] Obteniendo páginas desde origen...`);
    const { getChapterPages } = await import('../server/services/mangaService.js');
    const res = await getChapterPages(pool, cleanUrl);
    rawPages = res?.pages || [];
  }

  if (!rawPages.length) {
    console.error(`[MangaIngest] ✖ No se encontraron páginas para ${cleanUrl}`);
    return false;
  }

  // Comprobar si ya están en Drive y verificar existencia real vía HTTP local
  const isAlreadyDrive = rawPages.every((p) => typeof p === 'string' && p.includes('/api/stream/Manga/'));
  if (isAlreadyDrive) {
    const firstOk = getRemoteFileSize(rawPages[0]) > 500;
    const lastOk = getRemoteFileSize(rawPages[rawPages.length - 1]) > 500;
    if (firstOk && lastOk) {
      console.log(`[MangaIngest] ✓ El capítulo ya está alojado y verificado en Google Drive.`);
      return true;
    }
    console.warn(`[MangaIngest] ⚠ Cache Drive incompleto o inaccesible; re-obteniendo desde origen...`);
    await pool.query('DELETE FROM manga_page_cache WHERE chapter_url = $1', [cleanUrl]);
    const { getChapterPages } = await import('../server/services/mangaService.js');
    const refreshed = await getChapterPages(pool, cleanUrl);
    rawPages = refreshed?.pages || [];
    if (!rawPages.length || rawPages.some((p) => typeof p === 'string' && p.includes('/api/stream/Manga/'))) {
      console.error(`[MangaIngest] ✖ No se pudo recuperar páginas válidas de origen para ${cleanUrl}`);
      return false;
    }
  }

  // 2. Extraer URLs absolutas de origen
  const originalUrls = rawPages.map((p) => {
    if (typeof p !== 'string') return '';
    if (p.includes('/api/proxy/manga-image?url=')) {
      const match = p.match(/[?&]url=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : p;
    }
    return p;
  }).filter(Boolean);

  console.log(`[MangaIngest] Descargando ${originalUrls.length} páginas a carpeta local temporal...`);
  const tmpChapterDir = join(INGEST_DIR, `${mangaId}_${chapterSlug}`);
  if (existsSync(tmpChapterDir)) rmSync(tmpChapterDir, { recursive: true, force: true });
  mkdirSync(tmpChapterDir, { recursive: true });

  const driveTargetDir = `${RCLONE_REMOTE}/${mangaId}/chapters/${chapterSlug}`;
  const newDrivePages = [];

  try {
    for (let i = 0; i < originalUrls.length; i++) {
      const pageNumStr = String(i + 1).padStart(3, '0');
      const filename = `${pageNumStr}.jpg`;
      const localFile = join(tmpChapterDir, filename);

      await downloadImage(originalUrls[i], localFile);
      newDrivePages.push(`${BASE_STREAM_URL}/${mangaId}/chapters/${chapterSlug}/${filename}`);
      process.stdout.write(`\r[MangaIngest] Descargadas: ${i + 1}/${originalUrls.length} páginas...`);
    }
    console.log(`\n[MangaIngest] Subiendo lote de imágenes a Google Drive (${driveTargetDir})...`);

    // 3. Subir carpeta completa con rclone copy (limitado)
    await runCommand(RCLONE_BIN, ['copy', ...RCLONE_THROTTLE, tmpChapterDir, driveTargetDir]);

    // Verificar primera y última página en Drive antes de actualizar BD
    const firstPageRemote = `${driveTargetDir}/001.jpg`;
    const lastPageFilename = `${String(originalUrls.length).padStart(3, '0')}.jpg`;
    const lastPageRemote = `${driveTargetDir}/${lastPageFilename}`;
    const firstSize = getRemoteFileSize(firstPageRemote);
    const lastSize = getRemoteFileSize(lastPageRemote);
    if (firstSize <= 500 || lastSize <= 500) {
      throw new Error(`Verificación en Drive falló (primera: ${firstSize} B, última: ${lastSize} B)`);
    }
    console.log(`[MangaIngest] ✓ Imágenes verificadas en Google Drive (${originalUrls.length} págs, p1=${firstSize} B).`);

    // 4. Actualizar manga_page_cache con las URLs de Drive
    await pool.query(
      `
        INSERT INTO manga_page_cache (chapter_url, pages, fetched_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (chapter_url)
        DO UPDATE SET pages = $2::jsonb, fetched_at = NOW()
      `,
      [cleanUrl, JSON.stringify(newDrivePages)]
    );
    console.log(`[MangaIngest] ✓ Cache de páginas actualizado en BD. ¡Lectura desde Drive lista!`);
    return true;
  } catch (err) {
    console.error(`\n[MangaIngest] Error durante la ingesta:`, err.message);
    return false;
  } finally {
    if (existsSync(tmpChapterDir)) {
      rmSync(tmpChapterDir, { recursive: true, force: true });
    }
  }
}

/** Ingest all chapters for a given manga slug */
export async function ingestManga(mangaId, limit = 50) {
  console.log(`[MangaIngest] Buscando capítulos de manga "${mangaId}" en catálogo...`);
  let { rows } = await pool.query(
    `
      SELECT external_url AS chapter_url
      FROM manga_chapters_cache
      WHERE manga_id = $1 AND external_url IS NOT NULL
      ORDER BY NULLIF(regexp_replace(chapter, '[^0-9.]', '', 'g'), '')::numeric ASC NULLS LAST
      LIMIT $2
    `,
    [mangaId, limit]
  );

  if (!rows.length) {
    // Fallback a manga_page_cache
    const fallback = await pool.query(
      `
        SELECT chapter_url
        FROM manga_page_cache
        WHERE chapter_url LIKE $1
        ORDER BY chapter_url ASC
        LIMIT $2
      `,
      [`%${mangaId}%`, limit]
    );
    rows = fallback.rows;
  }

  if (!rows.length) {
    console.log(`[MangaIngest] No se encontraron capítulos registrados para ${mangaId}.`);
    return;
  }

  console.log(`[MangaIngest] Procesando ${rows.length} capítulos...`);
  for (const row of rows) {
    await ingestChapter(row.chapter_url);
  }
}

/** Ingest pending chapters across the catalog into Google Drive (completes one manga before moving to the next) */
export async function ingestBatchManga(limit = 3) {
  console.log(`[MangaIngest] Buscando hasta ${limit} capítulos del manga en curso para completar antes de pasar al siguiente...`);
  const { rows } = await pool.query(
    `
      WITH target_manga AS (
        SELECT
          mc.manga_id,
          COUNT(*) FILTER (WHERE mp.pages::text LIKE '%/api/stream/Manga/%') AS synced_count
        FROM manga_chapters_cache mc
        LEFT JOIN manga_page_cache mp ON mp.chapter_url = mc.external_url
        WHERE mc.external_url IS NOT NULL
        GROUP BY mc.manga_id
        HAVING COUNT(*) FILTER (WHERE mp.pages IS NULL OR mp.pages::text NOT LIKE '%/api/stream/Manga/%') > 0
        ORDER BY
          (COUNT(*) FILTER (WHERE mp.pages::text LIKE '%/api/stream/Manga/%') > 0) DESC,
          mc.manga_id ASC
        LIMIT 1
      )
      SELECT mc.manga_id, mc.chapter, mc.external_url AS chapter_url
      FROM manga_chapters_cache mc
      JOIN target_manga tm ON tm.manga_id = mc.manga_id
      LEFT JOIN manga_page_cache mp ON mp.chapter_url = mc.external_url
      WHERE mc.external_url IS NOT NULL
        AND (mp.pages IS NULL OR mp.pages::text NOT LIKE '%/api/stream/Manga/%')
      ORDER BY NULLIF(regexp_replace(mc.chapter, '[^0-9.]', '', 'g'), '')::numeric ASC NULLS LAST, mc.chapter ASC
      LIMIT $1
    `,
    [limit]
  );

  if (!rows.length) {
    console.log(`[MangaIngest] No hay capítulos pendientes para subir.`);
    return;
  }

  console.log(`[MangaIngest] Completando Manga "${rows[0].manga_id}" (${rows.length} capítulos en este lote)...`);
  for (const row of rows) {
    await ingestChapter(row.chapter_url);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limitVal = limitIdx >= 0 ? Number(args[limitIdx + 1]) : NaN;

  if (args.includes('--chapter-url')) {
    const url = args[args.indexOf('--chapter-url') + 1];
    await ingestChapter(url);
  } else if (args.includes('--manga-id')) {
    const id = args[args.indexOf('--manga-id') + 1];
    const limit = Number.isFinite(limitVal) && limitVal > 0 ? limitVal : 5;
    await ingestManga(id, limit);
  } else if (args.includes('--batch')) {
    const limit = Number.isFinite(limitVal) && limitVal > 0 ? limitVal : 3;
    await ingestBatchManga(limit);
  } else {
    console.log(`
Uso de pixel-drive-manga:
  node tools/pixel-drive-manga.mjs --chapter-url "<URL_DEL_CAPITULO>"
  node tools/pixel-drive-manga.mjs --manga-id "<MANGA_SLUG>" [--limit 5]
  node tools/pixel-drive-manga.mjs --batch [--limit 3]
    `);
  }
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error('[MangaIngest] Error:', e.message);
    pool.end();
    process.exit(1);
  });
