// Tipos para películas
export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
}

export interface MovieDetail extends Movie {
  runtime: number;
  genres: { id: number; name: string }[];
  videos: {
    results: { key: string; type: string; site: string }[];
  };
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: {
        certification: string;
        type: number;
      }[];
    }[];
  };
}

// Tipos para series
export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  first_air_date: string;
  vote_average: number;
}

export interface TVShowDetail extends TVShow {
  episode_run_time: number[];
  genres: { id: number; name: string }[];
  number_of_seasons: number;
  number_of_episodes: number;
  videos: {
    results: { key: string; type: string; site: string }[];
  };
  content_ratings?: {
    results: {
      iso_3166_1: string;
      rating: string;
    }[];
  };
}

// Tipos para Anime (AniList)
export interface Anime {
  id: number;
  title: {
    romaji: string;
    english?: string;
    native: string;
  };
  description: string;
  coverImage: {
    large: string;
    medium: string;
  };
  bannerImage?: string;
  startDate: {
    year: number;
    month?: number;
    day?: number;
  };
  averageScore: number;
  episodes?: number;
  status: string;
  genres: string[];
  format: string; // TV, MOVIE, OVA, etc.
  source: 'anilist';
}

export interface AnimeDetail extends Anime {
  duration?: number;
  studios: {
    nodes: { name: string }[];
  };
  trailer?: {
    id: string;
    site: string;
  };
  characters: {
    nodes: {
      id: number;
      name: {
        full: string;
      };
      image: {
        medium: string;
      };
    }[];
  };
  recommendations: {
    nodes: {
      mediaRecommendation: Anime;
    }[];
  };
}

// Types for anime streaming
export interface AnimeEpisode {
  id: string;
  number: number;
  title: string;
  description?: string;
  image?: string;
  url?: string;
  downloadUrl?: string;
  sources?: VideoSource[];
}

export interface VideoSource {
  url: string;
  quality?: string; // e.g., '1080p', '720p', etc.
  isM3U8?: boolean; // explicit flag if source is HLS
}

export interface AnimeSeason {
  id: string;
  title: string;
  season: number;
  episodes: AnimeEpisode[];
}

export interface StreamingInfo {
  animeId: string;
  title: string;
  description: string;
  image: string;
  genres: string[];
  status: string;
  totalEpisodes: number;
  seasons: AnimeSeason[];
}

// Extended anime detail with streaming info
export interface AnimeDetailWithStreaming extends AnimeDetail {
  streamingInfo?: StreamingInfo;
}

// Tipos unificados para contenido (película, serie o anime)
export type Content = Movie | TVShow | Anime;
export type ContentDetail = MovieDetail | TVShowDetail | AnimeDetail;

// Tipo discriminador para saber si es película, serie o anime
export interface ContentItem {
  id: number;
  type: 'movie' | 'tv' | 'anime';
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  source: 'tmdb' | 'anilist';
  // Campos opcionales para enriquecer el filtrado y la UI
  genres?: string[];   // Solo aplicable principalmente para anime
  isAdult?: boolean;   // Marcador para contenido +18 (Ecchi/Hentai en anime)
  status?: string;     // Estado del anime: 'Airing' | 'Finished' | 'Upcoming' — usado para badges
}

// Navegación
export type RootStackParamList = {
  Ingreso: undefined;
  Registro: undefined;
  SeleccionPerfil: undefined;
  Principal: { selectedProfile?: any; userId?: number };
  Buscar: undefined;
  Perfil: undefined;
  Apariencia: undefined;
  Descargas: undefined;
  Admin: undefined;
};

export type TabParamList = {
  Inicio: undefined;
  Buscar: undefined;
  Noticias: undefined;
  Manga: undefined;
  MiLista: undefined;
  Perfil: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
  DetallePelicula: { movieId: number; type?: 'movie' | 'tv' | 'anime'; source?: 'tmdb' | 'anilist' };
  Categoria: { categoryId: string; categoryName: string; source?: 'tmdb' | 'anilist' };
  MiLista: undefined;
};

export type AdminStackParamList = {
  AdminLogin: undefined;
  AdminDashboard: undefined;
  AdminImport: undefined;
  AnimeList: undefined;
  AnimeForm: { animeId?: number };
  EpisodeManager: { animeId: number; animeTitle?: string };
};

export type NewsStackParamList = {
  NoticiasHome: undefined;
  NewsDetail: { articleId: number; slug?: string };
};

export type MangaStackParamList = {
  MangaHome: undefined;
  MangaDetail: { mangaId: string };
  MangaReader: { chapterId: string; mangaId: string };
};

