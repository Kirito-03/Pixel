import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'pixel_manga_progress_';

export interface MangaReadingProgress {
  chapterId: string;
  chapterNumber: string;
  updatedAt: number;
}

/** Persist the last opened chapter for a manga so "Leer ahora" becomes "Continuar". */
export async function saveMangaProgress(
  mangaId: string,
  chapterId: string,
  chapterNumber?: string | null
): Promise<void> {
  if (!mangaId || !chapterId) return;
  try {
    const payload: MangaReadingProgress = {
      chapterId,
      chapterNumber: String(chapterNumber ?? '').trim(),
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${mangaId}`,
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage errors so reading never breaks
  }
}

/** Load the last opened chapter for a manga, or null if none saved. */
export async function getMangaProgress(
  mangaId: string
): Promise<MangaReadingProgress | null> {
  if (!mangaId) return null;
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${mangaId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MangaReadingProgress>;
    if (!parsed?.chapterId) return null;
    return {
      chapterId: String(parsed.chapterId),
      chapterNumber: String(parsed.chapterNumber ?? ''),
      updatedAt: Number(parsed.updatedAt ?? 0),
    };
  } catch {
    return null;
  }
}

/** Load all saved manga reading progress keyed by mangaId. */
export async function getAllMangaProgress(): Promise<
  Record<string, MangaReadingProgress>
> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const progressKeys = keys.filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
    if (progressKeys.length === 0) return {};
    const pairs = await AsyncStorage.multiGet(progressKeys);
    const result: Record<string, MangaReadingProgress> = {};
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      const mangaId = key.slice(STORAGE_KEY_PREFIX.length);
      try {
        const parsed = JSON.parse(raw) as Partial<MangaReadingProgress>;
        if (mangaId && parsed?.chapterId) {
          result[mangaId] = {
            chapterId: String(parsed.chapterId),
            chapterNumber: String(parsed.chapterNumber ?? ''),
            updatedAt: Number(parsed.updatedAt ?? 0),
          };
        }
      } catch {
        // Ignore malformed entry
      }
    }
    return result;
  } catch {
    return {};
  }
}

