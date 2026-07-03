import { backendClient } from './backendClient';

export type NewsArticle = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content?: string | null;
  source_name: string | null;
  source_url?: string | null;
  image_url: string | null;
  published_at: string | null;
  category: string | null;
  tags: any;
  language: string | null;
  is_featured: boolean;
  external_url: string | null;
  has_valid_image?: boolean;
  is_publishable?: boolean;
  quality_score?: number;
  use_fallback_image?: boolean;
};

export const newsApi = {
  async list(params?: { category?: string; page?: number; limit?: number; featured?: boolean }) {
    const { data } = await backendClient.get('/api/news', { params });
    return data as { data: NewsArticle[]; pagination: { page: number; limit: number; total: number } };
  },

  async featured(params?: { limit?: number }) {
    const { data } = await backendClient.get('/api/news/featured', { params });
    return data as { featured: NewsArticle | null; items: NewsArticle[]; meta?: { used_fallback_hero?: boolean } };
  },

  async trending() {
    const { data } = await backendClient.get('/api/news/trending');
    return data as { items: NewsArticle[] };
  },

  async getBySlug(slug: string) {
    const { data } = await backendClient.get(`/api/news/${slug}`);
    return data as NewsArticle;
  },
};
