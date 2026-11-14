// Adult catalog records belong exclusively to the separate adult section,
// even when the profile has enabled that section.
export function isPublicCatalogItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  if (['isAdult', 'is_adult', 'is_nsfw'].some(key => ['true', '1'].includes(String(item[key]).toLowerCase()))) return false;
  const labels = [item.type, item.content_type, item.source, item.content_rating,
    ...(Array.isArray(item.genres) ? item.genres : []),
    ...(Array.isArray(item.tags) ? item.tags : [])];
  const blocked = new Set(['hentai', 'h_anime', 'nsfw', 'adult', '18+', 'r18', 'r-18', 'erotica', 'pornographic']);
  return !labels.some(value => blocked.has(String(typeof value === 'object' ? value?.name : value || '').trim().toLowerCase()));
}
