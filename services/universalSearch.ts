import { catalogService } from './catalogService';
import { mangaApi, type Manga } from './mangaApi';
import type { ContentItem } from '../types';
import { isPublicCatalogItem } from '../utils/publicCatalog';

export type UniversalSearchResult =
  | { kind: 'anime'; key: string; title: string; poster: string; content: ContentItem }
  | { kind: 'manga'; key: string; title: string; poster: string; manga: Manga };
export type UniversalSearchResponse = { items: UniversalSearchResult[]; unavailable: ('anime' | 'manga')[] };

export function animeSearchResult(anime: any): Extract<UniversalSearchResult, { kind: 'anime' }> {
  const content: ContentItem = {
    id: Number(anime.id), type: 'anime', title: anime.title || 'Sin título',
    overview: anime.description || '', poster_path: anime.poster_url || '',
    backdrop_path: anime.banner_url || anime.poster_url || '', release_date: anime.release_date || '',
    vote_average: Number(anime.rating) || 0, source: 'anilist', genres: Array.isArray(anime.genres) ? anime.genres : [],
    trailer_id: anime.trailer_id, trailer_site: anime.trailer_site, trailer_checked_at: anime.trailer_checked_at,
  };
  return { kind: 'anime', key: `anime:${content.id}`, title: content.title, poster: content.poster_path, content };
}

// Small public-only cache: suggestions and the results grid share one request.
export function createUniversalSearch(deps: { anime: (q: string) => Promise<any[]>; manga: (q: string, refresh?: boolean) => Promise<any> }) {
  const cache = new Map<string, { expires: number; response: UniversalSearchResponse }>();
  const pending = new Map<string, Promise<UniversalSearchResponse>>();
  return async function search(query: string, refresh = false): Promise<UniversalSearchResponse> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { items: [], unavailable: [] };
    const stored = cache.get(q);
    if (!refresh && stored && stored.expires > Date.now()) return stored.response;
    if (pending.has(q)) return pending.get(q)!;
    const request = (async () => {
      const animeTask = Promise.resolve().then(() => deps.anime(q)).then(value => {
        if (!Array.isArray(value)) throw new Error('Invalid anime response');
        return value;
      });
      const mangaTask = Promise.resolve().then(() => deps.manga(q, refresh)).then(value => {
        const list = Array.isArray(value) ? value : value?.items || value?.data;
        if (!Array.isArray(list)) throw new Error('Invalid manga response');
        return list;
      });
      const [anime, manga] = await Promise.allSettled([animeTask, mangaTask]);
      if (anime.status === 'rejected' && manga.status === 'rejected') throw new Error('No se pudo realizar la búsqueda. Intenta nuevamente.');
      const items: UniversalSearchResult[] = [];
      const unavailable: ('anime' | 'manga')[] = [];
      if (anime.status === 'fulfilled') items.push(...anime.value.filter(isPublicCatalogItem).map(animeSearchResult));
      else unavailable.push('anime');
      if (manga.status === 'fulfilled') {
        items.push(...manga.value.filter(isPublicCatalogItem).map((m: Manga): UniversalSearchResult => ({ kind: 'manga', key: `manga:${m.id}`, title: m.title, poster: m.cover_url || '', manga: m })));
      } else unavailable.push('manga');
      const seen = new Set<string>();
      const unique = items.filter(item => !seen.has(item.key) && !!seen.add(item.key));
      const animeItems = unique.filter(item => item.kind === 'anime');
      const mangaItems = unique.filter(item => item.kind === 'manga');
      const mixed: UniversalSearchResult[] = [];
      for (let i = 0; i < Math.max(animeItems.length, mangaItems.length); i++) {
        if (animeItems[i]) mixed.push(animeItems[i]);
        if (mangaItems[i]) mixed.push(mangaItems[i]);
      }
      const response = { items: mixed, unavailable };
      // Don't cache partial failures: retry should be able to recover the missing provider.
      if (!unavailable.length) {
        if (cache.size >= 40) cache.delete(cache.keys().next().value!);
        cache.set(q, { expires: Date.now() + 5 * 60_000, response });
      }
      return response;
    })();
    pending.set(q, request);
    try { return await request; } finally { pending.delete(q); }
  };
}

export const universalSearch = createUniversalSearch({
  anime: q => catalogService.searchAnime(q),
  manga: (q, refresh) => mangaApi.list({ search: q, page: 1, limit: 30 }, refresh),
});
