import axios from 'axios';
import { getCurrentBaseURL } from './databaseService';

export interface CatalogAnime {
  id: number;
  tmdb_id?: number | null;
  title: string;
  franchise_key?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  description?: string | null;
  poster_url?: string | null;
  banner_url?: string | null;
  genres?: string[] | null;
  status?: string | null;
  total_episodes?: number | null;
  rating?: number | null;
  release_date?: string | null;
  created_at?: string | null;
}

export interface CatalogEpisode {
  id: number;
  season: number;
  episode_number: number;
  title?: string | null;
  duration?: number | null;
  status?: string | null;
  video_url?: string | null;
  stream_url?: string | null;
}

function getBaseURL() {
  return getCurrentBaseURL() || 'http://localhost:3001';
}

const http = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  config.baseURL = getBaseURL();
  return config;
});

export const catalogService = {
  async getAnimeList(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    franchise?: string;
  }) {
    const { data } = await http.get('/api/catalog/anime', { params });
    return data as { data: CatalogAnime[]; pagination: any };
  },

  async searchAnime(query: string) {
    const { data } = await http.get('/api/catalog/search', { params: { q: query } });
    return (data?.data || []) as CatalogAnime[];
  },

  async getAnimeById(id: number) {
    const { data } = await http.get(`/api/catalog/anime/${id}`);
    return data as CatalogAnime;
  },

  async getAnimeEpisodes(id: number) {
    const { data } = await http.get(`/api/catalog/anime/${id}/episodes`);
    return (data?.episodes || []) as CatalogEpisode[];
  },

  async getHomeSections() {
    const limit = 20;
    const [airing, finished, upcoming] = await Promise.all([
      http.get('/api/catalog/anime', { params: { status: 'Releasing', page: 1, limit } }),
      http.get('/api/catalog/anime', { params: { status: 'Finished', page: 1, limit } }),
      http.get('/api/catalog/anime', { params: { status: '', page: 1, limit } }),
    ]);

    return {
      airing: (airing.data?.data || []) as CatalogAnime[],
      finished: (finished.data?.data || []) as CatalogAnime[],
      upcoming: (upcoming.data?.data || []) as CatalogAnime[],
    };
  },
};
