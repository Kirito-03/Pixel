import * as cheerio from 'cheerio';

const ORIGIN = 'https://dragontranslation.org';
const TTL = 6 * 60 * 60 * 1000;

export function normalizeChapterUrl(value) {
  let raw = String(value || '').trim();
  if (raw.length > 4096) return null;
  try {
    for (let n = 0; n < 4 && raw.includes('%'); n++) {
      const decoded = decodeURIComponent(raw);
      if (decoded === raw) break;
      raw = decoded;
    }
    const url = new URL(raw);
    if (url.origin !== ORIGIN || url.username || url.password || !url.pathname.startsWith('/manga/')) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function bestMangaImageUrl(image, baseUrl) {
  const variants = String(image.attr('data-srcset') || image.attr('srcset') || '')
    .split(',').map(entry => {
      const [url, descriptor = '0w'] = entry.trim().split(/\s+/);
      return { url, size: parseFloat(descriptor) || 0 };
    }).sort((a, b) => b.size - a.size).map(entry => entry.url);
  const candidates = [image.attr('data-original'), image.attr('data-full-url'), ...variants,
    image.attr('data-src'), image.attr('data-lazy-src'), image.attr('src')];
  for (const candidate of candidates) {
    if (!candidate || /^data:|logo|placeholder|\/icon/i.test(candidate)) continue;
    try {
      const url = new URL(candidate.trim(), baseUrl);
      if (url.origin === ORIGIN && !url.username && !url.password) return url.href;
    } catch { /* Try the next source attribute. */ }
  }
  return null;
}

export function extractOriginalPages(html, chapterUrl) {
  const $ = cheerio.load(html);
  const pages = new Set();
  $('.reading-content img, .wp-manga-chapter-img').each((_, element) => {
    const url = bestMangaImageUrl($(element), chapterUrl);
    if (url) pages.add(`/api/proxy/manga-image?url=${encodeURIComponent(url)}`);
  });
  return [...pages].slice(0, 1500);
}

export function createChapterPageLoader({ fetchHtml, now = Date.now }) {
  const memory = new Map(), pending = new Map();
  return async function load(pool, input) {
    const url = normalizeChapterUrl(input);
    if (!url) return null;
    const stored = memory.get(url);
    if (stored && stored.expires > now()) return { ...stored.data, meta: { source: 'memory', cache_hit: true } };
    if (pending.has(url)) return pending.get(url);
    const remember = data => {
      memory.delete(url);
      memory.set(url, { expires: now() + TTL, data });
      if (memory.size > 60) memory.delete(memory.keys().next().value);
      return data;
    };
    const request = (async () => {
      try {
        const cached = await pool?.query(
          'SELECT pages FROM manga_page_cache WHERE chapter_url = $1 AND (fetched_at > NOW() - INTERVAL \'6 hours\' OR pages::text LIKE \'%/api/stream/Manga/%\')', [url]);
        if (Array.isArray(cached?.rows?.[0]?.pages) && cached.rows[0].pages.length) {
          return remember({ baseUrl: '', pages: cached.rows[0].pages, chapterId: url, meta: { source: 'db', cache_hit: true } });
        }
      } catch { /* Older databases can run until the additive migration is applied. */ }
      const pages = extractOriginalPages(await fetchHtml(url), url);
      const data = { baseUrl: '', pages, chapterId: url, meta: { source: 'origin', cache_hit: false } };
      // Empty/error responses must never poison either cache.
      if (!pages.length) return data;
      try {
        await pool?.query(`INSERT INTO manga_page_cache (chapter_url, pages, fetched_at) VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (chapter_url) DO UPDATE SET pages = CASE WHEN manga_page_cache.pages::text LIKE '%/api/stream/Manga/%' THEN manga_page_cache.pages ELSE EXCLUDED.pages END, fetched_at = NOW()`, [url, JSON.stringify(pages)]);
        await pool?.query('UPDATE manga_chapters_cache SET pages = $1 WHERE chapter_id = $2', [pages.length, url]);
      } catch { /* The in-memory cache still prevents duplicate origin requests. */ }
      return remember(data);
    })();
    pending.set(url, request);
    try { return await request; } finally { pending.delete(url); }
  };
}
