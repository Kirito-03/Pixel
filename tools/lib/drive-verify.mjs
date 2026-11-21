export const BASE_STREAM_URL = 'https://pixelnosekai.com/api/stream';
export const MIN_VIDEO_BYTES = 102_400;
export const MIN_TRAILER_BYTES = 10_240;
export const MIN_IMAGE_BYTES = 500;
export const VIP_SERVER_NAME = 'Pixel VIP (Drive)';

const ANIME_EP_RE = /^Anime\/(\d+)\/(\d+)\/episode\.mp4$/;
const ANIME_THUMB_RE = /^Anime\/(\d+)\/(\d+)\/thumb\.jpg$/;
const ANIME_TRAILER_RE = /^Anime\/(\d+)\/trailer\.mp4$/;
const HENTAI_EP_RE = /^Hentai\/(\d+)\/(\d+)\/episode\.mp4$/;
const MANGA_PAGE_RE = /^Manga\/([^/]+)\/chapters\/([^/]+)\/(\d+)\.(?:jpe?g|png|webp|avif|gif)$/i;

/** Extract relative Drive path (within PixelNoSekai/) from a stream URL or path. */
export function extractDriveRelPath(urlOrPath) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';

  let rel = '';
  if (raw.includes('/api/stream/')) {
    rel = raw.split('/api/stream/')[1] || '';
  } else if (/^https?:\/\//i.test(raw)) {
    try {
      rel = new URL(raw).pathname;
    } catch {
      rel = raw;
    }
  } else {
    rel = raw;
  }

  rel = rel.split('?')[0].split('#')[0].replace(/^\/+/, '');
  return rel
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
}

/** Parse { mangaId, chapterSlug } from DragonTranslation chapter URL, matching pixel-drive-manga.mjs. */
export function parseMangaChapterUrl(urlStr) {
  try {
    const u = new URL(String(urlStr || '').trim());
    const parts = u.pathname.replace(/^\/manga\//, '').replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { mangaId: parts[0], chapterSlug: parts[1] };
  } catch {
    return null;
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function chapterKeysFromUrl(urlStr, fallbackMangaId) {
  const parsed = parseMangaChapterUrl(urlStr);
  if (!parsed) return [];
  const keys = new Set();
  keys.add(`${parsed.mangaId}\0${parsed.chapterSlug}`);
  keys.add(`${safeDecode(parsed.mangaId)}\0${safeDecode(parsed.chapterSlug)}`);
  if (fallbackMangaId) {
    keys.add(`${fallbackMangaId}\0${parsed.chapterSlug}`);
    keys.add(`${fallbackMangaId}\0${safeDecode(parsed.chapterSlug)}`);
  }
  return Array.from(keys);
}

/** Build a relativePath -> byteSize map from `rclone lsjson -R --files-only` output. */
export function buildInventoryMap(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('Inventario remoto inválido: se esperaba un arreglo JSON.');
  }
  const map = new Map();
  for (const entry of entries) {
    if (!entry || entry.IsDir) continue;
    const rel = String(entry.Path || entry.Name || '').replace(/^\/+/, '');
    if (!rel) continue;
    map.set(rel, Number(entry.Size) || 0);
  }
  return map;
}

function normalizeServerList(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function findDriveServerUrl(rawServers) {
  const list = normalizeServerList(rawServers);
  const entry = list.find(
    (s) => s && (s.server === VIP_SERVER_NAME || String(s.url || '').includes('/api/stream/'))
  );
  return entry?.url || '';
}

export function upsertVipServer(rawServers, streamUrl) {
  const list = normalizeServerList(rawServers);
  const filtered = list.filter(
    (s) => s && s.server !== VIP_SERVER_NAME && !String(s.url || '').includes('/api/stream/')
  );
  return [{ server: VIP_SERVER_NAME, url: streamUrl }, ...filtered];
}

export function stripDriveServers(rawServers) {
  const list = normalizeServerList(rawServers);
  return list.filter(
    (s) => s && s.server !== VIP_SERVER_NAME && !String(s.url || '').includes('/api/stream/')
  );
}

function hasVipServerWithUrl(rawServers, expectedUrl) {
  const list = normalizeServerList(rawServers);
  return list.some((s) => s && s.server === VIP_SERVER_NAME && s.url === expectedUrl);
}

/**
 * Pure verification against an authoritative Drive inventory Map<relPath, bytes>.
 * Never misinterprets transient network failures because inventory must already be fetched.
 */
export function verifyAgainstInventory(
  inventoryMap,
  {
    animeEpisodes = [],
    animeTrailers = [],
    hentaiEpisodes = [],
    mangaChapters = [],
  } = {}
) {
  let checked = 0;
  let ok = 0;
  const brokenAnimeEpisodes = [];
  const brokenAnimeThumbs = [];
  const brokenTrailers = [];
  const brokenHentaiEpisodes = [];
  const brokenMangaChapters = [];

  for (const ep of animeEpisodes) {
    const hasDriveStream =
      String(ep.stream_url || '').includes('/api/stream/') || ep.storage_type === 'gdrive';
    if (hasDriveStream) {
      checked++;
      const rel =
        extractDriveRelPath(ep.stream_url) ||
        `Anime/${ep.anime_id}/${ep.episode_number}/episode.mp4`;
      const size = inventoryMap.get(rel) || 0;
      if (size > MIN_VIDEO_BYTES) {
        ok++;
      } else {
        brokenAnimeEpisodes.push({
          id: ep.id,
          anime_id: ep.anime_id,
          episode_number: ep.episode_number,
          relPath: rel,
          size,
          hasExternalVideo: Boolean(String(ep.video_url || '').trim()),
          cleanedServers: stripDriveServers(ep.external_servers),
        });
      }
    }

    if (String(ep.thumbnail_url || '').includes('/api/stream/')) {
      const thumbRel = extractDriveRelPath(ep.thumbnail_url);
      const thumbSize = inventoryMap.get(thumbRel) || 0;
      if (thumbSize <= MIN_IMAGE_BYTES) {
        brokenAnimeThumbs.push({
          id: ep.id,
          relPath: thumbRel,
          size: thumbSize,
        });
      }
    }
  }

  for (const anime of animeTrailers) {
    checked++;
    const rel = `Anime/${anime.id}/trailer.mp4`;
    const size = inventoryMap.get(rel) || 0;
    if (size > MIN_TRAILER_BYTES) {
      ok++;
    } else {
      brokenTrailers.push({
        id: anime.id,
        relPath: rel,
        size,
        hasYouTubeId: Boolean(String(anime.trailer_id || '').trim()),
      });
    }
  }

  for (const ep of hentaiEpisodes) {
    checked++;
    const serverUrl = findDriveServerUrl(ep.video_servers);
    const rel =
      extractDriveRelPath(serverUrl) ||
      `Hentai/${ep.hentai_id}/${ep.episode_number}/episode.mp4`;
    const size = inventoryMap.get(rel) || 0;
    if (size > MIN_VIDEO_BYTES) {
      ok++;
    } else {
      brokenHentaiEpisodes.push({
        id: ep.id,
        hentai_id: ep.hentai_id,
        episode_number: ep.episode_number,
        relPath: rel,
        size,
        cleanedServers: stripDriveServers(ep.video_servers),
      });
    }
  }

  for (const ch of mangaChapters) {
    const pages = Array.isArray(ch.pages) ? ch.pages : [];
    const drivePages = pages.filter((p) => String(p || '').includes('/api/stream/'));
    if (drivePages.length === 0) continue;
    checked++;
    let missingPage = null;
    for (const p of drivePages) {
      const rel = extractDriveRelPath(p);
      const size = inventoryMap.get(rel) || 0;
      if (size <= MIN_IMAGE_BYTES) {
        missingPage = { relPath: rel, size };
        break;
      }
    }
    if (!missingPage) {
      ok++;
    } else {
      brokenMangaChapters.push({
        chapter_url: ch.chapter_url,
        relPath: missingPage.relPath,
        size: missingPage.size,
      });
    }
  }

  const brokenCount =
    brokenAnimeEpisodes.length +
    brokenTrailers.length +
    brokenHentaiEpisodes.length +
    brokenMangaChapters.length;

  return {
    stats: { checked, ok, brokenCount },
    brokenAnimeEpisodes,
    brokenAnimeThumbs,
    brokenTrailers,
    brokenHentaiEpisodes,
    brokenMangaChapters,
  };
}

/** Prevent catastrophic mass DB wipe if Drive returns an empty or totally unmatched listing. */
export function canSafelyApplyRepair({
  dbLinkedCount,
  inventorySize,
  verifiedOkCount,
  brokenCount,
  forceWipe = false,
}) {
  if (forceWipe || dbLinkedCount === 0) {
    return { safe: true };
  }
  if (inventorySize === 0) {
    return {
      safe: false,
      reason:
        'Inventario remoto de Drive vacío con enlaces activos en BD; abortando --repair para no perder datos.',
    };
  }
  if (dbLinkedCount >= 5 && verifiedOkCount === 0 && brokenCount >= dbLinkedCount) {
    return {
      safe: false,
      reason: `Todos los enlaces verificados (${brokenCount}/${dbLinkedCount}) fallaron al mismo tiempo; abortando --repair masivo por seguridad (usa --force si es intencional).`,
    };
  }
  return { safe: true };
}

/**
 * Reconstruct DB update operations from files currently stored in Google Drive.
 */
export function buildRestorePlan(
  inventoryMap,
  {
    animeEpisodes = [],
    animeContent = [],
    hentaiEpisodes = [],
    mangaChaptersCache = [],
    existingMangaPageCache = new Map(),
    baseStreamUrl = BASE_STREAM_URL,
  } = {}
) {
  const driveVideos = new Map();
  const driveThumbs = new Map();
  const driveTrailers = new Map();
  const driveHentai = new Map();
  const driveMangaBuckets = new Map();

  for (const [relPath, size] of inventoryMap.entries()) {
    let m;
    if ((m = relPath.match(ANIME_EP_RE))) {
      if (size > MIN_VIDEO_BYTES) {
        driveVideos.set(`${m[1]}:${m[2]}`, { animeId: Number(m[1]), epNum: Number(m[2]), size });
      }
      continue;
    }
    if ((m = relPath.match(ANIME_THUMB_RE))) {
      if (size > MIN_IMAGE_BYTES) {
        driveThumbs.set(`${m[1]}:${m[2]}`, { animeId: Number(m[1]), epNum: Number(m[2]), size });
      }
      continue;
    }
    if ((m = relPath.match(ANIME_TRAILER_RE))) {
      if (size > MIN_TRAILER_BYTES) {
        driveTrailers.set(Number(m[1]), size);
      }
      continue;
    }
    if ((m = relPath.match(HENTAI_EP_RE))) {
      if (size > MIN_VIDEO_BYTES) {
        driveHentai.set(`${m[1]}:${m[2]}`, { hentaiId: Number(m[1]), epNum: Number(m[2]), size });
      }
      continue;
    }
    if ((m = relPath.match(MANGA_PAGE_RE))) {
      if (size > MIN_IMAGE_BYTES) {
        const key = `${m[1]}\0${m[2]}`;
        let list = driveMangaBuckets.get(key);
        if (!list) {
          list = [];
          driveMangaBuckets.set(key, list);
        }
        list.push({
          mangaId: m[1],
          chapterSlug: m[2],
          pageNum: Number(m[3]),
          filename: relPath.split('/').at(-1),
          size,
        });
      }
    }
  }

  const restoreAnimeEpisodes = [];
  for (const ep of animeEpisodes) {
    const key = `${ep.anime_id}:${ep.episode_number}`;
    const video = driveVideos.get(key);
    const thumb = driveThumbs.get(key);
    if (!video && !thumb) continue;

    const streamUrl = `${baseStreamUrl}/Anime/${ep.anime_id}/${ep.episode_number}/episode.mp4`;
    const thumbUrl = `${baseStreamUrl}/Anime/${ep.anime_id}/${ep.episode_number}/thumb.jpg`;

    const needsVideoRestore =
      Boolean(video) &&
      (ep.stream_url !== streamUrl ||
        ep.storage_type !== 'gdrive' ||
        Number(ep.file_size || 0) !== video.size ||
        !hasVipServerWithUrl(ep.external_servers, streamUrl));

    const needsThumbRestore = Boolean(thumb) && !String(ep.thumbnail_url || '').trim();

    if (needsVideoRestore || needsThumbRestore) {
      restoreAnimeEpisodes.push({
        id: ep.id,
        anime_id: ep.anime_id,
        episode_number: ep.episode_number,
        streamUrl: video ? streamUrl : ep.stream_url || null,
        storageType: video ? 'gdrive' : ep.storage_type,
        fileSize: video ? video.size : ep.file_size,
        externalServers: video
          ? upsertVipServer(ep.external_servers, streamUrl)
          : normalizeServerList(ep.external_servers),
        thumbnailUrl: needsThumbRestore ? thumbUrl : ep.thumbnail_url || null,
        restoredVideo: needsVideoRestore,
        restoredThumb: needsThumbRestore,
      });
    }
  }

  const restoreTrailers = [];
  for (const anime of animeContent) {
    if (
      driveTrailers.has(Number(anime.id)) &&
      String(anime.trailer_site || '').toLowerCase() !== 'gdrive'
    ) {
      restoreTrailers.push({ id: Number(anime.id), size: driveTrailers.get(Number(anime.id)) });
    }
  }

  const restoreHentaiEpisodes = [];
  for (const ep of hentaiEpisodes) {
    const match = driveHentai.get(`${ep.hentai_id}:${ep.episode_number}`);
    if (!match) continue;
    const streamUrl = `${baseStreamUrl}/Hentai/${ep.hentai_id}/${ep.episode_number}/episode.mp4`;
    if (!hasVipServerWithUrl(ep.video_servers, streamUrl)) {
      restoreHentaiEpisodes.push({
        id: ep.id,
        hentai_id: ep.hentai_id,
        episode_number: ep.episode_number,
        videoServers: upsertVipServer(ep.video_servers, streamUrl),
      });
    }
  }

  const chapterByKey = new Map();
  for (const row of mangaChaptersCache) {
    if (!row?.external_url) continue;
    for (const k of chapterKeysFromUrl(row.external_url, row.manga_id)) {
      if (!chapterByKey.has(k)) chapterByKey.set(k, row);
    }
  }

  const restoreMangaChapters = [];
  const skippedIncompleteManga = [];

  for (const [key, rawFiles] of driveMangaBuckets.entries()) {
    const sorted = [...rawFiles].sort((a, b) => a.pageNum - b.pageNum);
    const deduped = [];
    for (const item of sorted) {
      if (deduped.length > 0 && deduped[deduped.length - 1].pageNum === item.pageNum) {
        if (item.size > deduped[deduped.length - 1].size) {
          deduped[deduped.length - 1] = item;
        }
      } else {
        deduped.push(item);
      }
    }

    const contiguous =
      deduped.length > 0 && deduped.every((f, index) => f.pageNum === index + 1);
    if (!contiguous) {
      skippedIncompleteManga.push({
        key,
        reason: 'missing-or-noncontiguous-pages',
        foundCount: deduped.length,
      });
      continue;
    }

    const row = chapterByKey.get(key);
    if (!row?.external_url) {
      skippedIncompleteManga.push({
        key,
        reason: 'no-db-chapter-match',
        foundCount: deduped.length,
      });
      continue;
    }

    const expectedPages = Number(row.pages);
    if (Number.isInteger(expectedPages) && expectedPages > 0 && deduped.length < expectedPages) {
      skippedIncompleteManga.push({
        key,
        chapter_url: row.external_url,
        reason: `incomplete-count (${deduped.length}/${expectedPages})`,
        foundCount: deduped.length,
      });
      continue;
    }

    const sample = deduped[0];
    const pageUrls = deduped.map(
      (f) => `${baseStreamUrl}/Manga/${sample.mangaId}/chapters/${sample.chapterSlug}/${f.filename}`
    );

    const existingPages = existingMangaPageCache.get(row.external_url);
    const alreadyMatchesDrive =
      Array.isArray(existingPages) &&
      existingPages.length === pageUrls.length &&
      existingPages.every((u, i) => u === pageUrls[i]);

    if (!alreadyMatchesDrive) {
      restoreMangaChapters.push({
        chapter_url: row.external_url,
        manga_id: row.manga_id,
        pages: pageUrls,
      });
    }
  }

  return {
    driveInventorySummary: {
      videos: driveVideos.size,
      thumbs: driveThumbs.size,
      trailers: driveTrailers.size,
      hentai: driveHentai.size,
      mangaFolders: driveMangaBuckets.size,
    },
    restoreAnimeEpisodes,
    restoreTrailers,
    restoreHentaiEpisodes,
    restoreMangaChapters,
    skippedIncompleteManga,
  };
}
