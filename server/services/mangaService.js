import { extractPublicationType } from './mangaFormat.js';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import net from 'net';
import { createChapterPageLoader, bestMangaImageUrl } from './mangaPageCache.js';

let launchCloak = null;
try {
  // CloakBrowser solo en plataformas compatibles (no Android Termux)
  if (process.platform !== 'android') {
    const cloak = await import('cloakbrowser');
    launchCloak = cloak.launch;
  }
} catch (e) {
  // CloakBrowser no disponible en este entorno
}

const BASE_URL = 'https://dragontranslation.org';
const TIMEOUT = 60000;

let browserInstance = null;
let currentProxyMode = null; // null | string

/**
 * Verifica rápidamente si un servidor proxy SOCKS5 responde en el puerto especificado
 */
function isProxyReachable(proxyUrl, timeoutMs = 1500) {
  return new Promise(resolve => {
    try {
      const parsed = new URL(proxyUrl);
      const port = parseInt(parsed.port, 10) || 1080;
      const host = parsed.hostname;
      const socket = net.createConnection({ host, port, timeout: timeoutMs });
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Resuelve qué proxy usar:
 * Lee de MANGA_PROXY (lista separada por comas) o usa el del celular por defecto (100.95.206.57:1080).
 * Retorna el primer proxy activo o null si ninguno responde.
 */
export async function resolveActiveProxy() {
  const defaultProxies = 'socks5://127.0.0.1:1080,socks5://100.109.195.44:1080,socks5://100.95.206.57:1080';
  const envProxies = (process.env.MANGA_PROXY || process.env.PROXY_SOCKS5 || defaultProxies)
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  for (const proxy of envProxies) {
    const reachable = await isProxyReachable(proxy);
    if (reachable) {
      return proxy;
    }
  }
  return null;
}

export async function closeBrowserInstance() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch {}
    browserInstance = null;
    currentProxyMode = null;
  }
}

async function fetchWithAxios(url, proxyUrl = null, timeoutMs = 15000) {
  const agent = proxyUrl ? new SocksProxyAgent(proxyUrl) : undefined;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Referer': 'https://dragontranslation.org/'
    },
    httpAgent: agent,
    httpsAgent: agent,
    timeout: timeoutMs,
    validateStatus: s => s < 500
  });

  if (res.status === 404) {
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }

  if (res.status === 200 && typeof res.data === 'string' && !res.data.includes('Just a moment...')) {
    return res.data;
  }
  throw new Error(`HTTP status ${res.status} o reto Cloudflare`);
}

export async function getBrowserPage(overrideProxy = undefined) {
  if (!launchCloak) {
    throw new Error('CloakBrowser no disponible en este entorno');
  }
  const targetProxy = overrideProxy !== undefined ? overrideProxy : await resolveActiveProxy();

  // Si la instancia actual tiene otra configuración de proxy o perdió la conexión, reiniciar
  if (browserInstance && (currentProxyMode !== targetProxy || !browserInstance.isConnected?.())) {
    await closeBrowserInstance();
  }

  if (!browserInstance) {
    const args = ['--fingerprint-platform=linux', '--disable-http2'];
    if (targetProxy) {
      console.log(`[MangaService] Iniciando Cloakbrowser con proxy: ${targetProxy}`);
      args.push(`--proxy-server=${targetProxy}`);
    } else {
      console.log(`[MangaService] Iniciando Cloakbrowser con conexión directa (sin proxy)`);
    }

    try {
      browserInstance = await launchCloak({ 
        headless: true, 
        humanize: true,
        args
      });
      currentProxyMode = targetProxy;
    } catch (err) {
      await closeBrowserInstance();
      throw err;
    }
  }

  try {
    const page = await browserInstance.newPage();
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });
    return { browser: browserInstance, page, proxy: currentProxyMode };
  } catch (err) {
    await closeBrowserInstance();
    throw err;
  }
}

async function executeFetch(url, waitSelector, timeoutMs, forcedProxy = undefined) {
  const { page, proxy } = await getBrowserPage(forcedProxy);
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (res && res.status() === 404) {
      const err = new Error('Not Found');
      err.status = 404;
      throw err;
    }

    if (waitSelector) {
      let found = false;
      let attempts = 0;
      while (!found && attempts < 15) {
        try {
          if (await page.$(waitSelector).catch(() => null)) {
            found = true;
            break;
          }
          await new Promise(r => setTimeout(r, 2000));
          attempts++;
        } catch {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!found) {
        console.warn(`[MangaService] No se encontró ${waitSelector} en ${url} (proxy: ${proxy || 'directo'})`);
        throw new Error(`Timeout esperando selector ${waitSelector}`);
      }
    } else {
      await new Promise(r => setTimeout(r, 5000));
    }

    const html = await page.content();
    await page.close();
    return html;
  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
}

export async function fetchHtmlWithCloak(url, waitSelector = null, timeoutMs = TIMEOUT) {
  const activeProxy = await resolveActiveProxy();

  // 1. Intento rápido vía HTTP con Axios (ideal para Termux / Android y navegación ágil)
  try {
    return await fetchWithAxios(url, null, 12000);
  } catch (axiosErr) {
    if (axiosErr.status === 404) throw axiosErr;
    // Si falló directo y hay proxy SOCKS5 disponible, probar con proxy
    if (activeProxy) {
      try {
        return await fetchWithAxios(url, activeProxy, 15000);
      } catch (proxyAxiosErr) {
        if (proxyAxiosErr.status === 404) throw proxyAxiosErr;
      }
    }
  }

  // 2. Si Axios fue bloqueado por Cloudflare y CloakBrowser está disponible en el entorno
  if (launchCloak) {
    try {
      return await executeFetch(url, waitSelector, timeoutMs, activeProxy);
    } catch (err) {
      if (err.status === 404) throw err;
      console.warn(`[MangaService] Falló CloakBrowser con proxy: ${err.message}. Probando fallback directo...`);
      return await executeFetch(url, waitSelector, timeoutMs, null);
    }
  }

  throw new Error(`No se pudo obtener el contenido de ${url}`);
}

// ----------------------------------------------------------------------
// UTILIDADES DB
// ----------------------------------------------------------------------

async function getLastRun(pool, jobKey) {
  const r = await pool.query(`SELECT last_run_at FROM pns_job_runs WHERE job_key = $1 LIMIT 1`, [jobKey]);
  return r.rows[0]?.last_run_at ? new Date(r.rows[0].last_run_at).getTime() : 0;
}

async function setLastRun(pool, jobKey) {
  await pool.query(
    `
    INSERT INTO pns_job_runs (job_key, last_run_at, updated_at)
    VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (job_key)
    DO UPDATE SET last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `,
    [jobKey]
  );
}

function ttlMsFromEnv(key, fallbackMinutes) {
  const raw = Number(process.env[key] || '');
  const mins = Number.isFinite(raw) && raw > 0 ? raw : fallbackMinutes;
  return mins * 60 * 1000;
}

// ----------------------------------------------------------------------
// CACHÉ LISTA MANGAS
// ----------------------------------------------------------------------

export async function queryMangaCache(pool, { page, limit, status, search, order, publicationType, genre }) {
  const l = Math.min(50, Math.max(1, Number(limit || 24) || 24));
  const p = Math.max(1, Number(page || 1) || 1);
  const offset = (p - 1) * l;
  const where = [`is_active = true`];
  const params = [];
  let i = 1;

  const st = String(status || '').trim();
  if (st) {
    where.push(`status = $${i++}`);
    params.push(st);
  }

  const q = String(search || '').trim();
  if (q) {
    where.push(`title ILIKE $${i++}`);
    params.push(`%${q}%`);
  }

  const g = String(genre || '').trim();
  if (g) {
    where.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) tag WHERE lower(trim(tag)) = lower($${i++}))`);
    params.push(g);
  }

  if (publicationType) {
    // Prefer the dedicated field; legacy tags are used only when the field has no recognized format.
    const aliases = { Manga: ['manga'], Manhwa: ['manhwa', 'manwha'], Manhua: ['manhua'], Webtoon: ['webtoon'],
      'Novela ligera': ['novela ligera', 'light novel'], Novela: ['novela', 'novel', 'web novel', 'novela web'],
      'Cómic': ['cómic', 'comic', 'comics'], 'One-shot': ['one shot', 'oneshot'], Doujinshi: ['doujinshi', 'doujin'] };
    const knownFormats = Object.values(aliases).flat().map(value => "'" + value + "'").join(',');
    const normalized = `lower(regexp_replace(trim(COALESCE(publication_type,'')), '[_-]+', ' ', 'g'))`;
    const tagValues = `SELECT lower(regexp_replace(value, '[_-]+', ' ', 'g')) FROM jsonb_array_elements_text(COALESCE(tags,'[]'::jsonb))`;
    if (publicationType === 'unknown') {
      params.push(Object.values(aliases).flat());
      where.push(`NOT (${normalized} = ANY($${i}::text[])) AND NOT EXISTS (${tagValues} AS t WHERE lower(regexp_replace(value, '[_-]+', ' ', 'g')) = ANY($${i}::text[]))`);
    } else {
      params.push(aliases[publicationType] || []);
      where.push(`(${normalized} = ANY($${i}::text[]) OR (${normalized} NOT IN (${knownFormats}) AND EXISTS (${tagValues} AS t WHERE lower(regexp_replace(value, '[_-]+', ' ', 'g')) = ANY($${i}::text[]))))`);
    }
    i++;
  }

  const ord = String(order || '').trim().toLowerCase();
  const orderSql =
    ord === 'popular'
      ? `ORDER BY popularity_score DESC, md_updated_at DESC NULLS LAST, cached_at DESC`
      : `ORDER BY md_updated_at DESC NULLS LAST, cached_at DESC`;

  const rows = await pool.query(
    `
    SELECT
      manga_id, title, description, cover_url, status, publication_type, tags, content_rating, year,
      chapter_count, latest_chapter, author, artist, md_updated_at, cached_at, popularity_score
    FROM manga_cache
    WHERE ${where.join(' AND ')}
    ${orderSql}
    LIMIT $${i++} OFFSET $${i++}
    `,
    [...params, l, offset]
  );

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM manga_cache WHERE ${where.join(' AND ')}`,
    params
  );

  return {
    items: rows.rows.map((r) => ({
      id: r.manga_id,
      title: r.title,
      description: r.description,
      cover_url: r.cover_url,
      status: r.status,
      publication_type: r.publication_type || null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      content_rating: r.content_rating,
      year: r.year,
      chapter_count: Number(r.chapter_count || 0),
      latest_chapter: r.latest_chapter,
      author: r.author,
      artist: r.artist,
      updated_at: r.md_updated_at ? new Date(r.md_updated_at).toISOString() : null,
    })),
    pagination: { page: p, limit: l, total: count.rows[0]?.total || 0 },
  };
}

async function resolveFallbackMangaCover(title) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (!cleanTitle) return null;

  // Plan B-1: AniList GraphQL (MANGA)
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: 'query ($search: String) { Media(search: $search, type: MANGA) { coverImage { extraLarge large } } }',
        variables: { search: cleanTitle },
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = await res.json();
      const img = json?.data?.Media?.coverImage?.extraLarge || json?.data?.Media?.coverImage?.large || null;
      if (img) return img;
    }
  } catch {
    // try MangaDex next
  }

  // Plan B-2: MangaDex public API
  try {
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(cleanTitle)}&limit=1&includes[]=cover_art`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const json = await res.json();
      const item = json?.data?.[0];
      const coverRel = item?.relationships?.find((r) => r.type === 'cover_art');
      const fileName = coverRel?.attributes?.fileName;
      if (item?.id && fileName) {
        return `https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg`;
      }
    }
  } catch {
    // ignore fallback failure
  }

  return null;
}

export async function backfillMissingMangaCovers(pool, limit = 10) {
  const { rows } = await pool.query(
    `SELECT manga_id, title FROM manga_cache WHERE (cover_url IS NULL OR cover_url = '') AND is_active = true ORDER BY cached_at DESC LIMIT $1`,
    [limit]
  );
  let updated = 0;
  for (const row of rows) {
    const cover = await resolveFallbackMangaCover(row.title);
    if (cover) {
      await pool.query(`UPDATE manga_cache SET cover_url = $2 WHERE manga_id = $1`, [row.manga_id, cover]);
      updated += 1;
    }
  }
  return { checked: rows.length, updated };
}

export async function upsertManga(pool, manga, { popularityScore = 0 } = {}) {
  let coverUrl = manga.cover_url || null;
  if (!coverUrl && manga.title) {
    try {
      const existing = await pool.query(`SELECT cover_url FROM manga_cache WHERE manga_id = $1 LIMIT 1`, [manga.id]);
      if (!existing.rows[0]?.cover_url) {
        coverUrl = await resolveFallbackMangaCover(manga.title);
      }
    } catch {
      // keep null if lookup fails
    }
  }

  await pool.query(
    `
    INSERT INTO manga_cache
      (manga_id, title, description, cover_url, status, publication_type, tags, content_rating, year, chapter_count, latest_chapter, author, artist, md_updated_at, cached_at, popularity_score, is_active)
    VALUES
      ($1,$2,$3,$4,$5,$15,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP,$14,true)
    ON CONFLICT (manga_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = COALESCE(NULLIF(EXCLUDED.description, ''), manga_cache.description),
      cover_url = COALESCE(NULLIF(EXCLUDED.cover_url, ''), manga_cache.cover_url),
      status = COALESCE(NULLIF(EXCLUDED.status, ''), manga_cache.status),
      publication_type = COALESCE(EXCLUDED.publication_type, manga_cache.publication_type),
      tags = EXCLUDED.tags,
      content_rating = EXCLUDED.content_rating,
      year = EXCLUDED.year,
      chapter_count = GREATEST(manga_cache.chapter_count, EXCLUDED.chapter_count),
      latest_chapter = COALESCE(EXCLUDED.latest_chapter, manga_cache.latest_chapter),
      author = COALESCE(EXCLUDED.author, manga_cache.author),
      artist = COALESCE(EXCLUDED.artist, manga_cache.artist),
      md_updated_at = COALESCE(EXCLUDED.md_updated_at, manga_cache.md_updated_at),
      cached_at = CURRENT_TIMESTAMP,
      popularity_score = GREATEST(manga_cache.popularity_score, EXCLUDED.popularity_score),
      is_active = true
    `,
    [
      manga.id,
      manga.title,
      manga.description || null,
      coverUrl,
      manga.status,
      JSON.stringify(manga.tags || []),
      manga.content_rating || null,
      manga.year,
      Number(manga.chapter_count || 0),
      manga.latest_chapter || null,
      manga.author || null,
      manga.artist || null,
      manga.updated_at ? new Date(manga.updated_at) : null,
      Number(popularityScore || 0),
      manga.publication_type || null,
    ]
  );
}

// ----------------------------------------------------------------------
// SCRAPERS
// ----------------------------------------------------------------------

export async function scrapeMangaList(url) {
  const html = await fetchHtmlWithCloak(url, '#mkAgrid, .agrid, .reading-content, h1');
  const $ = cheerio.load(html);
  const items = [];

  $('#mkAgrid a, .agrid a, .acard').each((i, el) => {
    const link = $(el).attr('href');
    if (!link || !link.includes('/manga/')) return;

    // Extraer el slug del href: https://dragontranslation.org/manga/slug/
    const match = link.match(/\/manga\/([^\/]+)\/?/);
    if (!match) return;
    const id = match[1];

    let title = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).find('.ac-t, .m3ae409d').text().trim() || $(el).text().trim();
    if (title.toLowerCase().startsWith('manga')) {
      title = title.substring(5).trim();
    }

    const cover_url = bestMangaImageUrl($(el).find('img').first(), BASE_URL);

    const statusText = $(el).find('.ac-status').text().trim().toLowerCase();
    const status = statusText.includes('ongoing') ? 'ongoing' : 'completed';

    const chText = $(el).find('.ac-ch').text().trim();
    const latest_chapter = chText.replace(/capitulo/i, '').trim() || null;
    const chapter_count = parseInt(latest_chapter) || 0;

    items.push({
      id,
      title,
      publication_type: extractPublicationType($, $(el)),
      cover_url,
      status,
      latest_chapter,
      chapter_count,
      description: '',
      tags: [],
      content_rating: 'safe',
      year: null,
      author: '',
      artist: '',
      updated_at: new Date().toISOString()
    });
  });

  return items;
}

export async function getMangaList(pool, params) {
  const page = Math.max(1, Number(params?.page || 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(params?.limit || 24) || 24));
  const status = String(params?.status || '').trim();
  const search = String(params?.search || '').trim();
  const order = String(params?.order || '').trim() || 'latest';

  const publicationType = String(params?.publicationType || '').trim();
  const genre = String(params?.genre || '').trim();
  // Type and genre filters query the whole persisted catalog, never repeatedly scrape a remote page.
  if (publicationType || genre) return { ...(await queryMangaCache(pool, { page, limit, status, search, order, publicationType, genre })), meta: { source: 'db', cache_hit: true } };

  const jobKey = `manga:list:${status || 'all'}:${order}:${search}`;
  const ttl = ttlMsFromEnv('MANGA_CACHE_TTL_MINUTES', 360);
  const last = await getLastRun(pool, jobKey);
  const cached = await queryMangaCache(pool, { page, limit, status, search, order });

  const cacheOk = cached.items.length >= limit && Date.now() - last < ttl;
  if (cacheOk && !search) return { ...cached, meta: { source: 'db', cache_hit: true } };

  // Scraping URL params
  let m_orderby = 'latest';
  if (order === 'popular') m_orderby = 'views';
  if (order === 'alphabet') m_orderby = 'alphabet';
  
  let url = `${BASE_URL}/manga/?m_orderby=${m_orderby}`;
  if (search) url = `${BASE_URL}/?s=${encodeURIComponent(search)}&post_type=wp-manga`;

  try {
    const items = await scrapeMangaList(url);
    for (const mapped of items) {
      await upsertManga(pool, mapped);
    }
    if (!search) await setLastRun(pool, jobKey);
  } catch (error) {
    console.error("Error scraping getMangaList:", error);
  }

  const refreshed = await queryMangaCache(pool, { page, limit, status, search, order });
  return { ...refreshed, meta: { source: 'dragon', cache_hit: false } };
}

export async function getPopularManga(pool, { limit = 12 } = {}) {
  const l = Math.min(50, Math.max(1, Number(limit || 12) || 12));
  const jobKey = 'manga:popular';
  const ttl = ttlMsFromEnv('MANGA_POPULAR_TTL_MINUTES', 360);
  const last = await getLastRun(pool, jobKey);

  const cached = await pool.query(
    `
    SELECT
      manga_id, title, description, cover_url, status, publication_type, tags, content_rating, year,
      chapter_count, latest_chapter, author, artist, md_updated_at
    FROM manga_cache
    WHERE is_active = true
    ORDER BY popularity_score DESC, md_updated_at DESC NULLS LAST, cached_at DESC
    LIMIT $1
    `,
    [l]
  );

  if (cached.rows.length >= Math.min(6, l) && Date.now() - last < ttl) {
    return {
      items: cached.rows.map((r, idx) => ({
        id: r.manga_id,
        title: r.title,
        description: r.description,
        cover_url: r.cover_url,
        status: r.status,
      publication_type: r.publication_type || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        content_rating: r.content_rating,
        year: r.year,
        chapter_count: Number(r.chapter_count || 0),
        latest_chapter: r.latest_chapter,
        author: r.author,
        artist: r.artist,
        updated_at: r.md_updated_at ? new Date(r.md_updated_at).toISOString() : null,
        rank: idx + 1,
      })),
      meta: { source: 'db', cache_hit: true },
    };
  }

  try {
    const items = await scrapeMangaList(`${BASE_URL}/manga/?m_orderby=views`);
    for (let idx = 0; idx < items.length; idx++) {
      const mapped = items[idx];
      const score = Math.max(0, l - idx);
      await upsertManga(pool, mapped, { popularityScore: score });
    }
    await setLastRun(pool, jobKey);
  } catch (error) {
    console.error("Error scraping getPopularManga:", error);
  }

  const refreshed = await pool.query(
    `
    SELECT
      manga_id, title, description, cover_url, status, publication_type, tags, content_rating, year,
      chapter_count, latest_chapter, author, artist, md_updated_at
    FROM manga_cache
    WHERE is_active = true
    ORDER BY popularity_score DESC, md_updated_at DESC NULLS LAST, cached_at DESC
    LIMIT $1
    `,
    [l]
  );

  return {
    items: refreshed.rows.map((r, idx) => ({
      id: r.manga_id,
      title: r.title,
      description: r.description,
      cover_url: r.cover_url,
      status: r.status,
      publication_type: r.publication_type || null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      content_rating: r.content_rating,
      year: r.year,
      chapter_count: Number(r.chapter_count || 0),
      latest_chapter: r.latest_chapter,
      author: r.author,
      artist: r.artist,
      updated_at: r.md_updated_at ? new Date(r.md_updated_at).toISOString() : null,
      rank: idx + 1,
    })),
    meta: { source: 'dragon', cache_hit: false },
  };
}

export async function getMangaDetail(pool, id) {
  const mangaId = String(id || '').trim();
  if (!mangaId) return null;

  const ttl = ttlMsFromEnv('MANGA_DETAIL_TTL_MINUTES', 720);
  const cached = await pool.query(
    `
    SELECT
      manga_id, title, description, cover_url, status, publication_type, tags, content_rating, year,
      chapter_count, latest_chapter, author, artist, md_updated_at, cached_at
    FROM manga_cache
    WHERE manga_id = $1 AND is_active = true
    LIMIT 1
    `,
    [mangaId]
  );
  if (cached.rows.length) {
    const r = cached.rows[0];
    const last = r.cached_at ? new Date(r.cached_at).getTime() : 0;
    if (Date.now() - last < ttl) {
      return {
        id: r.manga_id,
        title: r.title,
        description: r.description,
        cover_url: r.cover_url,
        status: r.status,
      publication_type: r.publication_type || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        content_rating: r.content_rating,
        year: r.year,
        chapter_count: Number(r.chapter_count || 0),
        latest_chapter: r.latest_chapter,
        author: r.author,
        artist: r.artist,
        updated_at: r.md_updated_at ? new Date(r.md_updated_at).toISOString() : null,
      };
    }
  }

  // Scrape detail
  const url = `${BASE_URL}/manga/${mangaId}/`;
  try {
    const html = await fetchHtmlWithCloak(url, 'h1');
    const $ = cheerio.load(html);

    const titleElem = $('h1').clone();
    titleElem.children('.manga-title-badges').remove();
    let title = titleElem.text().trim();
    if (title.toLowerCase().startsWith('manga')) {
      title = title.substring(5).trim();
    }
    if (!title) title = $('h1').text().replace(/^manga/i, '').trim();
    if (!title) return null;

    const cover_url = bestMangaImageUrl($('.summary_image img, .tab-summary img, .wp-post-image, .c-poster img').first(), url);

    let description = $('.mbee38d1 p, .manga-excerpt, .summary__content, .description-summary, .post-content').text().trim();
    if (!description) {
      $('p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 40 && !description) {
          description = t;
        }
      });
    }
    
    const tags = [];
    $('a[href*="/manga-genre/"], a[href*="/genre/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !tags.includes(g)) tags.push(g);
    });

    let status = 'ongoing';
    const rawStatus = $('.mc724232, .post-status, .summary-content, .ac-status').text().toLowerCase();
    if (rawStatus.includes('completed') || rawStatus.includes('completado') || rawStatus.includes('finalizado')) {
      status = 'completed';
    }

    const mapped = {
      id: mangaId,
      title,
      publication_type: extractPublicationType($),
      description: description || '',
      cover_url,
      status,
      tags,
      content_rating: 'safe',
      year: null,
      chapter_count: 0, // Will be updated by getMangaChapters
      latest_chapter: null,
      author: '',
      artist: '',
      updated_at: new Date().toISOString()
    };

    await upsertManga(pool, mapped);
    return mapped;
  } catch (e) {
    console.error("Error scraping detail:", e);
    return null;
  }
}

// ----------------------------------------------------------------------
// CACHÉ CAPÍTULOS
// ----------------------------------------------------------------------

async function getChaptersCacheFresh(pool, mangaId, ttlMs) {
  const r = await pool.query(
    `SELECT MAX(cached_at) AS last FROM manga_chapters_cache WHERE manga_id = $1`,
    [mangaId]
  );
  const last = r.rows[0]?.last ? new Date(r.rows[0].last).getTime() : 0;
  return last && Date.now() - last < ttlMs;
}

export async function getMangaChapters(pool, id, { limit = 200, forceRefresh = false } = {}) {
  const mangaId = String(id || '').trim();
  if (!mangaId) {
    return {
      chapters: [],
      availableLanguages: ['es'],
      totalAvailableChapters: 0,
      spanishAvailableChapters: 0,
      selectedLanguage: 'es',
      usedFallbackToEnglish: false,
      noSpanishMessage: null,
      meta: { source: 'db', cache_hit: true },
    };
  }

  const ttl = ttlMsFromEnv('MANGA_CHAPTERS_TTL_MINUTES', 720);
  const cacheFresh = !forceRefresh && await getChaptersCacheFresh(pool, mangaId, ttl);
  
  if (cacheFresh) {
    const rows = await pool.query(
      `
      SELECT
        chapter_id, manga_id, chapter, title, volume, translated_language, publish_at, readable_at, pages, external_url
      FROM manga_chapters_cache
      WHERE manga_id = $1
      ORDER BY (NULLIF(chapter, '')::numeric) DESC NULLS LAST, readable_at DESC NULLS LAST
      LIMIT $2
      `,
      [mangaId, 1000]
    );
    const mapped = rows.rows.map((r) => ({ ...r, id: r.chapter_id }));
    const limited = mapped.slice(0, Math.min(500, Math.max(1, Number(limit || 200) || 200)));
    return { 
      chapters: limited, items: limited, 
      availableLanguages: ['es'], 
      totalAvailableChapters: mapped.length, 
      spanishAvailableChapters: mapped.length,
      selectedLanguage: 'es',
      usedFallbackToEnglish: false,
      meta: { source: 'db', cache_hit: true } 
    };
  }

  // Scrape chapters from detail page's JSON script block
  const url = `${BASE_URL}/manga/${mangaId}/`;
  const chapters = [];
  try {
    const html = await fetchHtmlWithCloak(url, 'h1');
    const $ = cheerio.load(html);
    
    let scriptJson = null;
    $('script[type="application/json"]').each((_, el) => {
      const content = $(el).html() || '';
      if (content.includes('"items"') && (content.includes('"mangaId"') || content.includes('"url"'))) {
        scriptJson = content;
      }
    });
    
    if (scriptJson) {
      const data = JSON.parse(scriptJson);
      if (data && data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const chNum = String(item.num || '').trim();
          chapters.push({
            id: item.url, // Usamos la URL completa como ID para getChapterPages
            manga_id: mangaId,
            chapter: chNum,
            title: item.name || `Capítulo ${chNum}`,
            volume: null,
            translated_language: 'es',
            publish_at: new Date().toISOString(),
            readable_at: new Date().toISOString(),
            pages: null,
            external_url: item.url
          });
        }
      }
    }

    // Fallback: si no vino en JSON script, buscar links del DOM
    if (chapters.length === 0) {
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes(`/manga/${mangaId}/capitulo-`)) {
          const numMatch = href.match(/capitulo-([0-9.]+)/i);
          const chNum = numMatch ? numMatch[1] : '';
          const name = $(el).text().trim() || `Capítulo ${chNum}`;
          if (!chapters.some(c => c.external_url === href)) {
            chapters.push({
              id: href,
              manga_id: mangaId,
              chapter: chNum,
              title: name,
              volume: null,
              translated_language: 'es',
              publish_at: new Date().toISOString(),
              readable_at: new Date().toISOString(),
              pages: null,
              external_url: href
            });
          }
        }
      });
    }
  } catch (error) {
    console.error("Error scraping chapters:", error);
  }

  await pool.query(`DELETE FROM manga_chapters_cache WHERE manga_id = $1`, [mangaId]);
  for (const c of chapters) {
    await pool.query(
      `
      INSERT INTO manga_chapters_cache
        (chapter_id, manga_id, chapter, title, volume, translated_language, publish_at, readable_at, pages, external_url, cached_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
      ON CONFLICT (chapter_id)
      DO UPDATE SET
        manga_id = EXCLUDED.manga_id,
        chapter = EXCLUDED.chapter,
        title = EXCLUDED.title,
        volume = EXCLUDED.volume,
        translated_language = EXCLUDED.translated_language,
        publish_at = EXCLUDED.publish_at,
        readable_at = EXCLUDED.readable_at,
        pages = EXCLUDED.pages,
        external_url = EXCLUDED.external_url,
        cached_at = CURRENT_TIMESTAMP
      `,
      [
        c.id,
        c.manga_id,
        c.chapter,
        c.title,
        c.volume,
        c.translated_language,
        c.publish_at ? new Date(c.publish_at) : null,
        c.readable_at ? new Date(c.readable_at) : null,
        c.pages,
        c.external_url,
      ]
    );
  }

  if (chapters.length > 0) {
    const latestCh = chapters[0]?.chapter || null;
    await pool.query(
      `UPDATE manga_cache SET chapter_count = $1, latest_chapter = COALESCE($2, latest_chapter), md_updated_at = CURRENT_TIMESTAMP WHERE manga_id = $3`,
      [chapters.length, latestCh, mangaId]
    ).catch(() => {});
  }

  const cachedRows = await pool.query(
    `
    SELECT
      chapter_id, manga_id, chapter, title, volume, translated_language, publish_at, readable_at, pages, external_url
    FROM manga_chapters_cache
    WHERE manga_id = $1
    ORDER BY (NULLIF(chapter, '')::numeric) DESC NULLS LAST, readable_at DESC NULLS LAST
    LIMIT $2
    `,
    [mangaId, 1000]
  );

  const mapped = cachedRows.rows.map((r) => ({ ...r, id: r.chapter_id }));
  const limited = mapped.slice(0, Math.min(500, Math.max(1, Number(limit || 200) || 200)));
  
  return { 
      chapters: limited, items: limited, 
      availableLanguages: ['es'], 
      totalAvailableChapters: mapped.length, 
      spanishAvailableChapters: mapped.length,
      selectedLanguage: 'es',
      usedFallbackToEnglish: false,
      meta: { source: 'dragon', cache_hit: false } 
    };
}

const loadChapterPages = createChapterPageLoader({ fetchHtml: url => fetchHtmlWithCloak(url, '.reading-content') });

export async function getChapterPages(pool, chapterUrl) {
  try { return await loadChapterPages(pool, chapterUrl); }
  catch (error) {
    console.error('Error loading chapter pages:', error.message);
    return { baseUrl: '', pages: [], chapterId: String(chapterUrl || '') };
  }
}
export async function refreshMangaPopularCache(pool) {
  try {
    const list = await scrapeMangaList('https://dragontranslation.org/manga');
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const manga = list[i];
      // Popularity score base to rank them higher
      await upsertManga(pool, manga, { popularityScore: 100 - i });
      count++;
    }
    return { ok: true, count };
  } catch (e) {
    console.error('refreshMangaPopularCache error:', e);
    return { ok: false, error: e.message };
  }
}
