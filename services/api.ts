import axios from 'axios';
import { setupCache } from 'axios-cache-interceptor';
import { Movie, MovieDetail, TVShow, TVShowDetail, Anime, AnimeDetail, ContentItem } from '../types';
import * as AniListService from './anilistService';

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY as string;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: API_KEY,
    language: 'es-ES',
  },
});

const api = setupCache(axiosInstance, {
  ttl: 1000 * 60 * 15, // 15 minutos de caché para TMDB
});

// ===== PELÍCULAS =====

// Obtener películas populares
export const getPopularMovies = async (page: number = 1): Promise<Movie[]> => {
  const { data } = await api.get('/movie/popular', { params: { page } });
  return data.results;
};

// Obtener películas mejor valoradas
export const getTopRatedMovies = async (page: number = 1): Promise<Movie[]> => {
  const { data } = await api.get('/movie/top_rated', { params: { page } });
  return data.results;
};

// Obtener películas en cartelera
export const getNowPlayingMovies = async (page: number = 1): Promise<Movie[]> => {
  const { data } = await api.get('/movie/now_playing', { params: { page } });
  return data.results;
};

// Obtener próximos estrenos
export const getUpcomingMovies = async (page: number = 1): Promise<Movie[]> => {
  const { data } = await api.get('/movie/upcoming', { params: { page } });
  return data.results;
};

// Obtener películas por género
export const getMoviesByGenre = async (genreId: number): Promise<Movie[]> => {
  const { data } = await api.get('/discover/movie', {
    params: { with_genres: genreId },
  });
  return data.results;
};

// Obtener detalles de una película (incluye trailer y clasificación)
export const getMovieDetails = async (id: number): Promise<MovieDetail> => {
  try {
    const { data } = await api.get(`/movie/${id}`, {
      params: { append_to_response: 'videos,release_dates' },
    });
    return data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(`⚠️ TMDB Movie ${id} not found (404) - item may be invalid or removed`);
      throw new Error(`TMDB_404: Movie ${id} not found`);
    }
    throw error;
  }
};

// Obtener películas similares
export const getSimilarMovies = async (movieId: number): Promise<Movie[]> => {
  const { data } = await api.get(`/movie/${movieId}/similar`);
  return data.results.slice(0, 20);
};

// Obtener recomendaciones de películas
export const getRecommendedMovies = async (movieId: number): Promise<Movie[]> => {
  const { data } = await api.get(`/movie/${movieId}/recommendations`);
  return data.results.slice(0, 20);
};

// ===== SERIES =====

// Obtener series populares
export const getPopularTVShows = async (page: number = 1): Promise<TVShow[]> => {
  const { data } = await api.get('/tv/popular', { params: { page } });
  return data.results;
};

// Obtener series mejor valoradas
export const getTopRatedTVShows = async (page: number = 1): Promise<TVShow[]> => {
  const { data } = await api.get('/tv/top_rated', { params: { page } });
  return data.results;
};

// Obtener series en emisión
export const getOnTheAirTVShows = async (page: number = 1): Promise<TVShow[]> => {
  const { data } = await api.get('/tv/on_the_air', { params: { page } });
  return data.results;
};

// Obtener series que se emiten hoy
export const getAiringTodayTVShows = async (page: number = 1): Promise<TVShow[]> => {
  const { data } = await api.get('/tv/airing_today', { params: { page } });
  return data.results;
};

// Obtener series por género
export const getTVShowsByGenre = async (genreId: number): Promise<TVShow[]> => {
  const { data } = await api.get('/discover/tv', {
    params: { with_genres: genreId },
  });
  return data.results;
};

// Obtener detalles de una serie
export const getTVShowDetails = async (id: number): Promise<TVShowDetail> => {
  try {
    const { data } = await api.get(`/tv/${id}`, {
      params: { append_to_response: 'videos' },
    });
    return data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(`⚠️ TMDB TV Show ${id} not found (404) - item may be invalid or removed`);
      throw new Error(`TMDB_404: TV Show ${id} not found`);
    }
    throw error;
  }
};

// Obtener series similares
export const getSimilarTVShows = async (tvId: number): Promise<TVShow[]> => {
  const { data } = await api.get(`/tv/${tvId}/similar`);
  return data.results.slice(0, 20);
};

// Obtener recomendaciones de series
export const getRecommendedTVShows = async (tvId: number): Promise<TVShow[]> => {
  const { data } = await api.get(`/tv/${tvId}/recommendations`);
  return data.results.slice(0, 20);
};

// ===== BÚSQUEDA =====

// Buscar películas
export const searchMovies = async (query: string): Promise<Movie[]> => {
  const { data } = await api.get('/search/movie', {
    params: { query },
  });
  return data.results;
};

// Buscar series
export const searchTVShows = async (query: string): Promise<TVShow[]> => {
  const { data } = await api.get('/search/tv', {
    params: { query },
  });
  return data.results;
};

// ===== UTILIDADES =====

// Construir URL de imagen
export const getImageUrl = (path: string, size: 'w500' | 'original' = 'w500') => {
  return path ? `${IMAGE_BASE}/${size}${path}` : '';
};

// Obtener URL del trailer de YouTube
export const getTrailerUrl = (item: MovieDetail | TVShowDetail): string | null => {
  const trailer = item.videos.results.find(
    (video) => video.type === 'Trailer' && video.site === 'YouTube'
  );
  return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
};

// IDs de géneros populares
export const GENRES = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCIENCE_FICTION: 878,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
};

// ===== FUNCIONES DE INTEGRACIÓN (TMDB + ANILIST) =====

// Función para convertir Movie/TVShow a ContentItem
export const tmdbToContentItem = (item: Movie | TVShow, type: 'movie' | 'tv'): ContentItem => {
  const title = 'title' in item ? item.title : item.name;
  const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
  
  return {
    id: item.id,
    type,
    title,
    overview: item.overview,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    release_date: releaseDate,
    vote_average: item.vote_average,
    source: 'tmdb',
  };
};

// Función para convertir Anime a ContentItem
export const animeToContentItem = (anime: Anime): ContentItem => {
  // Tolerancia a nulos en AniList: algunos campos pueden venir vacíos
  const title = AniListService.getAnimeTitle(anime.title) || 'Sin título';
  const poster = anime?.coverImage?.large || anime?.coverImage?.medium || '';
  const backdrop = anime?.bannerImage || poster;
  const releaseYear = anime?.startDate?.year ?? null;
  // Detectar contenido adulto según géneros de AniList
  const genres = Array.isArray(anime?.genres) ? anime.genres : [];
  const genreMap: Record<string, string> = {
    'Action': 'Acción',
    'Adventure': 'Aventura',
    'Comedy': 'Comedia',
    'Drama': 'Drama',
    'Fantasy': 'Fantasía',
    'Horror': 'Terror',
    'Romance': 'Romance',
    'Sci-Fi': 'Ciencia ficción',
    'Slice of Life': 'Costumbrista',
    'Sports': 'Deportes',
    'Supernatural': 'Sobrenatural',
    'Thriller': 'Thriller',
    'Mystery': 'Misterio',
    'Psychological': 'Psicológico',
    'Mecha': 'Mecha',
    'Music': 'Música',
    'School': 'Escolar',
    'Military': 'Militar',
    'Historical': 'Histórico',
    'Seinen': 'Seinen',
    'Shounen': 'Shōnen',
    'Shoujo': 'Shōjo',
    'Josei': 'Josei'
  };
  const spanishGenres = genres.map(g => genreMap[g] || g);
  const normalizedGenres = spanishGenres.map(g => (g || '').toString().toLowerCase());
  const isAdult = normalizedGenres.includes('hentai') || normalizedGenres.includes('ecchi');

  return {
    id: anime.id,
    type: 'anime',
    title,
    overview: anime?.description || '',
    poster_path: poster,
    backdrop_path: backdrop,
    release_date: releaseYear ? String(releaseYear) : '',
    vote_average: AniListService.getAnimeScore(anime?.averageScore),
    source: 'anilist',
    genres: spanishGenres,
    isAdult,
  };
};

// Obtener contenido popular combinado (películas, series y anime)
export const getAllPopularContent = async (page: number = 1): Promise<ContentItem[]> => {
  try {
    const anime = await AniListService.getPopularAnime(page);
    const animeItems = anime.map(animeToContentItem);
    return animeItems;
  } catch (error) {
    console.error('Error fetching all popular content:', error);
    return [];
  }
};

// Obtener contenido mejor valorado combinado
export const getAllTopRatedContent = async (page: number = 1): Promise<ContentItem[]> => {
  try {
    const anime = await AniListService.getTopRatedAnime(page);
    const animeItems = anime.map(animeToContentItem);
    return animeItems;
  } catch (error) {
    console.error('Error fetching all top rated content:', error);
    return [];
  }
};

// Búsqueda unificada en todas las APIs
export const searchAllContent = async (query: string): Promise<ContentItem[]> => {
  const normalizedQuery = (query ?? '').toString().trim().toLowerCase();
  try {
    const anime = await AniListService.searchAnime(normalizedQuery, 1, 16);
    return anime.map(animeToContentItem);
  } catch (error) {
    console.error('Error searching anime content:', error);
    return [];
  }
};

// Obtener contenido en emisión/cartelera
export const getCurrentContent = async (page: number = 1): Promise<ContentItem[]> => {
  try {
    const anime = await AniListService.getAiringAnime(page);
    const animeItems = anime.map(animeToContentItem);
    return animeItems;
  } catch (error) {
    console.error('Error fetching current content:', error);
    return [];
  }
};

// Obtener detalles unificados de contenido
export const getContentDetails = async (
  id: number, 
  type: 'movie' | 'tv' | 'anime',
  source: 'tmdb' | 'anilist'
): Promise<ContentItem | null> => {
  console.log('🔍 getContentDetails: Starting', { id, type, source });
  
  try {
    if (source === 'anilist' && type === 'anime') {
      console.log('🔍 getContentDetails: Fetching anime from AniList', { id });
      const anime = await AniListService.getAnimeDetails(id);
      console.log('✅ getContentDetails: AniList response received', { animeTitle: anime?.title?.romaji || anime?.title?.english });
      const contentItem = animeToContentItem(anime);
      console.log('✅ getContentDetails: Anime converted to ContentItem', { 
        contentId: contentItem.id, 
        contentType: contentItem.type, 
        contentSource: contentItem.source 
      });
      return contentItem;
    } else if (source === 'tmdb') {
      if (type === 'movie') {
        console.log('🔍 getContentDetails: Fetching movie from TMDB', { id });
        const movie = await getMovieDetails(id);
        console.log('✅ getContentDetails: TMDB movie response received', { movieTitle: movie?.title });
        const contentItem = tmdbToContentItem(movie, 'movie');
        console.log('✅ getContentDetails: Movie converted to ContentItem', { 
          contentId: contentItem.id, 
          contentType: contentItem.type, 
          contentSource: contentItem.source 
        });
        return contentItem;
      } else if (type === 'tv') {
        console.log('🔍 getContentDetails: Fetching TV show from TMDB', { id });
        const tvShow = await getTVShowDetails(id);
        console.log('✅ getContentDetails: TMDB TV show response received', { tvTitle: tvShow?.name });
        const contentItem = tmdbToContentItem(tvShow, 'tv');
        console.log('✅ getContentDetails: TV show converted to ContentItem', { 
          contentId: contentItem.id, 
          contentType: contentItem.type, 
          contentSource: contentItem.source 
        });
        return contentItem;
      }
    }
    
    console.log('❌ getContentDetails: No matching source/type combination', { id, type, source });
    return null;
  } catch (error: any) {
    console.error(`❌ getContentDetails: Error fetching content for ID ${id}, type ${type}, source ${source}:`, error);
    
    // Si es un error 404 de TMDB, propagar con información específica
    if (error.message?.includes('TMDB_404')) {
      throw new Error(`TMDB_404: Content ${id} (${type}) not found on TMDB`);
    }
    
    // Si es un error de AniList, propagar con información específica
    if (source === 'anilist' && error.response?.status === 404) {
      throw new Error(`ANILIST_404: Anime ${id} not found on AniList`);
    }
    
    throw error;
  }
};

// Categorías mejoradas que incluyen anime
export const ENHANCED_CATEGORIES = [
  {
    id: 'popular_all',
    name: 'Popular Ahora',
    fetcher: getAllPopularContent,
  },
  {
    id: 'top_rated_all',
    name: 'Mejor Valorado',
    fetcher: getAllTopRatedContent,
  },
  {
    id: 'current_all',
    name: 'En Emisión/Cartelera',
    fetcher: getCurrentContent,
  },
  {
    id: 'popular_anime',
    name: 'Anime Popular',
    fetcher: async () => (await AniListService.getPopularAnime())
      // Incluir también películas de anime
      .map(animeToContentItem),
  },
  {
    id: 'airing_anime',
    name: 'Anime en Emisión',
    fetcher: async () => (await AniListService.getAiringAnime())
      .map(animeToContentItem),
  },
  {
    id: 'top_anime',
    name: 'Mejor Anime',
    fetcher: async () => (await AniListService.getTopRatedAnime())
      .map(animeToContentItem),
  },
  {
    id: 'popular_movies',
    name: 'Películas Populares',
    fetcher: async () => (await getPopularMovies()).map(movie => tmdbToContentItem(movie, 'movie')),
  },
  {
    id: 'popular_tv',
    name: 'Series Populares', 
    fetcher: async () => (await getPopularTVShows()).map(show => tmdbToContentItem(show, 'tv')),
  },
];

// ===== Helper para obtener una página de una categoría concreta =====
export const fetchCategoryPage = async (categoryId: string, page: number = 1): Promise<ContentItem[]> => {
  try {
    switch (categoryId) {
      case 'popular_all':
        return await getAllPopularContent(page);
      case 'top_rated_all':
        return await getAllTopRatedContent(page);
      case 'current_all':
        return await getCurrentContent(page);
      case 'popular_movies': {
        const movies = await getPopularMovies(page);
        return movies.map(movie => tmdbToContentItem(movie, 'movie'));
      }
      case 'popular_tv': {
        const tv = await getPopularTVShows(page);
        return tv.map(show => tmdbToContentItem(show, 'tv'));
      }
      case 'popular_anime': {
        const anime = await AniListService.getPopularAnime(page);
        return anime.map(animeToContentItem);
      }
      case 'airing_anime': {
        const anime = await AniListService.getAiringAnime(page);
        return anime.map(animeToContentItem);
      }
      case 'top_anime': {
        const anime = await AniListService.getTopRatedAnime(page);
        return anime.map(animeToContentItem);
      }
      default:
        return [];
    }
  } catch (error) {
    console.error(`Error fetching page for category ${categoryId}:`, error);
    return [];
  }
};

