import AsyncStorage from '@react-native-async-storage/async-storage';
import {createPublicCatalogCache} from './publicCatalogCache';
import { isPublicCatalogItem } from '../utils/publicCatalog';
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
  description_original?: string | null;
  description_es?: string | null;
  description_language?: 'es' | 'en' | null;
  translation_status?: 'ready' | 'pending';
  trailer_id?: string | null;
  trailer_site?: string | null;
  trailer_checked_at?: string | null;
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
  thumbnail_url?: string | null;
  status?: string | null;
  video_url?: string | null;
  external_servers?: { server: string; title: string; url: string }[] | null;
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

const publicCache=createPublicCatalogCache(AsyncStorage);
const cacheKey=(path:string)=>`${getBaseURL()}:${path}`;

export const catalogService = {
  subscribeHome(listener:()=>void){return publicCache.subscribe(key=>{if(key===cacheKey('home'))listener();});},
  subscribeAnime(id:number,listener:(part:string)=>void){return publicCache.subscribe(key=>{for(const part of ['anime','episodes','related'])if(key===cacheKey(`${part}:${id}`))listener(part);});},
  async getAnimeList(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    franchise?: string;
    genre?: string;
  }, force = false) {
    const load=async()=>{const r=await http.get('/api/catalog/anime',{params});return r.data;};
    const data=params.search?await load():await publicCache.read(cacheKey('list:'+JSON.stringify(params)),load,{force});
    return { ...data, data: (data?.data || []).filter(isPublicCatalogItem) } as { data: CatalogAnime[]; pagination: any };
  },

  async searchAnime(query: string) {
    const { data } = await http.get('/api/catalog/search', { params: { q: query } });
    return (data?.data || []).filter(isPublicCatalogItem) as CatalogAnime[];
  },

  async getAnimeById(id: number, force = false) {
    const data=await publicCache.read(cacheKey(`anime:${id}`),async()=>{const r=await http.get(`/api/catalog/anime/${id}`);if(!isPublicCatalogItem(r.data))throw new Error('Contenido no disponible');return r.data;},{force});
    if (!isPublicCatalogItem(data)) throw new Error('Contenido no disponible en el catálogo general.');
    return data as CatalogAnime;
  },

  async getAnimeEpisodes(id: number, force = false) {
    const data=await publicCache.read(cacheKey(`episodes:${id}`),async()=>{const r=await http.get(`/api/catalog/anime/${id}/episodes`);return r.data;},{force,ttl:60000});
    return (data?.episodes || []) as CatalogEpisode[];
  },

  async getRelatedAnime(id: number, force = false) {
    const data=await publicCache.read(cacheKey(`related:${id}`),async()=>{const r=await http.get(`/api/catalog/anime/${id}/related`);return r.data;},{force});
    return {data:(data?.data||[]).filter(isPublicCatalogItem)} as {data:CatalogAnime[]};
  },
  async getHomeSections(force = false) {
    return publicCache.read(cacheKey('home'),()=>this.fetchHomeSections(),{force});
  },
  async fetchHomeSections() {
    const limit = 48;
    // Lista de géneros con catálogo abundante para rotar en cada recarga
    const rotatingGenres = ['Action', 'Comedy', 'Fantasy', 'Romance', 'Drama', 'Adventure', 'Sci-Fi', 'Slice of Life', 'Supernatural'];
    const randomGenre = rotatingGenres[Math.floor(Math.random() * rotatingGenres.length)];

    const [airing, finished, recommended, genreAnime] = await Promise.all([
      http.get('/api/catalog/anime', { params: { status: 'Releasing', page: 1, limit, sort: 'random' } }),
      http.get('/api/catalog/anime', { params: { status: 'Finished', page: 1, limit, sort: 'random' } }),
      http.get('/api/catalog/anime', { params: { limit, sort: 'rating' } }),
      http.get('/api/catalog/anime', { params: { genre: randomGenre, limit, sort: 'random' } }),
    ]);

    return {
      airing: (airing.data?.data || []).filter(isPublicCatalogItem) as CatalogAnime[],
      finished: (finished.data?.data || []).filter(isPublicCatalogItem) as CatalogAnime[],
      upcoming: (recommended.data?.data || []).filter(isPublicCatalogItem) as CatalogAnime[],
      featuredGenre: {
        genre: randomGenre,
        title: `Populares de ${randomGenre}`,
        items: (genreAnime.data?.data || []).filter(isPublicCatalogItem) as CatalogAnime[],
      },
    };
  },
};
