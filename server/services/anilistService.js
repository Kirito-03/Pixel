/**
 * anilistService.js
 * Consultas a la API de AniList (GraphQL, gratuita y sin key)
 * Usado por el Smart Bot para autocompletar metadatos de animes.
 */
import axios from 'axios';

const ANILIST_URL = 'https://graphql.anilist.co';

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/**
 * Extrae y valida un ID de YouTube de exactamente 11 caracteres seguros.
 * @param {unknown} input - ID directo o URL de YouTube
 * @returns {string|null}
 */
export function extractYouTubeId(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      return null;
    }

    let candidate = null;
    if (host === 'youtu.be') {
      candidate = parsed.pathname.split('/').filter(Boolean)[0] || null;
    } else {
      const vParam = parsed.searchParams.get('v');
      if (vParam) {
        candidate = vParam;
      } else {
        const match = parsed.pathname.match(/^\/(?:embed|shorts|v|live)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
        candidate = match ? match[1] : null;
      }
    }

    return candidate && YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Normaliza un objeto trailer de AniList o Jikan aceptando solo YouTube con ID seguro de 11 caracteres.
 * @param {object|null|undefined} trailer
 * @returns {{ trailer_id: string|null, trailer_site: 'youtube'|null }}
 */
export function normalizeTrailer(trailer) {
  if (!trailer || typeof trailer !== 'object') {
    return { trailer_id: null, trailer_site: null };
  }

  const rawSite = typeof trailer.site === 'string' ? trailer.site.trim().toLowerCase() : null;
  if (rawSite && rawSite !== 'youtube') {
    return { trailer_id: null, trailer_site: null };
  }

  const candidates = rawSite === 'youtube'
    ? [trailer.id, trailer.youtube_id, trailer.url, trailer.embed_url]
    : [trailer.youtube_id, trailer.embed_url, trailer.url];

  for (const candidate of candidates) {
    // Si no viene site explícito, solo aceptar youtube_id o URLs explícitas de YouTube
    if (!rawSite && candidate === trailer.youtube_id && typeof candidate === 'string') {
      const id = extractYouTubeId(candidate);
      if (id) return { trailer_id: id, trailer_site: 'youtube' };
      continue;
    }

    if (!rawSite && typeof candidate === 'string' && !candidate.includes('://')) {
      continue;
    }

    const id = extractYouTubeId(candidate);
    if (id) {
      return { trailer_id: id, trailer_site: 'youtube' };
    }
  }

  return { trailer_id: null, trailer_site: null };
}

const MEDIA_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    id
    title {
      romaji
      english
      native
    }
    description(asHtml: false)
    coverImage {
      extraLarge
      large
    }
    bannerImage
    genres
    averageScore
    episodes
    status
    startDate {
      year
      month
      day
    }
    trailer {
      id
      site
    }
    studios(isMain: true) {
      nodes { name }
    }
  }
}
`;

const MEDIA_QUERY_BY_MAL = `
query ($idMal: Int) {
  Media(idMal: $idMal, type: ANIME) {
    id
    title {
      romaji
      english
      native
    }
    description(asHtml: false)
    coverImage {
      extraLarge
      large
    }
    bannerImage
    genres
    averageScore
    episodes
    status
    startDate {
      year
      month
      day
    }
    trailer {
      id
      site
    }
    studios(isMain: true) {
      nodes { name }
    }
  }
}
`;

function mapAniListMedia(media, fallbackTitle) {
  const startDate = media.startDate;
  const releaseDate =
    startDate?.year
      ? `${startDate.year}-${String(startDate.month || 1).padStart(2, '0')}-${String(startDate.day || 1).padStart(2, '0')}`
      : null;

  const { trailer_id, trailer_site } = normalizeTrailer(media.trailer);

  return {
    title: media.title.romaji || media.title.english || fallbackTitle,
    title_romaji: media.title.romaji || '',
    title_english: media.title.english || media.title.romaji || '',
    title_japanese: media.title.native || '',
    description: media.description || '',
    poster_url: media.coverImage?.extraLarge || media.coverImage?.large || '',
    banner_url: media.bannerImage || '',
    genres: media.genres || [],
    rating: media.averageScore ? media.averageScore / 10 : null, // AniList usa escala 0-100
    total_episodes: media.episodes || null,
    status: mapAniListStatus(media.status),
    release_date: releaseDate,
    trailer_id,
    trailer_site,
  };
}

/**
 * Busca un anime por título en AniList y devuelve sus metadatos.
 * @param {string} title - Título del anime a buscar
 * @returns {Promise<object|null>} Metadatos del anime o null si no se encontró
 */
export async function searchAniListMetadata(title) {
  try {
    const response = await axios.post(
      ANILIST_URL,
      {
        query: MEDIA_QUERY,
        variables: { search: title },
      },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      }
    );

    const media = response.data?.data?.Media;
    if (!media) return null;

    return mapAniListMedia(media, title);
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn('[AniList] Rate limit alcanzado, esperando 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return searchAniListMetadata(title); // Reintentar
    }
    console.error(`[AniList] Error buscando por título "${title}":`, error.message);
    return null;
  }
}

/**
 * Busca un anime por MyAnimeList ID en AniList y devuelve sus metadatos.
 * @param {number} malId - ID de MyAnimeList
 * @returns {Promise<object|null>} Metadatos del anime o null
 */
export async function searchAniListByMalId(malId) {
  try {
    const response = await axios.post(
      ANILIST_URL,
      {
        query: MEDIA_QUERY_BY_MAL,
        variables: { idMal: parseInt(malId) },
      },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      }
    );

    const media = response.data?.data?.Media;
    if (!media) return null;

    return mapAniListMedia(media, `MAL Anime ${malId}`);
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn('[AniList] Rate limit alcanzado, esperando 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return searchAniListByMalId(malId); // Reintentar
    }
    console.error(`[AniList] Error buscando por MAL ID ${malId}:`, error.message);
    return null;
  }
}

/**
 * Busca un anime por título en Jikan (MyAnimeList) como Fallback.
 * @param {string} title - Título del anime a buscar
 * @returns {Promise<object|null>} Metadatos del anime o null
 */
export async function searchJikanMetadata(title) {
  try {
    // Pausa preventiva de 2 segundos obligatoria para evitar sobrecargar (HTTP 504/429) a MyAnimeList
    await new Promise(r => setTimeout(r, 2000));

    const response = await axios.get(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
      { timeout: 10000 }
    );

    const anime = response.data?.data?.[0];
    if (!anime) return null;

    let releaseDate = null;
    if (anime.aired?.from) {
      releaseDate = anime.aired.from.split('T')[0];
    }

    const { trailer_id, trailer_site } = normalizeTrailer(anime.trailer);

    return {
      title: anime.title_english || anime.title,
      title_romaji: anime.title || '',
      title_english: anime.title_english || anime.title || '',
      title_japanese: anime.title_japanese || '',
      description: anime.synopsis || '',
      poster_url: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || '',
      banner_url: '', // Jikan no da banner por default en search
      genres: anime.genres ? anime.genres.map(g => g.name) : [],
      rating: anime.score ? parseFloat(anime.score) : null, // Jikan ya usa escala 0-10
      total_episodes: anime.episodes || null,
      status: mapJikanStatus(anime.status),
      release_date: releaseDate,
      trailer_id,
      trailer_site,
    };
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn('[Jikan] Rate limit, esperando 5s...');
      await new Promise(r => setTimeout(r, 5000));
      return searchJikanMetadata(title);
    }
    console.error(`[Jikan] Error buscando fallback para "${title}":`, error.message);
    return null;
  }
}

function mapJikanStatus(status) {
  if (!status) return 'Unknown';
  const s = status.toLowerCase();
  if (s.includes('finished')) return 'Finished';
  if (s.includes('currently airing')) return 'Airing';
  if (s.includes('not yet aired')) return 'Upcoming';
  return 'Unknown';
}

function mapAniListStatus(status) {
  const map = {
    FINISHED: 'Finished',
    RELEASING: 'Airing',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Finished',
    HIATUS: 'Airing',
  };
  return map[status] || 'Unknown';
}
