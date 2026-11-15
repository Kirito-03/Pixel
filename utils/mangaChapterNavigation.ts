import type { MangaChapter } from '../services/mangaApi';

export function mangaChapterKey(chapter: Pick<MangaChapter, 'id' | 'chapter'>) {
  const number = String(chapter.chapter ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(number)) return `cap-${Number(number)}`;
  // Stable public key for extras without exposing the upstream address.
  let hash = 2166136261;
  for (const char of chapter.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `cap-extra-${(hash >>> 0).toString(36)}`;
}

const context = new Map<string, { title: string; chapters: MangaChapter[] }>();
export function rememberMangaReader(id: string, title: string, chapters: MangaChapter[]) {
  context.delete(id); context.set(id, { title, chapters });
  if (context.size > 20) context.delete(context.keys().next().value!);
}
export function getMangaReaderContext(id: string) { return context.get(id); }
