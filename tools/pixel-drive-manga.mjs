#!/usr/bin/env node
/**
 * Pixel No Sekai - Manhwa/Manga Google Drive Ingest Bot
 *
 * Usage:
 *   node tools/pixel-drive-manga.mjs --chapter-url "https://dragontranslation.org/manga/slug/capitulo-1/"
 *   node tools/pixel-drive-manga.mjs --manga-id "slug" --limit 5
 */

import { existsSync, mkdirSync, rmSync, statSync, unlinkSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
import { spawn, spawnSync } from 'node:child_process';
let pool;
async function getPool() {
  if (!pool) {
    const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
    if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) process.loadEnvFile(envFile);
    ({ default: pool } = await import('../server/db.js'));
  }
  return pool;
}

const INGEST_DIR = join(homedir(), 'server/data/pixel-ingest/manga');
const RCLONE_REMOTE = 'pixel-drive:PixelNoSekai/Manga';
const RCLONE_BIN = existsSync('/data/data/com.termux/files/usr/bin/rclone') ? '/data/data/com.termux/files/usr/bin/rclone' : 'rclone';
const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream/Manga';
const RCLONE_THROTTLE = ['--transfers', '2', '--checkers', '2', '--bwlimit', '8M'];
const PAGE_DOWNLOAD_CONCURRENCY = 2;
const verifiedCovers = new Set();

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
    const out = runCapture(RCLONE_BIN, ['ls', '--contimeout', '15s', '--timeout', '30s', rcloneTarget]);
    if (!out) return 0;
    const match = out.match(/^\s*(\d+)\s+/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
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
    const error = new Error(res.stderr || `Command ${bin} exited with status ${res.status}`);
    error.exitCode = res.status;
    throw error;
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

/** Share the backend source cooldown; never retry denial responses in curl. */
async function downloadImage(url, destPath) {
  const partialPath = `${destPath}.part`;
  const source = new URL(url);
  const downloadUrl = source.origin === 'https://dragontranslation.org'
    ? `http://127.0.0.1:3001/api/proxy/manga-image?url=${encodeURIComponent(source.href)}`
    : source.href;
  await runCommand('curl', [
    '-sS',
    '-L',
    '--fail',
    '--connect-timeout', '10', '--max-time', '90',
    '-e', 'https://dragontranslation.org/',
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    downloadUrl,
    '-o', partialPath,
  ]);
  // Keep the original bytes. An HTTP error/HTML response must not become a page.
  imageFingerprint(partialPath);
  renameSync(partialPath, destPath);
}

function imageFingerprint(file) {
  const bytes = readFileSync(file);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const gif = /^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  const avif = bytes.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString());
  if (bytes.length < 32 || !(jpeg || png || gif || webp || avif)) throw new Error(`Respuesta de imagen inválida: ${file.split('/').at(-1)}`);
  return { size: bytes.length, md5: createHash('md5').update(bytes).digest('hex') };
}

function remoteInventory(remoteDir) {
  let entries;
  try {
    entries = JSON.parse(runCapture(RCLONE_BIN, ['lsjson', '--files-only', '--max-depth', '1', '--hash', '--contimeout', '15s', '--timeout', '45s', remoteDir]));
  } catch (error) {
    // rclone 3 means a missing directory; auth/network errors must not look empty.
    if (error.exitCode === 3) return new Map();
    throw error;
  }
  return new Map(entries.map(entry => [entry.Name, {
    size: Number(entry.Size), md5: String(entry.Hashes?.MD5 || entry.Hashes?.md5 || '').toLowerCase(),
  }]));
}

function matchesRemote(remote, expected) {
  return !!remote && remote.size === expected.size && (!remote.md5 || remote.md5 === expected.md5);
}

function saveManifest(path, manifest) {
  writeFileSync(`${path}.tmp`, JSON.stringify(manifest), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

function acquireChapterLock(localDir) {
  const lock = join(localDir, '.resume.lock');
  try { mkdirSync(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let active = true;
    try {
      const owner = Number(readFileSync(join(lock, 'pid'), 'utf8'));
      if (Number.isInteger(owner) && owner > 0) {
        try { process.kill(owner, 0); } catch (check) { if (check.code === 'ESRCH') active = false; }
      }
    } catch {
      // Do not steal a lock while another process is still writing its owner.
      active = Date.now() - statSync(lock).mtimeMs < 300_000;
    }
    if (active) throw new Error('Este capítulo ya se está procesando; el progreso permanece intacto.');
    rmSync(lock, { recursive: true });
    mkdirSync(lock);
  }
  writeFileSync(join(lock, 'pid'), String(process.pid), { mode: 0o600 });
  return () => rmSync(lock, { recursive: true, force: true });
}

/** Resume an interrupted chapter without recompressing or replacing verified pages. */
export async function syncChapterPages(options) {
  mkdirSync(options.localDir, { recursive: true, mode: 0o700 });
  const release = acquireChapterLock(options.localDir);
  try { return await syncChapterPagesUnlocked(options); }
  finally { release(); }
}

async function syncChapterPagesUnlocked({ chapterUrl, originalUrls, localDir, remoteDir,
  download = downloadImage, listRemote = remoteInventory,
  upload = (local, remote) => runCommand(RCLONE_BIN, ['copy', ...RCLONE_THROTTLE, '--ignore-existing', '--include', '*.jpg', local, remote]),
  onProgress = () => {} }) {
  const manifestPath = join(localDir, '.resume.json');
  let manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  if (manifest && (manifest.chapterUrl !== chapterUrl || JSON.stringify(manifest.pages.map(page => page.url)) !== JSON.stringify(originalUrls))) {
    throw new Error('Cambió el origen del capítulo; conservamos el progreso para evitar mezclar páginas.');
  }
  manifest ||= { version: 1, chapterUrl, pages: originalUrls.map((url, index) => ({ url, filename: `${String(index + 1).padStart(3, '0')}.jpg` })) };
  saveManifest(manifestPath, manifest);
  let inventory = await listRemote(remoteDir);
  let cursor = 0, completed = 0, downloaded = 0, failure;
  // Two downloads at most: hide network latency without saturating the tablet.
  await Promise.allSettled(Array.from({ length: Math.min(PAGE_DOWNLOAD_CONCURRENCY, originalUrls.length) }, async () => {
    try {
      while (!failure && cursor < manifest.pages.length) {
        const page = manifest.pages[cursor++];
        const localFile = join(localDir, page.filename);
        if (!(page.size > 0 && matchesRemote(inventory.get(page.filename), page))) {
          let local = null;
          if (existsSync(localFile)) {
            try { local = imageFingerprint(localFile); } catch { /* Redownload an incomplete local image. */ }
          }
          if (!local || (page.md5 && local.md5 !== page.md5)) {
            await download(page.url, localFile);
            local = imageFingerprint(localFile);
            downloaded++;
          }
          Object.assign(page, local);
          const remote = inventory.get(page.filename);
          if (remote && !matchesRemote(remote, page)) {
            throw new Error(`La página remota ${page.filename} no coincide con el origen; no se sobrescribió.`);
          }
          saveManifest(manifestPath, manifest);
        }
        onProgress({ completed: ++completed, total: manifest.pages.length, downloaded });
      }
    } catch (error) { failure ||= error; }
  }));
  if (failure) throw failure;
  const pending = manifest.pages.filter(page => !matchesRemote(inventory.get(page.filename), page));
  if (pending.length) {
    await upload(localDir, remoteDir);
    inventory = await listRemote(remoteDir);
  }
  const missing = manifest.pages.filter(page => !matchesRemote(inventory.get(page.filename), page));
  if (missing.length) throw new Error(`Verificación incompleta en Drive: ${missing.length}/${manifest.pages.length} páginas pendientes.`);
  // Keep the small checkpoint, not a second full manga library on the tablet.
  // Cleanup stays inside the chapter lock, after every remote page verifies.
  for (const page of manifest.pages) {
    for (const suffix of ['', '.part']) {
      const file = join(localDir, page.filename + suffix);
      if (existsSync(file)) unlinkSync(file);
    }
  }
  return { pages: manifest.pages, downloaded, uploaded: pending.length };
}

/** Sync manga cover image first (lightweight & fast) */
async function syncMangaCover(mangaId) {
  if (verifiedCovers.has(mangaId)) return true;
  const pool = await getPool();
  const coverRemote = `${RCLONE_REMOTE}/${mangaId}/cover.jpg`;
  if (getRemoteFileSize(coverRemote) > 500) {
    verifiedCovers.add(mangaId);
    return true;
  }
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
          verifiedCovers.add(mangaId);
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
  const pool = await getPool();
  const cleanUrl = String(chapterUrl || '').trim();
  const { mangaId, chapterSlug } = parseMangaChapter(cleanUrl);
  mkdirSync(INGEST_DIR, { recursive: true, mode: 0o700 });
  const tmpChapterDir = join(INGEST_DIR, `${mangaId}_${chapterSlug}`);
  const driveTargetDir = `${RCLONE_REMOTE}/${mangaId}/chapters/${chapterSlug}`;

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

  // One listing verifies every expected page, including pages in the middle.
  const isAlreadyDrive = rawPages.every((p) => typeof p === 'string' && p.includes('/api/stream/Manga/'));
  if (isAlreadyDrive) {
    let inventory, checkpoint;
    try {
      inventory = remoteInventory(driveTargetDir);
      const manifestPath = join(tmpChapterDir, '.resume.json');
      if (existsSync(manifestPath)) checkpoint = JSON.parse(readFileSync(manifestPath, 'utf8'));
    }
    catch (error) {
      console.error(`[MangaIngest] No se pudo verificar Drive; conservamos la caché: ${error.message}`);
      return false;
    }
    const allPresent = rawPages.every((page, index) => {
      const filename = `${String(index + 1).padStart(3, '0')}.jpg`;
      const expected = checkpoint?.chapterUrl === cleanUrl && checkpoint.pages?.length === rawPages.length ? checkpoint.pages[index] : null;
      const validFile = expected ? matchesRemote(inventory.get(filename), expected) : !checkpoint && inventory.get(filename)?.size > 32;
      return page === `${BASE_STREAM_URL}/${mangaId}/chapters/${chapterSlug}/${filename}` && validFile;
    });
    if (allPresent) {
      console.log(`[MangaIngest] ✓ El capítulo ya está alojado y verificado en Google Drive.`);
      return true;
    }
    console.warn(`[MangaIngest] ⚠ Faltan páginas en Drive; recuperando solo lo pendiente sin borrar la caché...`);
    if (checkpoint?.chapterUrl === cleanUrl && checkpoint.pages?.every(page => typeof page.url === 'string')) {
      rawPages = checkpoint.pages.map(page => page.url);
    } else {
      const { getChapterPages } = await import('../server/services/mangaService.js');
      // Null bypasses DB without deleting existing Drive URLs before repair succeeds.
      const refreshed = await getChapterPages(null, cleanUrl);
      rawPages = refreshed?.pages || [];
    }
    if (!rawPages.length || rawPages.some((p) => typeof p === 'string' && p.includes('/api/stream/Manga/'))) {
      console.error(`[MangaIngest] ✖ No se pudo recuperar páginas válidas de origen para ${cleanUrl}`);
      return false;
    }
  }

  // 2. Extraer URLs absolutas de origen
  const originalUrls = rawPages.map((p) => {
    if (typeof p !== 'string') throw new Error('La lista de páginas contiene un origen inválido.');
    if (p.includes('/api/proxy/manga-image?url=')) {
      const match = p.match(/[?&]url=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : p;
    }
    return p;
  });
  if (originalUrls.some(url => !/^https?:\/\//i.test(url) || url.includes('/api/stream/'))) {
    console.error('[MangaIngest] Lista de páginas de origen inválida; no se cambió la caché.');
    return false;
  }

  console.log(`[MangaIngest] Reanudando ${originalUrls.length} páginas originales (2 descargas simultáneas, sin recomprimir)...`);

  try {
    const result = await syncChapterPages({ chapterUrl: cleanUrl, originalUrls, localDir: tmpChapterDir, remoteDir: driveTargetDir,
      onProgress: ({ completed, total, downloaded }) => process.stdout.write(`\r[MangaIngest] Preparadas: ${completed}/${total} páginas (${downloaded} descargadas)...`),
    });
    const newDrivePages = result.pages.map(page => `${BASE_STREAM_URL}/${mangaId}/chapters/${chapterSlug}/${page.filename}`);
    console.log(`\n[MangaIngest] ✓ Todas las páginas verificadas en Drive (${result.pages.length}; ${result.downloaded} descargas, ${result.uploaded} subidas pendientes completadas).`);

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
    console.log('[MangaIngest] Progreso conservado; el próximo lote retomará las páginas pendientes.');
    return false;
  }
}

/** Ingest all chapters for a given manga slug */
export async function ingestManga(mangaId, limit = 50) {
  const pool = await getPool();
  console.log(`[MangaIngest] Buscando capítulos de manga "${mangaId}" en catálogo...`);
  let { rows } = await pool.query(
    `
      SELECT mc.external_url AS chapter_url
      FROM manga_chapters_cache mc
      LEFT JOIN manga_page_cache mp ON mp.chapter_url = mc.external_url
      WHERE mc.manga_id = $1 AND mc.external_url IS NOT NULL
        AND (mp.pages IS NULL OR mp.pages::text NOT LIKE '%/api/stream/Manga/%')
      ORDER BY NULLIF(regexp_replace(mc.chapter, '[^0-9.]', '', 'g'), '')::numeric ASC NULLS LAST
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
          AND pages::text NOT LIKE '%/api/stream/Manga/%'
        ORDER BY chapter_url ASC
        LIMIT $2
      `,
      [`%/manga/${mangaId}/%`, limit]
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

/** Ingest pending chapters across the catalog into Google Drive (completes one manga before moving to the next, prioritizing user-read manga) */
export async function ingestBatchManga(limit = 3) {
  const pool = await getPool();
  console.log(`[MangaIngest] Buscando hasta ${limit} capítulos del manga en curso o leído por usuarios para completar antes de pasar al siguiente...`);
  const { rows } = await pool.query(
    `
      WITH target_manga AS (
        SELECT
          mc.manga_id,
          COUNT(*) FILTER (WHERE mp.pages::text LIKE '%/api/stream/Manga/%') AS synced_count,
          COUNT(*) FILTER (WHERE mp.pages IS NOT NULL AND mp.pages::text NOT LIKE '%/api/stream/Manga/%') AS read_pending_count,
          MAX(mp.fetched_at) AS last_read_at,
          EXISTS (
            SELECT 1 FROM pns_my_list_items ml
            WHERE ml.content_type = 'manga' AND ml.content_id = mc.manga_id
          ) AS in_my_list
        FROM manga_chapters_cache mc
        LEFT JOIN manga_page_cache mp ON mp.chapter_url = mc.external_url
        WHERE mc.external_url IS NOT NULL
        GROUP BY mc.manga_id
        HAVING COUNT(*) FILTER (WHERE mp.pages IS NULL OR mp.pages::text NOT LIKE '%/api/stream/Manga/%') > 0
        ORDER BY
          (COUNT(*) FILTER (WHERE mp.pages::text LIKE '%/api/stream/Manga/%') > 0) DESC,
          (COUNT(*) FILTER (WHERE mp.pages IS NOT NULL AND mp.pages::text NOT LIKE '%/api/stream/Manga/%') >= 3) DESC,
          EXISTS (
            SELECT 1 FROM pns_my_list_items ml
            WHERE ml.content_type = 'manga' AND ml.content_id = mc.manga_id
          ) DESC,
          (COUNT(*) FILTER (WHERE mp.pages IS NOT NULL AND mp.pages::text NOT LIKE '%/api/stream/Manga/%') >= 1) DESC,
          COUNT(*) FILTER (WHERE mp.pages IS NOT NULL AND mp.pages::text NOT LIKE '%/api/stream/Manga/%') DESC,
          MAX(mp.fetched_at) DESC NULLS LAST,
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
  .then(() => pool?.end())
  .catch((e) => {
    console.error('[MangaIngest] Error:', e.message);
    pool?.end();
    process.exit(1);
  });
