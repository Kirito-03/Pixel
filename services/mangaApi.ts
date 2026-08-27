import { backendClient } from './backendClient';

export type MangaStatus = 'En emisión' | 'Finalizado' | 'Hiatus' | 'Cancelado';

export type Manga = {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  status: MangaStatus;
  tags: string[];
  content_rating: string | null;
  year: number | null;
  chapter_count: number;
  latest_chapter: string | null;
  author: string | null;
  artist: string | null;
  updated_at: string | null;
};

export type MangaChapter = {
  id: string;
  manga_id: string;
  chapter: string | null;
  title: string | null;
  volume: string | null;
  translated_language: string | null;
  publish_at: string | null;
  readable_at: string | null;
  pages: number | null;
  external_url: string | null;
};

export type MangaChaptersResponse = {
  chapters: MangaChapter[];
  items?: MangaChapter[];
  availableLanguages: string[];
  totalAvailableChapters: number;
  spanishAvailableChapters: number;
  selectedLanguage: string | null;
  usedFallbackToEnglish: boolean;
  noSpanishMessage: string | null;
  meta?: any;
};

export type MangaChapterPages = {
  baseUrl: string | null;
  pages: string[];
  chapterId: string;
};

export const mangaApi = {
  async list(params?: { page?: number; limit?: number; status?: string; search?: string; order?: string }) {
    const { data } = await backendClient.get('/api/manga', { params });
    return data as { items: Manga[]; pagination: { page: number; limit: number; total: number }; meta?: any } | any;
  },

  async popular(params?: { limit?: number }) {
    const { data } = await backendClient.get('/api/manga/popular', { params });
    return data as { items: (Manga & { rank: number })[]; meta?: any };
  },

  async getById(id: string) {
    const { data } = await backendClient.get(`/api/manga/${id}`);
    return data as Manga;
  },

  async chapters(id: string, params?: { limit?: number; preferredLanguage?: string; allowEnglishFallback?: boolean; refresh?: boolean }) {
    const { data } = await backendClient.get(`/api/manga/${id}/chapters`, { params });
    return data as MangaChaptersResponse;
  },

  async chapterPages(chapterId: string) {
    const { data } = await backendClient.get(`/api/manga/chapter/${encodeURIComponent(chapterId)}/pages`);
    return data as MangaChapterPages;
  },
};
