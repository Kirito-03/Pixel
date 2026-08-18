const MANGADEX_BASE = 'https://api.mangadex.org';
const MANGADEX_UPLOADS = 'https://uploads.mangadex.org';

const STATUS_TO_UI = {
  ongoing: 'En emisión',
  completed: 'Finalizado',
  hiatus: 'Hiatus',
  cancelled: 'Cancelado',
};

const UI_STATUS_TO_MD = {
  'En emisión': 'ongoing',
  Finalizado: 'completed',
  Hiatus: 'hiatus',
  Cancelado: 'cancelled',
};

const PREFERRED_LANGS = ['es', 'es-la', 'en'];

function pickLocalized(obj) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of PREFERRED_LANGS) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const first = Object.values(obj).find((v) => typeof v === 'string' && v.trim());
  return typeof first === 'string' ? first.trim() : '';
}

function mapStatus(mdStatus) {
  const key = String(mdStatus || '').trim().toLowerCase();
  return STATUS_TO_UI[key] || 'En emisión';
}

function normalizeTags(tags) {
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const name = pickLocalized(t?.attributes?.name);
    if (name) out.push(name);
  }
  return Array.from(new Set(out));
}

function relationshipOf(entity, type) {
  const rels = Array.isArray(entity?.relationships) ? entity.relationships : [];
  return rels.find((r) => r?.type === type) || null;
}

function relationshipAll(entity, type) {
  const rels = Array.isArray(entity?.relationships) ? entity.relationships : [];
  return rels.filter((r) => r?.type === type);
}

function buildCoverUrl(mangaId, coverRel) {
  const fileName = String(coverRel?.attributes?.fileName || '').trim();
  if (!mangaId || !fileName) return null;
  const originalUrl = `${MANGADEX_UPLOADS}/covers/${mangaId}/${fileName}.512.jpg`;
  return `/api/proxy/manga-cover?url=${encodeURIComponent(originalUrl)}`;
}

function toIsoOrNull(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function defaultDescription(title) {
  const t = String(title || '').trim();
  return t ? `Lee ${t} en Pixel no Sekai.` : 'Descripción no disponible.';
}

export function mapMangaDexManga(entity) {
  const id = String(entity?.id || '').trim();
  const a = entity?.attributes || {};
  const title = pickLocalized(a.title);
  const description = pickLocalized(a.description) || defaultDescription(title);
  const status = mapStatus(a.status);
  const tags = normalizeTags(a.tags);
  const contentRating = String(a.contentRating || '').trim() || null;
  const year = Number.isFinite(Number(a.year)) ? Number(a.year) : null;
  const updatedAt = toIsoOrNull(a.updatedAt);

  const coverRel = relationshipOf(entity, 'cover_art');
  const coverUrl = buildCoverUrl(id, coverRel);

  const authorRel = relationshipAll(entity, 'author')[0] || null;
  const artistRel = relationshipAll(entity, 'artist')[0] || null;
  const author = String(authorRel?.attributes?.name || '').trim() || null;
  const artist = String(artistRel?.attributes?.name || '').trim() || null;

  const latestChapter = String(a.lastChapter || '').trim() || null;

  return {
    id,
    title,
    description,
    cover_url: coverUrl,
    status,
    tags,
    content_rating: contentRating,
    year,
    chapter_count: 0,
    latest_chapter: latestChapter,
    author,
    artist,
    updated_at: updatedAt,
  };
}

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'PixelNoSekaiBot/1.0 (+mangadex)' },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`MangaDex ${resp.status}: ${text || resp.statusText}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

function buildListUrl({ page, limit, status, search, order }) {
  const l = Math.min(50, Math.max(1, Number(limit || 24) || 24));
  const p = Math.max(1, Number(page || 1) || 1);
  const offset = (p - 1) * l;

  const u = new URL(`${MANGADEX_BASE}/manga`);
  u.searchParams.set('limit', String(l));
  u.searchParams.set('offset', String(offset));
  u.searchParams.append('includes[]', 'cover_art');
  u.searchParams.append('includes[]', 'author');
  u.searchParams.append('includes[]', 'artist');
  u.searchParams.append('contentRating[]', 'safe');
  u.searchParams.append('contentRating[]', 'suggestive');

  const s = String(search || '').trim();
  if (s) u.searchParams.set('title', s);

  const st = String(status || '').trim();
  const mdStatus = UI_STATUS_TO_MD[st];
  if (mdStatus) u.searchParams.append('status[]', mdStatus);

  const ord = String(order || '').trim().toLowerCase();
  if (ord === 'popular') u.searchParams.set('order[followedCount]', 'desc');
  else u.searchParams.set('order[updatedAt]', 'desc');

  return u.toString();
}

function buildDetailUrl(id) {
  const u = new URL(`${MANGADEX_BASE}/manga/${encodeURIComponent(id)}`);
  u.searchParams.append('includes[]', 'cover_art');
  u.searchParams.append('includes[]', 'author');
  u.searchParams.append('includes[]', 'artist');
  return u.toString();
}

function buildChaptersUrl(id, { limit = 100, offset = 0 } = {}) {
  const u = new URL(`${MANGADEX_BASE}/manga/${encodeURIComponent(id)}/feed`);
  u.searchParams.set('limit', String(Math.min(500, Math.max(1, Number(limit) || 100))));
  u.searchParams.set('offset', String(Math.max(0, Number(offset) || 0)));
  u.searchParams.set('order[chapter]', 'desc');
  u.searchParams.set('order[readableAt]', 'desc');
  return u.toString();
}

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

export async function getMangaList(pool, params) {
  const page = Math.max(1, Number(params?.page || 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(params?.limit || 24) || 24));
  const status = String(params?.status || '').trim();
  const search = String(params?.search || '').trim();
  const order = String(params?.order || '').trim() || 'updated';

  const jobKey = `manga:list:${status || 'all'}:${order}`;
  const ttl = ttlMsFromEnv('MANGA_CACHE_TTL_MINUTES', 360);
  const last = await getLastRun(pool, jobKey);
  const cached = await queryMangaCache(pool, { page, limit, status, search, order });

  const cacheOk = cached.items.length >= limit && Date.now() - last < ttl;
  if (cacheOk) return { ...cached, meta: { source: 'db', cache_hit: true } };

  const url = buildListUrl({ page, limit, status, search, order });
  const json = await fetchJson(url);
  const items = Array.isArray(json?.data) ? json.data : [];
  for (const e of items) {
    const mapped = mapMangaDexManga(e);
    if (!mapped.id || !mapped.title) continue;
    await upsertManga(pool, mapped);
  }
  await setLastRun(pool, jobKey);

  const refreshed = await queryMangaCache(pool, { page, limit, status, search, order });
  return { ...refreshed, meta: { source: 'mangadex', cache_hit: false } };
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

  const url = buildListUrl({ page: 1, limit: l, status: '', search: '', order: 'popular' });
  const json = await fetchJson(url);
  const items = Array.isArray(json?.data) ? json.data : [];
  for (let idx = 0; idx < items.length; idx++) {
    const e = items[idx];
    const mapped = mapMangaDexManga(e);
    if (!mapped.id || !mapped.title) continue;
    const score = Math.max(0, l - idx);
    await upsertManga(pool, mapped, { popularityScore: score });
  }
  await setLastRun(pool, jobKey);

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
    meta: { source: 'mangadex', cache_hit: false },
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
        description: r.description || defaultDescription(r.title),
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

  const url = buildDetailUrl(mangaId);
  const json = await fetchJson(url);
  const data = json?.data;
  if (!data) return null;
  const mapped = mapMangaDexManga(data);
  if (!mapped.id) return null;
  await upsertManga(pool, mapped);

  return mapped;
}

function mapChapter(entity, mangaId) {
  const a = entity?.attributes || {};
  const lang = String(a.translatedLanguage || '').trim().toLowerCase();
  return {
    id: String(entity?.id || '').trim(),
    manga_id: mangaId,
    chapter: String(a.chapter || '').trim() || null,
    title: String(a.title || '').trim() || null,
    volume: String(a.volume || '').trim() || null,
    translated_language: lang || null,
    publish_at: toIsoOrNull(a.publishAt),
    readable_at: toIsoOrNull(a.readableAt),
    pages: Number.isFinite(Number(a.pages)) ? Number(a.pages) : null,
    external_url: String(a.externalUrl || '').trim() || null,
  };
}

function normalizeLanguage(input) {
  const lang = String(input || '').trim().toLowerCase();
  if (!lang) return '';
  if (lang === 'es' || lang.startsWith('es-')) return lang === 'es-la' ? 'es-la' : 'es';
  if (lang === 'en' || lang.startsWith('en-')) return 'en';
  return lang;
}

function preferredLanguageChain(preferredLanguage, allowEnglishFallback) {
  const preferred = normalizeLanguage(preferredLanguage) || 'es';
  const chain = [];
  if (preferred === 'es-la') {
    chain.push('es-la', 'es');
  } else if (preferred === 'es') {
    chain.push('es', 'es-la');
  } else if (preferred === 'en') {
    chain.push('en');
  } else {
    chain.push(preferred, 'es', 'es-la');
  }
  if (allowEnglishFallback && !chain.includes('en')) chain.push('en');
  return chain;
}

function filterChaptersByPreferredLanguage(chapters, preferredLanguage, allowEnglishFallback) {
  const chain = preferredLanguageChain(preferredLanguage, allowEnglishFallback);
  const normalized = (Array.isArray(chapters) ? chapters : []).map((c) => ({
    ...c,
    translated_language: normalizeLanguage(c.translated_language),
  }));

  const availableLanguages = Array.from(
    new Set(normalized.map((c) => c.translated_language).filter(Boolean))
  );
  const spanishAvailableChapters = normalized.filter(
    (c) => c.translated_language === 'es' || c.translated_language === 'es-la'
  ).length;
  const totalAvailableChapters = normalized.length;

  const selectedLanguage = chain.find((l) => normalized.some((c) => c.translated_language === l)) || '';

  const filtered = selectedLanguage
    ? normalized.filter((c) => c.translated_language === selectedLanguage)
    : [];

  const usedFallbackToEnglish = selectedLanguage === 'en' && !['en'].includes(normalizeLanguage(preferredLanguage));
  const noSpanishMessage = spanishAvailableChapters === 0 ? 'No hay capítulos disponibles en español' : null;

  return {
    chapters: filtered,
    availableLanguages,
    totalAvailableChapters,
    spanishAvailableChapters,
    selectedLanguage: selectedLanguage || null,
    usedFallbackToEnglish,
    noSpanishMessage,
  };
}

async function fetchAllMangaDexChapters(mangaId, { perPage = 100, maxTotal = 1000 } = {}) {
  const chunks = [];
  let offset = 0;
  let total = Infinity;
  const limit = Math.min(500, Math.max(1, Number(perPage) || 100));

  while (offset < total && offset < maxTotal) {
    const url = buildChaptersUrl(mangaId, { limit, offset });
    const json = await fetchJson(url);
    const data = Array.isArray(json?.data) ? json.data : [];
    const mdTotal = Number(json?.total || 0);
    if (Number.isFinite(mdTotal) && mdTotal > 0) total = mdTotal;
    chunks.push(...data);
    if (!data.length) break;
    offset += data.length;
    if (data.length < limit) break;
  }

  return chunks;
}

async function getChaptersCacheFresh(pool, mangaId, ttlMs) {
  const r = await pool.query(
    `SELECT MAX(cached_at) AS last FROM manga_chapters_cache WHERE manga_id = $1`,
    [mangaId]
  );
  const last = r.rows[0]?.last ? new Date(r.rows[0].last).getTime() : 0;
  return last && Date.now() - last < ttlMs;
}

export async function getMangaChapters(pool, id, { limit = 200, preferredLanguage = 'es', allowEnglishFallback = true, forceRefresh = false } = {}) {
  const mangaId = String(id || '').trim();
  if (!mangaId) {
    return {
      chapters: [],
      availableLanguages: [],
      totalAvailableChapters: 0,
      spanishAvailableChapters: 0,
      selectedLanguage: normalizeLanguage(preferredLanguage) || 'es',
      usedFallbackToEnglish: false,
      noSpanishMessage: 'No hay capítulos disponibles en español',
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
    const filtered = filterChaptersByPreferredLanguage(mapped, preferredLanguage, allowEnglishFallback);
    const limited = filtered.chapters.slice(0, Math.min(500, Math.max(1, Number(limit || 200) || 200)));
    return { ...filtered, chapters: limited, items: limited, meta: { source: 'db', cache_hit: true } };
  }

  const data = await fetchAllMangaDexChapters(mangaId, { perPage: 100, maxTotal: 1000 });

  const chapters = [];
  for (const e of data) {
    const mapped = mapChapter(e, mangaId);
    if (!mapped.id) continue;
    chapters.push(mapped);
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
  const filtered = filterChaptersByPreferredLanguage(mapped, preferredLanguage, allowEnglishFallback);
  const limited = filtered.chapters.slice(0, Math.min(500, Math.max(1, Number(limit || 200) || 200)));
  return { ...filtered, chapters: limited, items: limited, meta: { source: 'mangadex', cache_hit: false } };
}

export async function getChapterPages(chapterId) {
  const id = String(chapterId || '').trim();
  if (!id) return null;

  const atHome = await fetchJson(`${MANGADEX_BASE}/at-home/server/${encodeURIComponent(id)}`, { timeoutMs: 12000 });
  const baseUrl = String(atHome?.baseUrl || '').trim();
  const hash = String(atHome?.chapter?.hash || '').trim();
  const data = Array.isArray(atHome?.chapter?.data) ? atHome.chapter.data : [];

  if (!baseUrl || !hash || !data.length) {
    return { baseUrl: baseUrl || null, pages: [], chapterId: id };
  }

  const pages = data
    .map((filename) => String(filename || '').trim())
    .filter(Boolean)
    .map((filename) => `${baseUrl}/data/${hash}/${filename}`);

  return { baseUrl, pages, chapterId: id };
}

export async function refreshMangaPopularCache(pool) {
  const result = await getPopularManga(pool, { limit: 24 });
  return { ok: true, source: result?.meta?.source || null, count: (result?.items || []).length };
}
