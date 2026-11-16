import type { CatalogAnime } from './catalogService';
export function resolveAnimeTrailer(anime: Pick<CatalogAnime, 'id' | 'trailer_id' | 'trailer_site'>) {
  const youtube = /^[A-Za-z0-9_-]{11}$/.test(anime.trailer_id || '') ? anime.trailer_id! : undefined;
  if (String(anime.trailer_site).toLowerCase() === 'gdrive' && Number.isSafeInteger(Number(anime.id)) && Number(anime.id) > 0)
    return { id: `https://pixelnosekai.com/api/stream/Anime/${anime.id}/trailer.mp4`, fallbackYoutubeId: youtube };
  return String(anime.trailer_site).toLowerCase() === 'youtube' && youtube ? { id: youtube, fallbackYoutubeId: undefined } : null;
}
export const seriesSearchTerm = (title: string) => String(title || '')
 .replace(/[:\s]+(?:the\s+)?final\s+season.*$/i, '')
 .replace(/(?:[:\s]+)(?:\d+(?:st|nd|rd|th)?\s+season|season\s+\d+|part\s+\d+).*$/i, '').trim()
 .replace(/^(.{8,}?)\s+(?:[2-9]|[1-9]\d|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '$1').trim();
const titleKey = (value: unknown) => String(value || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const aliases = (row: CatalogAnime) => (seriesSearchTerm(row.title) !== row.title.trim() ? [row.title] : [row.title, row.title_english, row.title_japanese]).map(titleKey).filter(key => key.length > 3);
// AniList cover filenames carry the work ID, even when records have different titles/CDN sizes.
export function animeSourceIdentity(row: Pick<CatalogAnime,'poster_url'>) {
 try {const url=new URL(row.poster_url||'');
  if(!/^s\d+\.anilist\.co$/.test(url.hostname))return null;
  const id=url.pathname.match(/\/media\/anime\/cover\/(?:small|medium|large)\/[a-z]{0,2}(\d+)(?:[-.]|$)/i)?.[1];
  return id?`anilist:${Number(id)}`:null;
 }catch{return null;}
}
export function relatedAnime(current: CatalogAnime, seasons: CatalogAnime[], similar: CatalogAnime[], limit = 15) {
 const ids = new Set([String(current.id)]), titles = new Set(aliases(current));
 const dateKey=(row:CatalogAnime)=>{const date=Date.parse(row.release_date||'');return Number.isFinite(date)?new Date(date).toISOString().slice(0,10):'';};
 const sourceDates=new Map<string,Set<string>>();const sourceId=animeSourceIdentity(current);if(sourceId)sourceDates.set(sourceId,new Set([dateKey(current)]));
 const base = titleKey(seriesSearchTerm(current.title));
 const sameFranchise = seasons.filter(row => current.franchise_key ? row.franchise_key === current.franchise_key : base.length >= 6 && titleKey(seriesSearchTerm(row.title)) === base)
   .sort((a,b) => String(a.release_date || '9999').localeCompare(String(b.release_date || '9999')));
 const result: CatalogAnime[] = [];
 for (const row of [...sameFranchise, ...similar]) {
  const keys = aliases(row), source=animeSourceIdentity(row), date=dateKey(row);
  const dates=source?sourceDates.get(source):undefined;
  if (ids.has(String(row.id)) || (dates && (!date || dates.has('') || dates.has(date))) || keys.some(key => titles.has(key))) continue;
  if(source){if(!dates)sourceDates.set(source,new Set([date]));else dates.add(date);}
  ids.add(String(row.id)); keys.forEach(key => titles.add(key));
  result.push(row); if (result.length >= limit) break;
 }
 return result;
}
