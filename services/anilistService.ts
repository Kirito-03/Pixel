import { Anime, AnimeDetail } from '../types';
import { Platform } from 'react-native';
import { getCurrentBaseURL } from './databaseService';

const ANILIST_API_URL = 'https://graphql.anilist.co';

const stripHtml = (html?: string) => html ? html.replace(/<[^>]*>/g, '') : '';
const translationCache: Map<string, string> = new Map();
const translateText = async (text: string, target: string = 'es'): Promise<string> => {
  const sourceText = stripHtml(text || '').trim();
  if (!sourceText) return '';
  const cached = translationCache.get(sourceText);
  if (cached) return cached;
  const useProxy = Platform.OS === 'web';
  const url = useProxy ? `${getCurrentBaseURL()}/proxy/translate` : 'https://libretranslate.com/translate';
  const body = { q: sourceText, source: 'auto', target, format: 'text' };
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      return sourceText;
    }
    const data = await response.json();
    const translated = data?.translatedText || sourceText;
    translationCache.set(sourceText, translated);
    return translated;
  } catch {
    return sourceText;
  }
};

// Limitar tasa de peticiones para evitar 429 y añadir reintentos con backoff
const REQUEST_INTERVAL_MS = 350; // mínimo ~3 peticiones/segundo
let lastRequestTimestamp = 0;

const waitForSlot = async () => {
  const now = Date.now();
  const nextAllowed = lastRequestTimestamp + REQUEST_INTERVAL_MS;
  const delay = nextAllowed - now;
  if (delay > 0) {
    await new Promise(res => setTimeout(res, delay));
  }
  lastRequestTimestamp = Date.now();
};

// Función auxiliar para hacer consultas GraphQL
const graphqlRequest = async (query: string, variables: any = {}) => {
  const useProxy = Platform.OS === 'web';
  let url = useProxy ? `${getCurrentBaseURL()}/proxy/anilist` : ANILIST_API_URL;
  // Reintentos con backoff exponencial en caso de 429 u otros errores transitorios
  const maxAttempts = 3;
  let attempt = 0;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    attempt++;
    // Respetar intervalo mínimo entre peticiones
    await waitForSlot();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after')) || 500 * attempt; // ms
        await new Promise(res => setTimeout(res, retryAfter));
        continue; // reintentar
      }

      // Manejo robusto de errores de red
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`AniList request failed: ${response.status} ${response.statusText} ${text}`);
      }

      const data = await response.json();
      if (data?.errors) {
        throw new Error(data.errors[0]?.message || 'AniList error');
      }
      return data?.data ?? data;
    } catch (err: any) {
      lastError = err;
      if (useProxy) {
        url = ANILIST_API_URL;
      }
      // Backoff exponencial con jitter para otros errores transitorios
      const baseDelay = 400 * attempt;
      const jitter = Math.floor(Math.random() * 200);
      await new Promise(res => setTimeout(res, baseDelay + jitter));
    }
  }

  // Si agotamos intentos, propagar último error
  throw lastError || new Error('AniList request failed: unknown error');
};

// Consulta GraphQL para obtener anime populares
const POPULAR_ANIME_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC, status: FINISHED) {
        id
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          medium
        }
        bannerImage
        startDate {
          year
          month
          day
        }
        averageScore
        episodes
        status
        genres
        format
      }
    }
  }
`;

// Consulta GraphQL para obtener anime mejor puntuados
const TOP_RATED_ANIME_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: SCORE_DESC, status: FINISHED) {
        id
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          medium
        }
        bannerImage
        startDate {
          year
          month
          day
        }
        averageScore
        episodes
        status
        genres
        format
      }
    }
  }
`;

// Consulta GraphQL para anime en emisión
const AIRING_ANIME_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC, status: RELEASING) {
        id
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          medium
        }
        bannerImage
        startDate {
          year
          month
          day
        }
        averageScore
        episodes
        status
        genres
        format
      }
    }
  }
`;

// Consulta GraphQL para detalles de anime
const ANIME_DETAILS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      description
      coverImage {
        large
        medium
      }
      bannerImage
      startDate {
        year
        month
        day
      }
      averageScore
      episodes
      status
      genres
      format
      duration
      studios {
        nodes {
          name
        }
      }
      trailer {
        id
        site
      }
      characters(page: 1, perPage: 8) {
        nodes {
          id
          name {
            full
          }
          image {
            medium
          }
        }
      }
      recommendations(page: 1, perPage: 8) {
        nodes {
          mediaRecommendation {
            id
            title {
              romaji
              english
              native
            }
            description
            coverImage {
              large
              medium
            }
            bannerImage
            startDate {
              year
              month
              day
            }
            averageScore
            episodes
            status
            genres
            format
          }
        }
      }
    }
  }
`;

// Consulta GraphQL para búsqueda
const SEARCH_ANIME_QUERY = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, search: $search) {
        id
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          medium
        }
        bannerImage
        startDate {
          year
          month
          day
        }
        averageScore
        episodes
        status
        genres
        format
      }
    }
  }
`;

// Consulta GraphQL por género
const ANIME_BY_GENRE_QUERY = `
  query ($genre: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, genre: $genre, sort: POPULARITY_DESC) {
        id
        title {
          romaji
          english
          native
        }
        description
        coverImage {
          large
          medium
        }
        bannerImage
        startDate {
          year
          month
          day
        }
        averageScore
        episodes
        status
        genres
        format
      }
    }
  }
`;

// Función para convertir datos de AniList a formato unificado
const normalizeAnime = (anime: any): Anime => ({
  ...anime,
  source: 'anilist' as const,
});

// Función para convertir datos de AniList a formato detallado
const normalizeAnimeDetail = (anime: any): AnimeDetail => ({
  ...anime,
  source: 'anilist' as const,
  studios: anime.studios || { nodes: [] },
  characters: anime.characters || { nodes: [] },
  recommendations: anime.recommendations || { nodes: [] },
});

// ===== FUNCIONES EXPORTADAS =====

// Obtener anime populares
export const getPopularAnime = async (page: number = 1, perPage: number = 12): Promise<Anime[]> => {
  const data = await graphqlRequest(POPULAR_ANIME_QUERY, { page, perPage });
  const items: Anime[] = data.Page.media.map(normalizeAnime);
  await Promise.all(items.map(async a => {
    a.description = await translateText(a.description || '', 'es');
  }));
  return items;
};

// Obtener anime mejor puntuados
export const getTopRatedAnime = async (page: number = 1, perPage: number = 12): Promise<Anime[]> => {
  const data = await graphqlRequest(TOP_RATED_ANIME_QUERY, { page, perPage });
  const items: Anime[] = data.Page.media.map(normalizeAnime);
  await Promise.all(items.map(async a => {
    a.description = await translateText(a.description || '', 'es');
  }));
  return items;
};

// Obtener anime en emisión
export const getAiringAnime = async (page: number = 1, perPage: number = 12): Promise<Anime[]> => {
  const data = await graphqlRequest(AIRING_ANIME_QUERY, { page, perPage });
  const items: Anime[] = data.Page.media.map(normalizeAnime);
  await Promise.all(items.map(async a => {
    a.description = await translateText(a.description || '', 'es');
  }));
  return items;
};

// Obtener detalles de un anime
export const getAnimeDetails = async (id: number): Promise<AnimeDetail> => {
  // Cache en memoria para evitar reconsultas del mismo ID
  if (!(global as any).__aniDetailsCache) {
    (global as any).__aniDetailsCache = new Map<number, AnimeDetail>();
  }
  const cache: Map<number, AnimeDetail> = (global as any).__aniDetailsCache;
  const cached = cache.get(id);
  if (cached) return cached;

  const data = await graphqlRequest(ANIME_DETAILS_QUERY, { id });
  const normalized = normalizeAnimeDetail(data.Media);
  normalized.description = await translateText(normalized.description || '', 'es');
  cache.set(id, normalized);
  return normalized;
};

// Buscar anime
export const searchAnime = async (query: string, page: number = 1, perPage: number = 10): Promise<Anime[]> => {
  const data = await graphqlRequest(SEARCH_ANIME_QUERY, { search: query, page, perPage });
  const items: Anime[] = data.Page.media.map(normalizeAnime);
  await Promise.all(items.map(async a => {
    a.description = await translateText(a.description || '', 'es');
  }));
  return items;
};

// Obtener anime por género
export const getAnimeByGenre = async (genre: string, page: number = 1, perPage: number = 20): Promise<Anime[]> => {
  const data = await graphqlRequest(ANIME_BY_GENRE_QUERY, { genre, page, perPage });
  const items: Anime[] = data.Page.media.map(normalizeAnime);
  await Promise.all(items.map(async a => {
    a.description = await translateText(a.description || '', 'es');
  }));
  return items;
};

// Obtener anime similares (usando recomendaciones)
export const getSimilarAnime = async (animeId: number): Promise<Anime[]> => {
  const animeDetails = await getAnimeDetails(animeId);
  return animeDetails.recommendations?.nodes?.map(rec => normalizeAnime(rec.mediaRecommendation)) || [];
};

// Géneros populares de anime
export const ANIME_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
  'Mystery',
  'Psychological',
  'Mecha',
  'Music',
  'School',
  'Military',
  'Historical',
  'Seinen',
  'Shounen',
  'Shoujo',
  'Josei'
];

// Función auxiliar para construir URL de imagen de AniList
export const getAnimeImageUrl = (imageUrl: string): string => {
  return imageUrl || '';
};

// Función auxiliar para obtener título preferido
export const getAnimeTitle = (titleObj: { romaji: string; english?: string; native: string }): string => {
  return titleObj.romaji || titleObj.native || titleObj.english || '';
};

// Función auxiliar para obtener año de lanzamiento
export const getAnimeYear = (startDate: { year: number; month?: number; day?: number }): number => {
  return startDate.year;
};

// Función auxiliar para obtener puntuación normalizada
export const getAnimeScore = (averageScore: number): number => {
  return averageScore ? averageScore / 10 : 0; // AniList usa escala 0-100, normalizamos a 0-10
};
