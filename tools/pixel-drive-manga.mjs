#!/usr/bin/env node
/**
 * Pixel No Sekai - Manhwa/Manga Google Drive Ingest Bot
 *
 * Usage:
 *   node tools/pixel-drive-manga.mjs --chapter-url "https://dragontranslation.org/manga/slug/capitulo-1/"
 *   node tools/pixel-drive-manga.mjs --manga-id "slug" --limit 5
 */

import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
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
const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream/Manga';

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

/** Ingest a single chapter into Google Drive */
export async function ingestChapter(chapterUrl) {
  const cleanUrl = String(chapterUrl || '').trim();
  const { mangaId, chapterSlug } = parseMangaChapter(cleanUrl);

  console.log(`\n[MangaIngest] ─────────────────────────────────────────────`);
  console.log(`[MangaIngest] Procesando Manhwa: ${mangaId} | Capítulo: ${chapterSlug}`);

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

  // Comprobar si ya están en Drive
  const isAlreadyDrive = rawPages.every((p) => typeof p === 'string' && p.includes('/api/stream/Manga/'));
  if (isAlreadyDrive) {
    console.log(`[MangaIngest] ✓ El capítulo ya está alojado en Google Drive.`);
    return true;
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

    // 3. Subir carpeta completa con rclone copy
    await runCommand('rclone', ['copy', tmpChapterDir, driveTargetDir]);
    console.log(`[MangaIngest] ✓ Imágenes subidas exitosamente a Google Drive.`);

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

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--chapter-url')) {
    const url = args[args.indexOf('--chapter-url') + 1];
    await ingestChapter(url);
  } else if (args.includes('--manga-id')) {
    const id = args[args.indexOf('--manga-id') + 1];
    const limit = Number(args[args.indexOf('--limit') + 1]) || 5;
    await ingestManga(id, limit);
  } else {
    console.log(`
Uso de pixel-drive-manga:
  node tools/pixel-drive-manga.mjs --chapter-url "<URL_DEL_CAPITULO>"
  node tools/pixel-drive-manga.mjs --manga-id "<MANGA_SLUG>" [--limit 5]
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
