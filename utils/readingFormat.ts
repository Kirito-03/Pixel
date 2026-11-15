// Publication format is metadata, separate from Pixel's internal "manga" media kind.
export function readingFormat(item: { publication_type?: string | null; format?: string | null; tags?: string[] }): string {
  const values = [item.publication_type, item.format, ...(item.tags || [])];
  for (const value of values) {
    const type = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (type === 'manhwa' || type === 'manwha') return 'Manhwa';
    if (type === 'manhua') return 'Manhua';
    if (type === 'manga') return 'Manga';
    if (type === 'webtoon') return 'Webtoon';
    if (type === 'light novel' || type === 'novela ligera') return 'Novela ligera';
    if (type === 'one shot' || type === 'oneshot') return 'One-shot';
  }
  return 'Lectura';
}
