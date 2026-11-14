import { pathToFileURL } from 'node:url';
import { normalizeTrailer, searchAniListMetadata } from '../services/anilistService.js';

export const MAX_BACKFILL_LIMIT = 10;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;

/**
 * Normaliza un título para comparación exacta insensible a mayúsculas, espacios y puntuación.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTitle(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Verifica si algún título original o en inglés del registro coincide exactamente
 * (normalizado) con algún título devuelto por el proveedor.
 * @param {{ title?: string, title_english?: string }} anime
 * @param {{ title?: string, title_english?: string, title_romaji?: string }|null} metadata
 * @returns {boolean}
 */
export function hasExactNormalizedTitleMatch(anime, metadata) {
  if (!anime || !metadata) return false;

  const dbTitles = new Set(
    [anime.title, anime.title_english]
      .map(normalizeTitle)
      .filter(Boolean)
  );

  if (dbTitles.size === 0) return false;

  const providerTitles = [
    metadata.title,
    metadata.title_english,
    metadata.title_romaji,
  ]
    .map(normalizeTitle)
    .filter(Boolean);

  return providerTitles.some((t) => dbTitles.has(t));
}

/**
 * Parsea argumentos CLI aplicando techo estricto de 10 registros por ejecución.
 * @param {string[]} argv
 * @returns {{ limit: number }}
 */
export function parseBackfillArgs(argv = process.argv.slice(2)) {
  let rawLimit;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg.startsWith('--limit=')) {
      rawLimit = arg.slice('--limit='.length);
      break;
    }
    if (arg === '--limit' && i + 1 < argv.length) {
      rawLimit = argv[i + 1];
      break;
    }
  }

  const parsed = Number.parseInt(String(rawLimit ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { limit: MAX_BACKFILL_LIMIT };
  }

  return { limit: Math.min(parsed, MAX_BACKFILL_LIMIT) };
}

async function callWithTimeout(fn, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Provider timeout (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ejecuta el backfill de tráileres consultando al proveedor como máximo una vez por registro.
 * @param {object} options
 * @param {object} options.dbPool - Pool compatible con .query(sql, params)
 * @param {Function} [options.provider] - Proveedor de metadatos (1 llamada por registro)
 * @param {number} [options.limit] - Límite solicitado (tope 10)
 * @param {number} [options.timeoutMs] - Timeout por consulta al proveedor
 */
export async function runBackfillTrailers({
  dbPool,
  provider = searchAniListMetadata,
  limit = MAX_BACKFILL_LIMIT,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  newest = false,
} = {}) {
  if (!dbPool || typeof dbPool.query !== 'function') {
    throw new Error('dbPool válido requerido');
  }

  const safeLimit = Math.min(
    Math.max(Number.parseInt(String(limit ?? MAX_BACKFILL_LIMIT), 10) || MAX_BACKFILL_LIMIT, 1),
    MAX_BACKFILL_LIMIT
  );

  const selectResult = await dbPool.query(
    `
      SELECT id, title, title_english, trailer_id, trailer_site, trailer_checked_at
      FROM anime_content
      WHERE is_active = true
        AND (trailer_id IS NULL OR trailer_id = '')
        AND trailer_checked_at IS NULL
      ORDER BY id ${newest ? 'DESC' : 'ASC'}
      LIMIT $1
    `,
    [safeLimit]
  );

  const rows = selectResult.rows || [];
  const summary = {
    processed: 0,
    updated: 0,
    checkedNoTrailer: 0,
    skippedManual: 0,
    errors: 0,
  };

  for (const anime of rows) {
    summary.processed += 1;

    // Defensa adicional: nunca sobrescribir tráiler manual existente
    if (anime.trailer_id) {
      summary.skippedManual += 1;
      continue;
    }

    const searchTitle = (anime.title_english || anime.title || '').trim();
    let metadata = null;

    if (searchTitle) {
      try {
        metadata = await callWithTimeout(() => provider(searchTitle), timeoutMs);
      } catch (err) {
        summary.errors += 1;
        console.error(`[backfill-trailers] Error consultando proveedor para ID ${anime.id}: ${err.message}`);
        continue;
      }
    }

    const titleMatched = hasExactNormalizedTitleMatch(anime, metadata);
    const normalized = titleMatched && metadata
      ? normalizeTrailer({ id: metadata.trailer_id, site: metadata.trailer_site })
      : { trailer_id: null, trailer_site: null };

    if (titleMatched && normalized.trailer_id && normalized.trailer_site === 'youtube') {
      const updateRes = await dbPool.query(
        `
          UPDATE anime_content
          SET trailer_id = $1,
              trailer_site = $2,
              trailer_checked_at = NOW(),
              updated_at = NOW()
          WHERE id = $3
            AND (trailer_id IS NULL OR trailer_id = '')
        `,
        [normalized.trailer_id, normalized.trailer_site, anime.id]
      );

      if (updateRes.rowCount > 0) {
        summary.updated += 1;
      } else {
        summary.skippedManual += 1;
      }
    } else {
      await dbPool.query(
        `
          UPDATE anime_content
          SET trailer_checked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
            AND (trailer_id IS NULL OR trailer_id = '')
        `,
        [anime.id]
      );
      summary.checkedNoTrailer += 1;
    }
  }

  return summary;
}

async function main() {
  const { default: pool } = await import('../db.js');
  const { limit } = parseBackfillArgs(process.argv.slice(2));

  try {
    const summary = await runBackfillTrailers({ dbPool: pool, limit, newest: process.argv.includes('--newest') });
    console.log('[backfill-trailers] Completado:', JSON.stringify(summary));
  } finally {
    await pool.end();
  }
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((err) => {
    console.error('[backfill-trailers] Error fatal:', err.message);
    process.exit(1);
  });
}
