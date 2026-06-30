import axios from 'axios'
import { createReadStream, existsSync } from 'fs'
import { readdir } from 'fs/promises'
import readline from 'readline'
import { basename, extname, join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pool from '../db.js'
import { enqueueTranscodeJob } from './transcodeQueueService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'])

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function slugify(value) {
  const s = normalizeText(value).replace(/\s+/g, '-').replace(/-+/g, '-')
  return s.slice(0, 80)
}

function similarity(a, b) {
  const A = new Set(normalizeText(a).split(' ').filter(Boolean))
  const B = new Set(normalizeText(b).split(' ').filter(Boolean))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const union = A.size + B.size - inter
  return union ? inter / union : 0
}

function parseExtinf(line) {
  const raw = String(line || '').trim()
  if (!raw.startsWith('#EXTINF')) return null

  const commaIdx = raw.indexOf(',')
  const meta = commaIdx >= 0 ? raw.slice(0, commaIdx) : raw
  const name = commaIdx >= 0 ? raw.slice(commaIdx + 1).trim() : ''

  const attrs = {}
  const re = /([a-zA-Z0-9_-]+)="([^"]*)"/g
  let m
  while ((m = re.exec(meta))) {
    attrs[m[1]] = m[2]
  }

  return { attrs, name }
}

function parseSeasonEpisode(value) {
  const text = String(value || '')
  let m = text.match(/S(\d{1,2})\s*E(\d{1,3})/i)
  if (m) return { season: Number(m[1]), episode: Number(m[2]) }
  m = text.match(/(\d{1,2})x(\d{1,3})/i)
  if (m) return { season: Number(m[1]), episode: Number(m[2]) }
  m = text.match(/\b(?:EP|Episodio|E)\s*(\d{1,3})\b/i)
  if (m) return { season: 1, episode: Number(m[1]) }
  return null
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, '')
    .replace(/\b\d{1,2}x\d{1,3}\b/gi, '')
    .replace(/\b(?:EP|Episodio|E)\s*\d{1,3}\b/gi, '')
    .replace(/\b(1080p|720p|480p|4k)\b/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function guessAnimeTitle({ attrs, name, url, fallbackFromPath }) {
  const groupTitle = attrs?.['group-title']
  if (groupTitle && normalizeText(groupTitle) && normalizeText(groupTitle) !== 'general') return groupTitle.trim()

  const cleaned = cleanTitle(name)
  if (cleaned) return cleaned

  if (fallbackFromPath) return fallbackFromPath

  try {
    const base = basename(String(url || '').split('?')[0] || '')
    const file = base.replace(extname(base), '')
    return cleanTitle(decodeURIComponent(file))
  } catch {
    return cleanTitle(String(url || ''))
  }
}

function heuristicScore({ title, groupTitle, season, episode, url }) {
  const t = normalizeText(title)
  if (!t || t.length < 3) return 0

  let score = 0.15
  if (groupTitle) score += 0.45
  if (Number.isFinite(season) && Number.isFinite(episode)) score += 0.2
  if (/anime|animes|sub|subs|ova|op|ed/.test(t)) score += 0.08
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(title)) score += 0.08
  if (/anime|animes/.test(String(url || '').toLowerCase())) score += 0.06

  const negative = /\b(futbol|football|soccer|basket|noticias|news|tv en vivo|vivo|radio|podcast|pelicula|movie|series?)\b/i
  if (negative.test(title)) score -= 0.3

  return Math.max(0, Math.min(1, score))
}

function mapJikanStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('currently') || s.includes('airing')) return 'Airing'
  if (s.includes('finished')) return 'Finished'
  if (s.includes('not yet') || s.includes('upcoming')) return 'Upcoming'
  return 'Unknown'
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function jikanSearch(title, cache) {
  const key = normalizeText(title)
  if (!key) return null
  if (cache.has(key)) return cache.get(key)

  await sleep(360)
  const r = await axios.get('https://api.jikan.moe/v4/anime', {
    params: { q: title, limit: 5, order_by: 'score', sort: 'desc' },
    timeout: 20_000,
    headers: { 'User-Agent': 'pixel-no-sekai-importer' },
  })

  const items = Array.isArray(r.data?.data) ? r.data.data : []
  let best = null
  let bestScore = 0

  for (const it of items) {
    const score = Math.max(
      similarity(title, it?.title),
      similarity(title, it?.title_english),
      similarity(title, it?.title_japanese)
    )
    if (score > bestScore) {
      bestScore = score
      best = it
    }
  }

  const out = best && bestScore >= 0.55 ? { item: best, score: bestScore } : null
  cache.set(key, out)
  return out
}

async function processM3uReadable(readable, onItem, { maxItems }) {
  const rl = readline.createInterface({ input: readable, crlfDelay: Infinity })
  let pending = null
  let count = 0

  for await (const line of rl) {
    if (options?.signal?.aborted) { rl.close(); throw new Error('AbortError'); }

    const l = String(line || '').trim()
    if (!l) continue

    if (l.startsWith('#EXTINF')) {
      pending = parseExtinf(l)
      continue
    }

    if (pending && !l.startsWith('#')) {
      await onItem({ ...pending, url: l })
      pending = null
      count++
      if (typeof maxItems === 'number' && maxItems > 0 && count >= maxItems) break
    }
  }

  rl.close()
  return count
}

async function scanFolder(folderPath, onFile, { maxItems, maxDepth = 6 }) {
  const root = resolve(folderPath)
  let seen = 0

  async function walk(dir, depth) {
    if (options?.signal?.aborted) throw new Error('AbortError');
    if (typeof maxItems === 'number' && maxItems > 0 && seen >= maxItems) return
    if (depth > maxDepth) return

    const entries = await readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      if (typeof maxItems === 'number' && maxItems > 0 && seen >= maxItems) return
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (!ent.isFile()) continue
      const ext = extname(ent.name).toLowerCase()
      if (!VIDEO_EXTS.has(ext)) continue
      await onFile(full)
      seen++
    }
  }

  await walk(root, 0)
  return seen
}

function resolveAllowedPath(inputPath, allowedRoots) {
  const abs = resolve(inputPath)
  for (const root of allowedRoots) {
    const r = resolve(root)
    if (abs === r || abs.startsWith(r + '\\') || abs.startsWith(r + '/')) return abs
  }
  return null
}

async function findAnimeIdByAlias(alias) {
  const n = normalizeText(alias)
  if (!n) return null
  try {
    const r = await pool.query(
      `SELECT anime_id FROM anime_title_aliases WHERE normalized_alias = $1 LIMIT 1`,
      [n]
    )
    return r.rows[0]?.anime_id || null
  } catch {
    return null
  }
}

async function addAnimeAlias({ animeId, alias }) {
  const n = normalizeText(alias)
  if (!n) return
  try {
    await pool.query(
      `INSERT INTO anime_title_aliases (anime_id, alias, normalized_alias)
       VALUES ($1, $2, $3)
       ON CONFLICT (normalized_alias) DO NOTHING`,
      [animeId, alias, n]
    )
  } catch {
  }
}

async function upsertAnime({ title, enrichment }) {
  const aliasHit = await findAnimeIdByAlias(title)
  if (aliasHit) return { id: aliasHit, created: false }

  const franchiseKey = slugify(title)
  const existing = await pool.query(
    `SELECT id FROM anime_content
     WHERE is_active = true AND (LOWER(title) = LOWER($1) OR franchise_key = $2)
     ORDER BY id ASC
     LIMIT 1`,
    [title, franchiseKey]
  )

  if (existing.rows[0]?.id) {
    const id = existing.rows[0].id
    await addAnimeAlias({ animeId: id, alias: title })
    return { id, created: false }
  }

  const e = enrichment || {}
  const genres = Array.isArray(e.genres) ? e.genres : null

  const inserted = await pool.query(
    `INSERT INTO anime_content (
      tmdb_id, title, franchise_key, title_english, title_japanese, description,
      poster_url, banner_url, genres, status, total_episodes, rating, release_date, is_active
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,$12,$13,true
    ) RETURNING id`,
    [
      e.tmdb_id || null,
      title,
      franchiseKey || null,
      e.title_english || null,
      e.title_japanese || null,
      e.description || null,
      e.poster_url || null,
      e.banner_url || null,
      genres,
      e.status || 'Unknown',
      typeof e.total_episodes === 'number' ? e.total_episodes : 0,
      typeof e.rating === 'number' ? e.rating : 0,
      e.release_date || null,
    ]
  )

  const id = inserted.rows[0].id
  await addAnimeAlias({ animeId: id, alias: title })
  if (e.title_english) await addAnimeAlias({ animeId: id, alias: e.title_english })
  if (e.title_japanese) await addAnimeAlias({ animeId: id, alias: e.title_japanese })
  return { id, created: true }
}

async function upsertEpisode({ animeId, season, episodeNumber, title, videoUrl, quality }) {
  const existing = await pool.query(
    `SELECT id, video_url, stream_url FROM anime_episodes
     WHERE anime_id = $1 AND season = $2 AND episode_number = $3 AND is_active = true
     LIMIT 1`,
    [animeId, season, episodeNumber]
  )

  if (existing.rows[0]?.id) {
    const id = existing.rows[0].id
    await pool.query(
      `UPDATE anime_episodes
       SET title = COALESCE($2, title),
           video_url = COALESCE($3, video_url),
           quality = COALESCE($4, quality),
           status = CASE WHEN COALESCE($3, video_url) IS NOT NULL THEN 'queued' ELSE status END,
           storage_type = CASE WHEN COALESCE($3, video_url) IS NOT NULL THEN 'external' ELSE storage_type END,
           updated_at = NOW()
       WHERE id = $1`,
      [id, title || null, videoUrl || null, quality || null]
    )
    return { id, existed: true, stream_url: existing.rows[0].stream_url }
  }

  const inserted = await pool.query(
    `INSERT INTO anime_episodes
     (anime_id, season, episode_number, title, video_url, status, storage_type, quality, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
     RETURNING id`,
    [
      animeId,
      season,
      episodeNumber,
      title || null,
      videoUrl || null,
      videoUrl ? 'queued' : 'missing',
      videoUrl ? 'external' : 'gdrive',
      quality || '1080p',
    ]
  )

  return { id: inserted.rows[0].id, existed: false, stream_url: null }
}

function parseQuality(text) {
  const m = String(text || '').match(/\b(2160p|4k|1080p|720p|480p)\b/i)
  if (!m) return null
  const v = m[1].toLowerCase()
  return v === '4k' ? '4K' : v
}

export async function importAnimeFromSources({
  m3u = [],
  folders = [],
  options = {},
}) {
  const dryRun = options.dryRun === true
  const validateMode = options.validateMode || 'mixed'
  const maxItems = typeof options.maxItems === 'number' ? options.maxItems : 600
  const maxTranscodes = typeof options.maxTranscodes === 'number' ? options.maxTranscodes : 25
  const allowNoEpisode = options.allowNoEpisode === true
  const selectedTitles = Array.isArray(options.selectedTitles) && options.selectedTitles.length
    ? new Set(options.selectedTitles.map(t => normalizeText(t)))
    : null

  const allowedRoots = [
    join(__dirname, '..', 'videos'),
    join(__dirname, '..', 'uploads'),
    join(__dirname, '..', 'uploads', 'imports'),
  ]

  const jikanCache = new Map()
  const animeIdCache = new Map()

  const stats = {
    scanned: 0,
    accepted: 0,
    importedAnime: 0,
    importedEpisodes: 0,
    transcoded: 0,
    skippedNotAnime: 0,
    skippedNoEpisode: 0,
    skippedNoVideo: 0,
    errors: 0,
    samples: [],
    byAnime: new Map(),
  }

  async function decideAnime({ title, groupTitle, season, episode, url }) {
    const score = heuristicScore({ title, groupTitle, season, episode, url })
    if (validateMode === 'heuristic') return { ok: score >= 0.6, score, enrichment: null }

    if (validateMode === 'api') {
      const r = await jikanSearch(title, jikanCache)
      return { ok: !!r, score, enrichment: r?.item || null }
    }

    if (score >= 0.7) return { ok: true, score, enrichment: null }
    const r = await jikanSearch(title, jikanCache)
    return { ok: !!r, score, enrichment: r?.item || null }
  }

  async function ensureAnimeId(title, enrichment) {
    const key = normalizeText(title)
    if (animeIdCache.has(key)) return animeIdCache.get(key)

    let payload = null
    if (enrichment) {
      const genres = Array.isArray(enrichment.genres) ? enrichment.genres.map((g) => g?.name).filter(Boolean) : null
      payload = {
        title_english: enrichment.title_english || null,
        title_japanese: enrichment.title_japanese || null,
        description: enrichment.synopsis || null,
        poster_url: enrichment.images?.jpg?.image_url || null,
        banner_url: enrichment.images?.jpg?.large_image_url || null,
        genres,
        status: mapJikanStatus(enrichment.status),
        total_episodes: typeof enrichment.episodes === 'number' ? enrichment.episodes : 0,
        rating: typeof enrichment.score === 'number' ? enrichment.score : 0,
        release_date: enrichment.aired?.from ? String(enrichment.aired.from).slice(0, 10) : null,
      }
    } else if (process.env.TMDB_API_KEY) {
      // TMDB Fallback si no hay enrichment (heuristic match o jikan falló)
      try {
        const searchRes = await axios.get('https://api.themoviedb.org/3/search/tv', {
          params: {
            api_key: process.env.TMDB_API_KEY,
            query: title,
            language: 'es-ES'
          }
        });
        if (searchRes.data.results && searchRes.data.results.length > 0) {
          const first = searchRes.data.results[0];
          const detailsRes = await axios.get(`https://api.themoviedb.org/3/tv/${first.id}`, {
            params: {
              api_key: process.env.TMDB_API_KEY,
              language: 'es-ES'
            }
          });
          const tmdb = detailsRes.data;
          payload = {
            tmdb_id: tmdb.id,
            title_english: tmdb.name || null,
            title_japanese: tmdb.original_name || null,
            description: tmdb.overview || null,
            poster_url: tmdb.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : null,
            banner_url: tmdb.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : null,
            genres: tmdb.genres ? tmdb.genres.map(g => g.name) : null,
            status: tmdb.status || 'Unknown',
            total_episodes: tmdb.number_of_episodes || 0,
            rating: tmdb.vote_average || 0,
            release_date: tmdb.first_air_date || null
          };
        }
      } catch (e) {
        console.warn('[TMDB Fallback Error]', e.message);
      }
    }

    const r = await upsertAnime({ title, enrichment: payload })
    animeIdCache.set(key, r.id)
    if (r.created) stats.importedAnime += 1
    return r.id
  }

  async function maybeTranscode(episodeId, src) {
    if (!options.transcode) return
    if (!episodeId || !src) return
    if (stats.transcoded >= maxTranscodes) return

    await pool.query(
      `UPDATE anime_episodes
       SET status = 'queued',
           updated_at = NOW()
       WHERE id = $1`,
      [episodeId]
    )
    await enqueueTranscodeJob({ episodeId, src })
    stats.transcoded += 1
  }

  async function onEntry({ attrs, name, url, fallbackFromPath }) {
    stats.scanned += 1

    const se = parseSeasonEpisode(name) || parseSeasonEpisode(url)
    const season = se?.season ?? null
    const episode = se?.episode ?? null

    if (!allowNoEpisode && (!episode || !Number.isFinite(episode))) {
      stats.skippedNoEpisode += 1
      return
    }

    if (!url) {
      stats.skippedNoVideo += 1
      return
    }

    const title = guessAnimeTitle({ attrs, name, url, fallbackFromPath })
    const groupTitle = attrs?.['group-title'] || null

    const decision = await decideAnime({
      title,
      groupTitle,
      season,
      episode,
      url,
    })

    if (!decision.ok) {
      stats.skippedNotAnime += 1
      return
    }

    stats.accepted += 1
    const key = normalizeText(title)
    const prev = stats.byAnime.get(key)
    if (prev) {
      prev.count += 1
    } else {
      stats.byAnime.set(key, { title, count: 1 })
    }

    if (stats.samples.length < 12) {
      stats.samples.push({
        title,
        season: season ?? 1,
        episode: episode ?? null,
        url,
        score: decision.score,
      })
    }

    if (dryRun) return

    // Si hay filtro de selección, solo importar los seleccionados
    if (selectedTitles && !selectedTitles.has(normalizeText(title))) return

    const animeId = await ensureAnimeId(title, decision.enrichment)
    const q = parseQuality(name) || parseQuality(url)
    const epNumber = Number.isFinite(episode) ? episode : null
    const epSeason = Number.isFinite(season) ? season : 1
    if (!epNumber) return

    const up = await upsertEpisode({
      animeId,
      season: epSeason,
      episodeNumber: epNumber,
      title: name || null,
      videoUrl: url,
      quality: q,
    })

    stats.importedEpisodes += up.existed ? 0 : 1
    await maybeTranscode(up.id, url)
  }

  for (const src of m3u) {
    if (options.signal?.aborted) break
    if (typeof maxItems === 'number' && maxItems > 0 && stats.scanned >= maxItems) break
    try {
      if (src?.type === 'file') {
        const abs = resolveAllowedPath(src.path, allowedRoots)
        if (!abs || !existsSync(abs)) continue
        await processM3uReadable(createReadStream(abs, { encoding: 'utf8' }), (item) => onEntry({ ...item }), {
          maxItems,
          signal: options.signal,
        })
        continue
      }

      if (src?.type === 'url') {
        const r = await axios.get(src.url, { responseType: 'stream', timeout: 30_000 })
        await processM3uReadable(r.data, (item) => onEntry({ ...item }), { maxItems, signal: options.signal })
      }
    } catch (e) {
      if (e.message === 'AbortError') throw e;
      stats.errors += 1
    }
  }

  for (const folder of folders) {
    if (options.signal?.aborted) break
    if (typeof maxItems === 'number' && maxItems > 0 && stats.scanned >= maxItems) break
    try {
      const abs = resolveAllowedPath(folder.path, allowedRoots)
      if (!abs || !existsSync(abs)) continue
      await scanFolder(
        abs,
        async (fullPath) => {
          if (options.signal?.aborted) throw new Error('AbortError')
          const parent = basename(dirname(fullPath))
          const fileName = basename(fullPath)
          const se = parseSeasonEpisode(fileName) || parseSeasonEpisode(parent)
          const title = cleanTitle(parent)
          await onEntry({
            attrs: {},
            name: fileName,
            url: fullPath,
            fallbackFromPath: title,
            season: se?.season,
            episode: se?.episode,
          })
        },
        { maxItems }
      )
    } catch {
      stats.errors += 1
    }
  }

  const top = Array.from(stats.byAnime.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, v]) => ({ title: v.title, count: v.count }))

  return {
    dryRun,
    scanned: stats.scanned,
    accepted: stats.accepted,
    importedAnime: dryRun ? 0 : stats.importedAnime,
    importedEpisodes: dryRun ? 0 : stats.importedEpisodes,
    transcoded: dryRun ? 0 : stats.transcoded,
    skippedNotAnime: stats.skippedNotAnime,
    skippedNoEpisode: stats.skippedNoEpisode,
    skippedNoVideo: stats.skippedNoVideo,
    errors: stats.errors,
    topAnime: top,
    samples: stats.samples,
  }
}
