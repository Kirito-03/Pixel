import { backendClient } from './backendClient';
import { getCurrentBaseURL } from './db/networkClient';

function normalizeCover<T extends { cover_url?: string | null }>(manga: T): T {
  const cover = manga?.cover_url;
  if (!manga || !cover) return manga;
  if (cover.startsWith('/api/manga-cover?')) {
    return { ...manga, cover_url: `${getCurrentBaseURL().replace(/\/$/, '')}${cover}&v=2` };
  }
  if (cover.includes('dragontranslation.org')) {
    return { ...manga, cover_url: `${getCurrentBaseURL().replace(/\/$/, '')}/api/proxy/manga-image?url=${encodeURIComponent(cover)}` };
  }
  return manga;
}

function normalizeList(data: any) {
  if (Array.isArray(data)) return data.map(normalizeCover);
  return { ...data,
    ...(Array.isArray(data?.items) ? { items: data.items.map(normalizeCover) } : {}),
    ...(Array.isArray(data?.data) ? { data: data.data.map(normalizeCover) } : {}),
  };
}

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
    return normalizeList(data) as { items: Manga[]; pagination: { page: number; limit: number; total: number }; meta?: any } | any;
  },

  async popular(params?: { limit?: number }) {
    const { data } = await backendClient.get('/api/manga/popular', { params });
    return normalizeList(data) as { items: (Manga & { rank: number })[]; meta?: any };
  },

  async getById(id: string) {
    const { data } = await backendClient.get(`/api/manga/${id}`);
    return normalizeCover(data as Manga);
  },

  async chapters(id: string, params?: { limit?: number; preferredLanguage?: string; allowEnglishFallback?: boolean; refresh?: boolean }) {
    const { data } = await backendClient.get(`/api/manga/${id}/chapters`, { params });
    return data as MangaChaptersResponse;
  },

  async chapterPages(chapterId: string) {
    const { data } = await backendClient.get(`/api/manga/chapter/${encodeURIComponent(chapterId)}/pages`);
    if (data && Array.isArray(data.pages)) {
      data.pages = data.pages.map((p: string) => {
        if (p.startsWith('/')) {
          return `${getCurrentBaseURL().replace(/\/$/, '')}${p}`;
        }
        if (p.includes('dragontranslation.org')) {
          return `${getCurrentBaseURL().replace(/\/$/, '')}/api/proxy/manga-image?url=${encodeURIComponent(p)}`;
        }
        return p;
      });
    }
    return data as MangaChapterPages;
  },
};
