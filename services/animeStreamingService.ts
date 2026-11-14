import { Anime, AnimeDetail, VideoSource, StreamingInfo, AnimeEpisode, AnimeSeason } from '../types';
import { getStreamingInfoFromM3U, getEpisodeSourcesFromM3U, getAvailableAnimes } from './m3uParser';
import { Platform } from 'react-native';
import { buildServerURL } from '../utils/networkUtils';

const USE_EXTERNAL_PROVIDERS = true;

// Base URLs for different providers
const CONSUMET_BASE_URL = 'https://cors.nganime.my.id/https://api.consumet.org';
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const ANILIST_BASE_URL = 'https://graphql.anilist.co';
const ANIME_API_BASE_URL = 'https://api.animeapiplatform.com';
const ANIME_API_ALT_URL = 'https://anime-api.canelacho.com';
const ANIMEFLIX_BASE_URL = 'https://api.animeflix.live';
const ANIME_API_NEW_URL = 'https://api.animeapi.xyz';
const ANIME_API_EXTRA_URL = 'https://api.animeapi.net';
const ANBUANIME_BASE_URL = 'https://anbuanime.onrender.com';

// Types imported from ../types unify streaming data across the app

// Function to make API requests with multiple providers
const makeRequest = async (endpoint: string, params?: Record<string, any>, provider: 'consumet' | 'jikan' | 'anilist' | 'animeapi' | 'animeapi-alt' | 'animeflix' | 'animeapi-new' | 'animeapi-extra' | 'anbuanime' = 'consumet') => {
  // En Web, nunca llamamos proveedores externos
  if (!USE_EXTERNAL_PROVIDERS) {
    throw new Error('External providers disabled on web');
  }

  let baseUrl: string;

  switch (provider) {
    case 'consumet':
      baseUrl = CONSUMET_BASE_URL;
      break;
    case 'jikan':
      baseUrl = JIKAN_BASE_URL;
      break;
    case 'anilist':
      baseUrl = ANILIST_BASE_URL;
      break;
    case 'animeapi':
      baseUrl = ANIME_API_BASE_URL;
      break;
    case 'animeapi-alt':
      baseUrl = ANIME_API_ALT_URL;
      break;
    case 'animeflix':
      baseUrl = ANIMEFLIX_BASE_URL;
      break;
    case 'animeapi-new':
      baseUrl = ANIME_API_NEW_URL;
      break;
    case 'animeapi-extra':
      baseUrl = ANIME_API_EXTRA_URL;
      break;
    case 'anbuanime':
      baseUrl = ANBUANIME_BASE_URL;
      break;
    default:
      baseUrl = CONSUMET_BASE_URL;
  }

  const url = new URL(`${baseUrl}${endpoint}`);

  if (params) {
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key].toString());
      }
    });
  }

  // En web, usar proxy CORS del backend
  const finalUrl = Platform.OS === 'web'
    ? buildServerURL(`/api/cors-proxy?url=${encodeURIComponent(url.toString())}`)
    : url.toString();

  const response = await fetch(finalUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
};

// Search anime with working APIs first
export const searchAnimeForStreaming = async (query: string): Promise<any[]> => {
  if (!USE_EXTERNAL_PROVIDERS) {
    // En web, no usamos proveedores externos
    return [];
  }

  try {
    const jikanData = await makeRequest('/anime', { q: query }, 'jikan');
    const jikanResults = jikanData.data || [];
    if (jikanResults.length > 0) {
      return jikanResults.map((anime: any) => ({
        id: anime.mal_id.toString(),
        title: anime.title,
        image: anime.images?.jpg?.image_url || anime.images?.webp?.image_url || '',
        description: anime.synopsis || '',
        status: anime.status || 'Unknown',
        totalEpisodes: anime.episodes || 0,
        score: anime.score || 0,
        year: anime.year || new Date().getFullYear(),
        genres: anime.genres?.map((g: any) => g.name) || []
      }));
    }
  } catch (error) { }

  try {
    const anilistQuery = `
      query {
        Page {
          media(search: "${query}", type: ANIME) {
            id
            title { romaji english }
            description
            episodes
            status
            averageScore
            startDate { year }
            genres
            coverImage { large }
          }
        }
      }
    `;
    await makeRequest('', {}, 'anilist');
    const response = await fetch(ANILIST_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: anilistQuery })
    });
    if (response.ok) {
      const data = await response.json();
      const anilistResults = data.data?.Page?.media || [];
      return anilistResults.map((anime: any) => ({
        id: anime.id.toString(),
        title: anime.title.romaji || anime.title.english,
        image: anime.coverImage?.large || '',
        description: anime.description || '',
        status: anime.status || 'Unknown',
        totalEpisodes: anime.episodes || 0,
        score: anime.averageScore || 0,
        year: anime.startDate?.year || new Date().getFullYear(),
        genres: anime.genres || []
      }));
    }
  } catch (error) { }

  // Consumet providers (solo si habilitado)
  const providers = [
    { name: 'consumet-gogoanime', endpoint: '/anime/gogoanime', params: { query } },
    { name: 'consumet-zoro', endpoint: '/anime/zoro', params: { query } },
  ];
  for (const p of providers) {
    try {
      const data = await makeRequest(p.endpoint, p.params, 'consumet');
      const results = data.results || data || [];
      if (results.length > 0) return results;
    } catch (e) { }
  }

  return [];
};

// Get anime info with episodes (prioriza M3U; en web no llama externos)
export const getAnimeStreamingInfo = async (animeId: string, animeTitle?: string): Promise<StreamingInfo | null> => {
  // Usar únicamente M3U - si no hay título del anime, no podemos buscar
  if (!animeTitle) {
    console.log('No anime title provided, cannot search M3U');
    return null;
  }

  try {
    console.log(`Searching M3U for anime: ${animeTitle}`);
    const m3uData = await getStreamingInfoFromM3U(animeTitle);
    if (m3uData && m3uData.seasons?.length) {
      console.log(`Found anime in M3U: ${animeTitle} with ${m3uData.totalEpisodes} episodes`);
      return {
        animeId: `m3u-${animeTitle}`,
        title: animeTitle,
        description: '',
        image: m3uData.image || '',
        genres: [],
        status: 'UNKNOWN',
        totalEpisodes: m3uData.totalEpisodes,
        seasons: m3uData.seasons
      };
    }
    console.log(`Anime not found in M3U: ${animeTitle}`);
    if (USE_EXTERNAL_PROVIDERS) {
      try {
        console.log(`Searching Anbuanime for: ${animeTitle}`);
        const searchData = await makeRequest('/search', { keyw: animeTitle }, 'anbuanime');
        const results = Array.isArray(searchData) ? searchData : (searchData?.results || []);
        if (!results || results.length === 0) {
          console.log('No results from Anbuanime search');
          return null;
        }
        const bestMatch = results.find((r: any) => (r.animeTitle || '').toLowerCase() === animeTitle.toLowerCase()) || results[0];
        const extId = bestMatch.animeId || bestMatch.id || bestMatch.slug;
        if (!extId) {
          console.log('Missing animeId in Anbuanime result');
          return null;
        }
        const detailsData = await makeRequest(`/anime-details/${encodeURIComponent(extId)}`, undefined, 'anbuanime');
        if (!detailsData) {
          console.log('No details from Anbuanime');
          return null;
        }
        const episodesList = detailsData.episodesList || detailsData.episodes || [];
        const episodes: AnimeEpisode[] = (episodesList || []).map((ep: any) => ({
          id: ep.episodeId || ep.id,
          number: parseInt(ep.episodeNum || ep.number || '0', 10),
          title: `Episode ${ep.episodeNum || ep.number}`,
          url: ep.episodeUrl || ep.url,
          sources: []
        })).filter((e: AnimeEpisode) => !!e.id);
        const season: AnimeSeason = {
          id: 'season-1',
          title: 'Season 1',
          season: 1,
          episodes
        };
        const info: StreamingInfo = {
          animeId: `anbuanime-${extId}`,
          title: detailsData.animeTitle || animeTitle,
          description: detailsData.synopsis || '',
          image: detailsData.animeImg || '',
          genres: detailsData.genres || [],
          status: detailsData.status || 'UNKNOWN',
          totalEpisodes: parseInt(detailsData.episodesAvaliable || episodes.length || '0', 10) || episodes.length,
          seasons: [season]
        };
        console.log(`Found Anbuanime data: ${info.totalEpisodes} episodes`);
        return info;
      } catch (e) {
        console.error('Error fetching Anbuanime data:', e);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error('Error loading M3U data:', error);
    return null;
  }
};

// Get episode sources (video URLs) - únicamente M3U, simplificado
export const getEpisodeSources = async (episodeId: string, animeTitle?: string, season?: number, episodeNumber?: number): Promise<VideoSource[]> => {
  try {
    if (animeTitle && season && episodeNumber) {
      console.log(`Searching M3U for episode: ${animeTitle} S${season}E${episodeNumber}`);
      const m3uSources = await getEpisodeSourcesFromM3U(animeTitle, season, episodeNumber);
      if (m3uSources?.length) {
        console.log(`Found video URL: ${m3uSources[0].url}`);
        const url = m3uSources[0].url;
        const isMkv = /\.mkv(\?|$)/i.test(url);
        if (isMkv) {
          try {
            const resp = await fetch(buildServerURL('/transcode/hls'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ src: url }).toString(),
            });
            const data = await resp.json().catch(() => null);
            const streamUrl = data?.stream_url || '';
            if (streamUrl) {
              console.log(`Using HLS stream from R2: ${streamUrl}`);
              return [{ url: streamUrl, isM3U8: true }];
            }
          } catch (e) {
            console.error('Error requesting HLS transcode:', e);
          }
          // If HLS not ready, try external providers before falling back
          // On web, avoid returning MKV direct (not supported)
          if (Platform.OS !== 'web') {
            return [{ url }];
          }
          // Fall-through to try external providers below
        } else {
          // Non-MKV source from M3U is likely playable
          return [{ url }];
        }
      }
      console.log(`No sources found in M3U for: ${animeTitle} S${season}E${episodeNumber}`);
    }

    if (USE_EXTERNAL_PROVIDERS && episodeId) {
      console.log(`Fetching sources from Anbuanime for episode: ${episodeId}`);
      const endpoints = [`/vidcdn/watch/${encodeURIComponent(episodeId)}`, `/streamsb/watch/${encodeURIComponent(episodeId)}`];
      for (const ep of endpoints) {
        try {
          const data = await makeRequest(ep, undefined, 'anbuanime');
          const rawSources = data?.sources || data?.stream || data?.result || [];
          const mapped: VideoSource[] = (rawSources || []).map((s: any) => ({
            url: s.file || s.url || s.source || '',
            quality: s.label || s.quality || 'unknown',
            isM3U8: !!(s.type === 'hls' || (s.file || s.url || '').includes('.m3u8'))
          })).filter((s: VideoSource) => !!s.url);
          if (mapped.length) {
            console.log(`Found ${mapped.length} sources from ${ep.includes('vidcdn') ? 'VIDCDN' : 'StreamSB'}`);
            return mapped;
          }
        } catch (e) {
          console.log(`Provider failed for ${ep}:`, (e as any)?.message || e);
          continue;
        }
      }
      console.log('No external sources found');
    }
    return [];
  } catch (error) {
    console.error('Error loading episode sources:', error);
    return [];
  }
};

// Get recent / popular / trending (deshabilitado - usar únicamente M3U)
export const getRecentEpisodes = async (page: number = 1): Promise<any[]> => {
  console.log('getRecentEpisodes disabled - using M3U only');
  return [];
};
export const getPopularAnimeStreaming = async (page: number = 1): Promise<any[]> => {
  console.log('getPopularAnimeStreaming disabled - using M3U only');
  return [];
};
export const getTrendingAnimeStreaming = async (page: number = 1): Promise<any[]> => {
  console.log('getTrendingAnimeStreaming disabled - using M3U only');
  return [];
};
export const getAnimeByGenreStreaming = async (genre: string, page: number = 1): Promise<any[]> => {
  console.log('getAnimeByGenreStreaming disabled - using M3U only');
  return [];
};

// Funciones que usan únicamente M3U
export const getM3UAnimes = async (): Promise<any[]> => {
  try {
    console.log('Getting animes from M3U file...');
    const animes = await getAvailableAnimes();
    console.log(`Found ${animes.length} animes in M3U`);
    return animes.map(anime => ({
      id: `m3u-${anime.title}`,
      title: anime.title,
      image: anime.image,
      episodeCount: anime.episodeCount,
      type: 'anime'
    }));
  } catch (error) {
    console.error('Error getting M3U animes:', error);
    return [];
  }
};

// Convert streaming anime to our Anime type
export const convertStreamingToAnime = (streamingAnime: any): Anime => {
  return {
    id: parseInt(streamingAnime.id) || 0,
    title: {
      romaji: streamingAnime.title,
      english: streamingAnime.title,
      native: streamingAnime.title
    },
    description: streamingAnime.description || '',
    coverImage: {
      large: streamingAnime.image || '',
      medium: streamingAnime.image || ''
    },
    bannerImage: streamingAnime.image,
    startDate: {
      year: new Date().getFullYear() // Default year since streaming APIs don't always provide this
    },
    averageScore: 0,
    episodes: streamingAnime.totalEpisodes,
    status: streamingAnime.status || 'UNKNOWN',
    genres: streamingAnime.genres || [],
    format: 'TV',
    source: 'anilist' as const
  };
};

// Helper function to get the best quality source
export const getBestQualitySource = (sources: VideoSource[]): VideoSource | null => {
  if (!sources || sources.length === 0) return null;

  // Sort by quality preference (1080p > 720p > 480p > 360p)
  const qualityOrder = ['1080p', '720p', '480p', '360p', 'unknown'];

  return sources.sort((a, b) => {
    const aQuality = a.quality || 'unknown';
    const bQuality = b.quality || 'unknown';
    const aIndex = qualityOrder.indexOf(aQuality);
    const bIndex = qualityOrder.indexOf(bQuality);
    return aIndex - bIndex;
  })[0];
};

// Helper function to check if source is HLS (m3u8)
export const isHLSSource = (source: VideoSource): boolean => {
  return !!source.isM3U8 || source.url.includes('.m3u8');
};

// Helper function to get direct video URL (non-HLS)
export const getDirectVideoSource = (sources: VideoSource[]): VideoSource | null => {
  return sources.find(source => !isHLSSource(source)) || null;
};

// Fallback function to create mock streaming data for testing
export const createMockStreamingInfo = (animeTitle: string, realEpisodeCount?: number): StreamingInfo => {
  console.log('Creating mock streaming info for:', animeTitle);

  // Usar el conteo real de episodios si está disponible, sino crear un número razonable
  const episodeCount = realEpisodeCount || Math.floor(Math.random() * 12) + 12; // Entre 12 y 24 episodios

  const mockEpisodes: AnimeEpisode[] = Array.from({ length: episodeCount }, (_, i) => ({
    id: `mock-ep-${i + 1}`,
    number: i + 1,
    title: `Episode ${i + 1}: ${animeTitle}`,
    description: `This is episode ${i + 1} of ${animeTitle}. Follow the adventures of our heroes as they face new challenges and discover the mysteries of their world.`,
    image: '',
    url: `https://example.com/episode-${i + 1}`
  }));

  const mockStreamingInfo: StreamingInfo = {
    animeId: 'mock-anime-id',
    title: animeTitle,
    description: `Mock streaming data for ${animeTitle}. This anime follows the story of our protagonists as they embark on an epic journey filled with adventure, friendship, and discovery.`,
    image: '',
    genres: ['Action', 'Adventure', 'Fantasy'],
    status: 'Completed',
    totalEpisodes: episodeCount,
    seasons: [{
      id: 'mock-season-1',
      title: 'Season 1',
      season: 1,
      episodes: mockEpisodes
    }]
  };

  console.log('Created mock streaming info with', episodeCount, 'episodes:', mockStreamingInfo);
  return mockStreamingInfo;
};

// Enhanced search function with fallback
export const searchAnimeForStreamingWithFallback = async (query: string): Promise<any[]> => {
  try {
    // First try the extensive Consumet search
    const consumetResults = await searchAnimeForStreaming(query);
    if (consumetResults.length > 0) {
      return consumetResults;
    }

    // Try alternative APIs
    const alternativeAPIs = [
      { name: 'AnimeFlix', endpoint: '/search', params: { q: query }, provider: 'animeflix' },
      { name: 'AnimeAPI New', endpoint: '/anime/search', params: { query }, provider: 'animeapi-new' },
      { name: 'AnimeAPI Extra', endpoint: '/search', params: { q: query }, provider: 'animeapi-extra' },
      { name: 'AnimeAPI Platform', endpoint: '/anime', params: { search: query }, provider: 'animeapi' },
    ];
    console.log(`Trying ${alternativeAPIs.length} alternative APIs...`);

    for (const api of alternativeAPIs) {
      try {
        console.log(`Trying ${api.name}...`);
        const data = await makeRequest(api.endpoint, api.params, api.provider as any);
        const results = data.results || data.data || data || [];

        if (results.length > 0) {
          console.log(`Found ${results.length} results with ${api.name}`);
          return results;
        }
      } catch (error: unknown) {
        console.log(`${api.name} failed:`, (error as any)?.message || error);
        continue;
      }
    }

    // If no results, create a mock result for testing
    console.log('No results found, creating mock result for testing');
    return [{
      id: 'mock-anime-id',
      title: query,
      image: '',
      description: `Mock anime: ${query}`,
      status: 'Completed',
      totalEpisodes: 12
    }];
  } catch (error) {
    console.error('Error in search with fallback:', error);
    // Return mock data as fallback
    return [{
      id: 'mock-anime-id',
      title: query,
      image: '',
      description: `Mock anime: ${query}`,
      status: 'Completed',
      totalEpisodes: 12
    }];
  }
};
