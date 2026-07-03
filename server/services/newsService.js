import crypto from 'crypto';

const DEFAULT_ALLOWED_DOMAINS = [
  'somoskudasai.com',
  'ramenparados.com',
  'misiontokyo.com',
  'otakustudy.com',
];

const VALID_NEWS_CATEGORIES = new Set([
  'tráiler',
  'película',
  'temporada',
  'estreno',
  'manga',
  'evento',
  'industria',
]);

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(title) {
  const base = normalizeText(title).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return base || `news-${Date.now()}`;
}

function classifyCategory(title, excerpt) {
  const t = normalizeText(`${title} ${excerpt}`);
  const rules = [
    ['tráiler', ['trailer', 'tráiler', 'avance', 'teaser']],
    ['película', ['pelicula', 'película', 'movie', 'film']],
    ['temporada', ['temporada', 'season', 'cour', 'parte', 'segunda temporada', 'tercera temporada']],
    ['estreno', ['estrena', 'estreno', 'llega', 'se lanza', 'fecha de estreno', 'premiere']],
    ['manga', ['manga', 'tankobon', 'shonen', 'shojo', 'seinen', 'manhwa']],
    ['evento', ['evento', 'convencion', 'convención', 'anime expo', 'jump festa', 'comiket', 'otakon']],
    ['industria', ['estudio', 'productora', 'distribuidora', 'licencia', 'licenciado', 'plataforma', 'pixel', 'crunchyroll']],
  ];
  for (const [cat, keys] of rules) {
    if (keys.some((k) => t.includes(normalizeText(k)))) return cat;
  }
  return 'industria';
}

function extractTags(title, excerpt) {
  const t = normalizeText(`${title} ${excerpt}`);
  const tags = [];
  if (t.includes('anime')) tags.push('anime');
  if (t.includes('manga')) tags.push('manga');
  if (t.includes('otaku')) tags.push('otaku');
  if (t.includes('trailer') || t.includes('tráiler') || t.includes('teaser')) tags.push('trailer');
  if (t.includes('pelicula') || t.includes('película')) tags.push('pelicula');
  if (t.includes('temporada')) tags.push('temporada');
  return Array.from(new Set(tags));
}

function titleSimilarityKey(title) {
  const n = normalizeText(title);
  const key = n.split(' ').slice(0, 10).join(' ');
  return crypto.createHash('sha1').update(key).digest('hex');
}

function getAllowedDomains() {
  const raw = String(process.env.NEWS_ALLOWED_DOMAINS || '').trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_DOMAINS;
  return new Set(list.map((d) => d.toLowerCase()));
}

function hostFromUrl(url) {
  try {
    const u = new URL(url);
    return String(u.hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

function isAllowedDomain(url, allowedDomains) {
  const host = hostFromUrl(url);
  if (!host) return false;
  for (const d of allowedDomains) {
    if (host === d) return true;
    if (host.endsWith(`.${d}`)) return true;
  }
  return false;
}

function decodeHtmlEntities(s) {
  const input = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const named = input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&iacute;/gi, 'í')
    .replace(/&eacute;/gi, 'é')
    .replace(/&aacute;/gi, 'á')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&hellip;/gi, '…');

  const dec = named
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#([0-9]+);/g, (_, num) => {
      const code = Number.parseInt(num, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });

  return dec;
}

function stripHtml(s) {
  const decoded = decodeHtmlEntities(String(s || ''));
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isLikelyImageUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (!/^https?:\/\//i.test(u)) return false;
  const lowered = u.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/.test(lowered)) return true;
  if (lowered.includes('wp-content/uploads') || lowered.includes('/uploads/')) return true;
  if (lowered.includes('image') || lowered.includes('img') || lowered.includes('thumb')) return true;
  return false;
}

function isValidHttpUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasUsefulBody(excerpt, content) {
  const body = String(content || excerpt || '').replace(/\s+/g, ' ').trim();
  return body.length >= 40;
}

function computeQualitySignals(article) {
  const title = String(article?.title || '').trim();
  const excerpt = String(article?.excerpt || '').trim();
  const content = String(article?.content || '').trim();
  const category = String(article?.category || '').trim();
  const externalUrl = String(article?.external_url || '').trim();
  const imageUrl = String(article?.image_url || '').trim();

  const titleOk = title.length >= 8;
  const bodyOk = hasUsefulBody(excerpt, content);
  const categoryOk = VALID_NEWS_CATEGORIES.has(category);
  const urlOk = isValidHttpUrl(externalUrl);
  const hasValidImage = isLikelyImageUrl(imageUrl);

  let score = 0;
  if (titleOk) score += 25;
  if (bodyOk) score += 25;
  if (hasValidImage) score += 20;
  if (categoryOk) score += 10;
  if (urlOk) score += 20;

  const qualityScore = Math.max(0, Math.min(100, score));
  const isPublishable = titleOk && bodyOk && categoryOk && urlOk && qualityScore >= 60;

  return {
    has_valid_image: hasValidImage,
    quality_score: qualityScore,
    is_publishable: isPublishable,
  };
}

function applyQualitySignals(article) {
  return { ...article, ...computeQualitySignals(article) };
}

function extractAttrUrl(block, tagName, attrName = 'url') {
  const re = new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  const m = String(block || '').match(re);
  return m ? String(m[1] || '').trim() : '';
}

function extractFirstImgSrc(html) {
  const m = String(html || '').match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  return m ? String(m[1] || '').trim() : '';
}

function pickImageUrlFromRaw(raw) {
  const candidates = [
    raw?.image_url,
    raw?.urlToImage,
    raw?.media_content,
    raw?.mediaContent,
    raw?.media_thumbnail,
    raw?.mediaThumbnail,
    raw?.enclosure_url,
    raw?.enclosureUrl,
    raw?.enclosure?.url,
    raw?.image,
    raw?.imageUrl,
    raw?.thumbnail,
    raw?.thumbnail_url,
    raw?.thumbnailUrl,
    raw?.cover,
    raw?.banner,
    extractFirstImgSrc(raw?.content || ''),
    extractFirstImgSrc(raw?.description || ''),
  ];
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (isLikelyImageUrl(v)) return v;
  }
  return '';
}

async function fetchOgImageFromUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PixelNoSekaiBot/1.0 (+news-ingest)' },
    });
    clearTimeout(timeout);
    if (!resp.ok) return '';
    const html = await resp.text();
    const tryRegexes = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    ];
    for (const re of tryRegexes) {
      const m = html.match(re);
      if (!m) continue;
      const raw = String(m[1] || '').trim();
      if (!raw) continue;
      const absolute = new URL(raw, url).href;
      if (isLikelyImageUrl(absolute)) return absolute;
    }
    const img = extractFirstImgSrc(html);
    if (img) {
      const absolute = new URL(img, url).href;
      if (isLikelyImageUrl(absolute)) return absolute;
    }
    return '';
  } catch {
    return '';
  }
}

function scoreRelevance(title, excerpt, content) {
  const t = normalizeText(`${title} ${excerpt} ${content}`);
  let score = 0;

  const positive = [
    [6, ['anime', 'manga']],
    [4, ['otaku', 'temporada', 'episodio', 'capitulo', 'capítulo', 'ova', 'ona', 'opening', 'ending']],
    [4, ['trailer anime', 'tráiler anime', 'pelicula anime', 'película anime']],
    [3, ['estudio', 'seiyuu', 'doblaje', 'shonen', 'shōnen', 'shojo', 'shōjo', 'seinen', 'isekai', 'light novel', 'novela ligera', 'manhwa']],
    [2, ['crunchyroll', 'funimation', 'hidive', 'aniplex', 'shueisha', 'kodansha', 'jump']],
  ];
  for (const [w, keys] of positive) {
    for (const k of keys) {
      if (t.includes(normalizeText(k))) score += w;
    }
  }

  const hardNegative = [
    'futbol',
    'fútbol',
    'real madrid',
    'barcelona',
    'nba',
    'policia',
    'policía',
    'gobierno',
    'elecciones',
    'presidente',
    'trump',
    'putin',
    'israel',
    'ucrania',
    'bitcoin',
    'cripto',
    'moda',
    'horoscopo',
    'horóscopo',
  ];
  if (hardNegative.some((k) => t.includes(normalizeText(k)))) score -= 10;

  return score;
}

function isRelevantArticle(a) {
  const score = scoreRelevance(a.title, a.excerpt, a.content);
  return score >= 6;
}

async function cleanupExisting(pool, allowedDomains) {
  const r = await pool.query(
    `SELECT id, title, excerpt, content, external_url FROM news_articles WHERE is_active = true`
  );
  const ids = [];
  for (const row of r.rows) {
    const url = String(row.external_url || '');
    const okDomain = isAllowedDomain(url, allowedDomains);
    const okRel = isRelevantArticle({
      title: String(row.title || ''),
      excerpt: String(row.excerpt || ''),
      content: String(row.content || ''),
    });
    if (!okDomain || !okRel) ids.push(Number(row.id));
  }
  if (!ids.length) return 0;
  await pool.query(
    `UPDATE news_articles SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  return ids.length;
}

export async function fetchNewsApiArticles({ apiKey, queries, language = 'es', pageSize = 50 }) {
  const base = 'https://newsapi.org/v2/everything';
  const headers = { 'X-Api-Key': apiKey };
  const all = [];
  const allowedDomains = getAllowedDomains();
  const domainsParam = Array.from(allowedDomains).join(',');

  for (const q of queries) {
    const url = new URL(base);
    url.searchParams.set('q', q);
    url.searchParams.set('language', language);
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('domains', domainsParam);
    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`NewsAPI ${resp.status}: ${text || resp.statusText}`);
    }
    const json = await resp.json();
    const items = Array.isArray(json?.articles) ? json.articles : [];
    for (const a of items) all.push(a);
  }

  return all;
}

export async function fetchRssArticles({ feeds }) {
  const items = [];
  for (const feedUrl of feeds) {
    const resp = await fetch(feedUrl);
    if (!resp.ok) continue;
    const xml = await resp.text();
    const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    for (const block of matches) {
      const getTag = (tag) => {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const m = block.match(re);
        return m ? String(m[1] || '') : '';
      };
      const title = stripHtml(getTag('title'));
      const link = stripHtml(getTag('link'));
      const pubDate = stripHtml(getTag('pubDate'));
      const desc = stripHtml(getTag('description'));
      const content = stripHtml(getTag('content:encoded'));
      const mediaContent = extractAttrUrl(block, 'media:content', 'url');
      const mediaThumb = extractAttrUrl(block, 'media:thumbnail', 'url');
      const enclosureUrl = extractAttrUrl(block, 'enclosure', 'url');
      const contentRaw = getTag('content:encoded');
      const descRaw = getTag('description');
      items.push({
        title,
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        description: descRaw || desc,
        content: contentRaw || content,
        source: { name: hostFromUrl(link) },
        urlToImage: mediaContent || mediaThumb || enclosureUrl || '',
        media_content: mediaContent,
        media_thumbnail: mediaThumb,
        enclosure_url: enclosureUrl,
      });
    }
  }
  return items;
}

export function normalizeArticle(raw) {
  const title = stripHtml(raw?.title || '').trim();
  const externalUrl = String(raw?.url || '').trim();
  const publishedAt = raw?.publishedAt ? new Date(raw.publishedAt) : null;
  const excerptClean = stripHtml(raw?.description || '').trim();
  const contentClean = stripHtml(raw?.content || '').trim();
  const excerpt = excerptClean || (contentClean ? contentClean.slice(0, 220) : '');
  const content = contentClean || null;
  const sourceName = String(raw?.source?.name || '').trim() || hostFromUrl(externalUrl);
  const imageUrl = pickImageUrlFromRaw(raw);
  const categoryRaw = classifyCategory(title, excerpt);
  const category = VALID_NEWS_CATEGORIES.has(categoryRaw) ? categoryRaw : 'industria';
  const tags = extractTags(title, excerpt);

  const normalized = {
    title,
    slug: slugify(title),
    excerpt,
    content,
    source_name: sourceName,
    source_url: '',
    image_url: imageUrl,
    published_at: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
    category,
    tags,
    language: 'es',
    is_featured: false,
    external_url: externalUrl,
    similarity_key: titleSimilarityKey(title),
  };

  return applyQualitySignals(normalized);
}

async function enrichArticleImageUrls(list) {
  const out = [];
  let enriched = 0;
  for (const a of list) {
    if (a.image_url) {
      out.push(a);
      continue;
    }
    const og = await fetchOgImageFromUrl(a.external_url);
    if (og) {
      out.push({ ...a, image_url: og });
      enriched += 1;
    } else {
      out.push(a);
    }
  }
  return { articles: out, enriched };
}

export async function upsertArticles(pool, articles) {
  if (!articles.length) return { inserted: 0, updated: 0, skipped: 0 };

  const deduped = new Map();
  let skippedInvalid = 0;
  for (const a of articles) {
    if (!a.title || !a.external_url) {
      skippedInvalid += 1;
      continue;
    }
    const k = a.external_url;
    if (!deduped.has(k)) deduped.set(k, a);
    else skippedInvalid += 1;
  }

  const list = Array.from(deduped.values());
  const inserted = { count: 0 };
  const updated = { count: 0 };
  const skipped = { count: 0 };

  for (const a of list) {
    const existing = await pool.query(
      `SELECT id, slug, updated_at FROM news_articles WHERE external_url = $1 LIMIT 1`,
      [a.external_url]
    );

    let slug = a.slug;
    if (!slug) slug = `news-${Date.now()}`;

    if (!existing.rows.length) {
      const slugExists = await pool.query(`SELECT 1 FROM news_articles WHERE slug = $1 LIMIT 1`, [slug]);
      if (slugExists.rows.length) slug = `${slug}-${String(a.similarity_key).slice(0, 6)}`;

      await pool.query(
        `
        INSERT INTO news_articles
          (title, slug, excerpt, content, source_name, source_url, image_url, published_at, category, tags, language, is_featured, external_url, has_valid_image, is_publishable, quality_score, is_active, created_at, updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `,
        [
          a.title,
          slug,
          a.excerpt || null,
          a.content || null,
          a.source_name || null,
          a.source_url || null,
          a.image_url || null,
          a.published_at ? new Date(a.published_at) : null,
          a.category || null,
          JSON.stringify(a.tags || []),
          a.language || 'es',
          false,
          a.external_url,
          a.has_valid_image === true,
          a.is_publishable === true,
          Number(a.quality_score || 0),
        ]
      );
      inserted.count += 1;
      continue;
    }

    await pool.query(
      `
      UPDATE news_articles
      SET
        title = $2,
        excerpt = $3,
        content = $4,
        source_name = $5,
        image_url = $6,
        published_at = $7,
        category = $8,
        tags = $9::jsonb,
        language = $10,
        has_valid_image = $11,
        is_publishable = $12,
        quality_score = $13,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [
        existing.rows[0].id,
        a.title,
        a.excerpt || null,
        a.content || null,
        a.source_name || null,
        a.image_url || null,
        a.published_at ? new Date(a.published_at) : null,
        a.category || null,
        JSON.stringify(a.tags || []),
        a.language || 'es',
        a.has_valid_image === true,
        a.is_publishable === true,
        Number(a.quality_score || 0),
      ]
    );
    updated.count += 1;
  }

  skipped.count += skippedInvalid;
  return { inserted: inserted.count, updated: updated.count, skipped: skipped.count };
}

export async function refreshNews(pool, opts = {}) {
  const allowedDomains = getAllowedDomains();

  const rssFeedsRaw = String(process.env.NEWS_RSS_FEEDS || '').trim();
  const rssFeeds = rssFeedsRaw
    ? rssFeedsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [
      'https://somoskudasai.com/feed/',
      'https://ramenparados.com/feed/',
      'https://misiontokyo.com/feed/',
    ];

  let raw = [];
  let source = 'rss';
  try {
    raw = await fetchRssArticles({ feeds: rssFeeds });
  } catch {
    raw = [];
  }

  const apiKey = String(process.env.NEWSAPI_KEY || '').trim();
  const allowNewsApiFallback = opts.allowNewsApiFallback !== false;
  if (allowNewsApiFallback && raw.length < 12 && apiKey) {
    source = 'newsapi';
    const queries = opts.queries || [
      'anime OR manga OR otaku',
      '"temporada anime"',
      '"película anime"',
      '"tráiler anime" OR "trailer anime"',
      '"estudio anime"',
    ];
    const fallback = await fetchNewsApiArticles({ apiKey, queries, language: 'es', pageSize: 50 });
    raw = raw.concat(fallback);
  }

  if (!raw.length) {
    const available = await pool.query(
      `SELECT COUNT(*)::int AS total FROM news_articles WHERE is_active = true AND is_publishable = true`
    );
    return {
      ok: true,
      source,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      deactivated: 0,
      available_from_db: available.rows[0]?.total || 0,
    };
  }

  const normalizedBase = raw
    .map(normalizeArticle)
    .filter((a) => a.title && a.external_url)
    .filter((a) => isAllowedDomain(a.external_url, allowedDomains))
    .filter(isRelevantArticle);

  const enrichedResult = await enrichArticleImageUrls(normalizedBase);
  let normalized = enrichedResult.articles.map(applyQualitySignals);

  const minItems = Math.max(8, Number(opts.minItems || process.env.NEWS_MIN_ITEMS || 12) || 12);
  if (normalized.length < minItems) {
    const needed = minItems - normalized.length;
    const existing = await pool.query(
      `
      SELECT
        id, title, slug, excerpt, content, source_name, source_url, image_url, published_at, category, tags, language, is_featured, external_url, has_valid_image, is_publishable, quality_score
      FROM news_articles
      WHERE is_active = true AND is_publishable = true
      ORDER BY quality_score DESC, has_valid_image DESC, published_at DESC NULLS LAST, id DESC
      LIMIT $1
      `,
      [needed * 3]
    );
    const seen = new Set(normalized.map((a) => String(a.external_url || '').trim()).filter(Boolean));
    let added = 0;
    for (const row of existing.rows) {
      const key = String(row.external_url || '').trim();
      if (key && seen.has(key)) continue;
      normalized.push({
        title: row.title,
        slug: row.slug,
        excerpt: row.excerpt,
        content: row.content,
        source_name: row.source_name,
        source_url: row.source_url,
        image_url: row.image_url,
        published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
        category: row.category,
        tags: Array.isArray(row.tags) ? row.tags : [],
        language: row.language || 'es',
        is_featured: row.is_featured === true,
        external_url: row.external_url,
        similarity_key: titleSimilarityKey(row.title),
        has_valid_image: row.has_valid_image === true,
        is_publishable: row.is_publishable === true,
        quality_score: Number(row.quality_score || 0),
      });
      if (key) seen.add(key);
      added += 1;
      if (added >= needed) break;
    }
  }

  const result = await upsertArticles(pool, normalized);
  const deactivated = opts.cleanup === false ? 0 : await cleanupExisting(pool, allowedDomains);
  return { ok: true, source, fetched: raw.length, enriched_images: enrichedResult.enriched, ...result, deactivated };
}
