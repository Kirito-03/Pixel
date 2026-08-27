import * as cheerio from 'cheerio';
import { launch } from 'cloakbrowser';

const BASE_URL = 'https://dragontranslation.org';
const TIMEOUT = 30000;

let browserInstance = null;

async function getBrowserPage() {
  if (!browserInstance) {
    browserInstance = await launch({ 
      headless: true, 
      humanize: true,
      args: ['--fingerprint-platform=linux', '--disable-http2', '--proxy-server=socks5://100.95.206.57:1080']
    });
  }
  const page = await browserInstance.newPage();
  
  // Cancelar (Dismiss) automáticamente alertas/confirmaciones para evitar popups de publicidad
  page.on('dialog', async dialog => {
    await dialog.dismiss();
  });
  
  return { browser: browserInstance, page };
}

async function fetchHtmlWithCloak(url, waitSelector = null, timeoutMs = TIMEOUT) {
  const { page } = await getBrowserPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (res && res.status() === 404) {
       const err = new Error('Not Found');
       err.status = 404;
       throw err;
    }
    
    // Esperar a que Cloudflare termine su verificación y cargue el contenido real
    if (waitSelector) {
      try {
        await page.waitForSelector(waitSelector, { timeout: 15000 });
      } catch (e) {
        console.warn(`No se encontró ${waitSelector}, quizás no hay resultados o Cloudflare tardó demasiado.`);
      }
    } else {
      // Si no hay selector, esperamos un poco genéricamente para Cloudflare
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

async function queryMangaCache(pool, { page, limit, status, search, order }) {
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

  const ord = String(order || '').trim().toLowerCase();
  const orderSql =
    ord === 'popular'
      ? `ORDER BY popularity_score DESC, md_updated_at DESC NULLS LAST, cached_at DESC`
      : `ORDER BY md_updated_at DESC NULLS LAST, cached_at DESC`;

  const rows = await pool.query(
    `
    SELECT
      manga_id, title, description, cover_url, status, tags, content_rating, year,
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

async function upsertManga(pool, manga, { popularityScore = 0 } = {}) {
  await pool.query(
    `
    INSERT INTO manga_cache
      (manga_id, title, description, cover_url, status, tags, content_rating, year, chapter_count, latest_chapter, author, artist, md_updated_at, cached_at, popularity_score, is_active)
    VALUES
      ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP,$14,true)
    ON CONFLICT (manga_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      cover_url = EXCLUDED.cover_url,
      status = EXCLUDED.status,
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
      manga.cover_url || null,
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
    ]
  );
}

// ----------------------------------------------------------------------
// SCRAPERS
// ----------------------------------------------------------------------

async function scrapeMangaList(url) {
  const html = await fetchHtmlWithCloak(url, '.acard');
  const $ = cheerio.load(html);
  const items = [];

  $('.acard').each((i, el) => {
    const link = $(el).attr('href');
    if (!link) return;

    // Extraer el slug del href: https://dragontranslation.org/manga/slug/
    const match = link.match(/\/manga\/([^\/]+)\/?/);
    if (!match) return;
    const id = match[1];

    const title = $(el).find('.ac-t').text().trim();
    let cover_url = $(el).find('.ac-cover').attr('src') || $(el).find('.ac-cover').attr('data-src');
    if (cover_url && cover_url.includes(' ')) cover_url = cover_url.split(' ')[0];

    const statusText = $(el).find('.ac-status').text().trim().toLowerCase();
    const status = statusText.includes('ongoing') ? 'ongoing' : 'completed';

    const latest_chapter = $(el).find('.ac-ch').text().replace('Capitulo', '').trim() || null;
    const chapter_count = parseInt(latest_chapter) || 0;

    items.push({
      id,
      title,
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
      manga_id, title, description, cover_url, status, tags, content_rating, year,
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
      manga_id, title, description, cover_url, status, tags, content_rating, year,
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
      manga_id, title, description, cover_url, status, tags, content_rating, year,
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
    const html = await fetchHtmlWithCloak(url, '.htitle');
    const $ = cheerio.load(html);

    const title = $('.htitle').text().trim();
    if (!title) return null;

    let cover_url = $('.hposter img').attr('src') || $('.hposter img').attr('data-src');
    if (cover_url && cover_url.includes(' ')) cover_url = cover_url.split(' ')[0];

    const description = $('.syn p').text().trim();
    
    const tags = [];
    $('.hchips--genres .chip').each((_, el) => {
      tags.push($(el).text().trim());
    });

    let status = 'ongoing';
    $('.sir').each((_, el) => {
      if ($(el).find('.l').text().includes('Estado')) {
         const s = $(el).find('.v').text().toLowerCase();
         if (s.includes('completed') || s.includes('completado')) status = 'completed';
      }
    });

    const mapped = {
      id: mangaId,
      title,
      description,
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
    const html = await fetchHtmlWithCloak(url);
    const $ = cheerio.load(html);
    const scriptJson = $('#mk-chapters-data').html();
    
    if (scriptJson) {
      const data = JSON.parse(scriptJson);
      if (data && data.items) {
        for (const item of data.items) {
           chapters.push({
             id: item.url, // Usamos la URL completa como ID para getChapterPages
             manga_id: mangaId,
             chapter: item.num,
             title: item.name,
             volume: null,
             translated_language: 'es',
             publish_at: new Date().toISOString(), // No hay fecha exacta ISO
             readable_at: new Date().toISOString(),
             pages: null,
             external_url: item.url
           });
        }
      }
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

export async function getChapterPages(pool, chapterUrl) {
  const url = String(chapterUrl || '').trim();
  if (!url || !url.startsWith('http')) return null;

  try {
    // 1. Revisar si las páginas ya están cacheadas en la DB
    if (pool) {
      const cacheQuery = await pool.query(`SELECT pages FROM manga_chapters_cache WHERE chapter_id = $1`, [url]);
      if (cacheQuery.rows.length > 0 && cacheQuery.rows[0].pages && cacheQuery.rows[0].pages.length > 0) {
        return { baseUrl: '', pages: cacheQuery.rows[0].pages, chapterId: url, meta: { source: 'db', cache_hit: true } };
      }
    }

    // 2. Si no están cacheadas, usamos el bot
    const html = await fetchHtmlWithCloak(url, '.reading-content');
    const $ = cheerio.load(html);
    const pages = [];
    
    $('.reading-content .wp-manga-chapter-img').each((_, el) => {
       const src = $(el).attr('src') || $(el).attr('data-src');
       if (src) pages.push(src.trim());
    });
    
    // 3. Guardar las páginas encontradas en la caché para futuras consultas
    if (pool && pages.length > 0) {
      // Usamos JSON.stringify para array de strings en jsonb
      await pool.query(
        `UPDATE manga_chapters_cache SET pages = $1 WHERE chapter_id = $2`,
        [JSON.stringify(pages), url]
      );
    }
    
    return { baseUrl: '', pages, chapterId: url, meta: { source: 'dragon', cache_hit: false } };
  } catch (error) {
    console.error("Error scraping chapter pages:", error);
    return { baseUrl: '', pages: [], chapterId: url };
  }
}
