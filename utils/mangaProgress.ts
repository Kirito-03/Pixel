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
