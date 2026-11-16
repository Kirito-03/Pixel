import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { backendClient } from './backendClient';

export type MyListContentType = 'movie' | 'tv' | 'anime' | 'manga' | 'h_anime';

export interface MyListEntry {
  content_id: string | number;
  content_type: MyListContentType;
  added_at: string;
  anime_title?: string | null;
  publication_type?: string | null;
  tags?: string[];
  poster_url?: string | null;
  banner_url?: string | null;
  total_episodes: number | null;
  episode_id: number | null;
  season: number | null;
  episode_number: number | null;
  current_time: number | null;
  duration: number | null;
  progress_percent: number | string | null;
  last_watched_at: string | null;
}

const ALLOWED_CONTENT_TYPES = new Set<MyListContentType>(['movie', 'tv', 'anime', 'manga', 'h_anime']);
const SAFE_MANGA_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
const RESERVED_FIRESTORE_ID_REGEX = /^__.*__$/;
const MAX_MANGA_ID_LENGTH = 128;
const MAX_METADATA_CONCURRENCY = 5;

function validateContentType(contentType: unknown): MyListContentType {
  if (typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPES.has(contentType as MyListContentType)) {
    throw new Error(
      `Tipo de contenido inválido: "${String(contentType)}". Valores permitidos: movie, tv, anime, manga, h_anime.`
    );
  }
  return contentType as MyListContentType;
}

function validateProfileId(profileId: unknown): string {
  const num = typeof profileId === 'number' ? profileId : Number(String(profileId ?? '').trim());
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new Error('profileId inválido: debe ser un entero positivo.');
  }
  return String(num);
}

function validateContentId(contentId: unknown, contentType: MyListContentType): string | number {
  if (contentType === 'manga' || contentType === 'h_anime') {
    const raw = typeof contentId === 'number' ? String(contentId) : String(contentId ?? '');
    const trimmed = raw.trim();
    if (
      !trimmed ||
      trimmed.length > MAX_MANGA_ID_LENGTH ||
      trimmed.includes('..') ||
      !SAFE_MANGA_ID_REGEX.test(trimmed) ||
      RESERVED_FIRESTORE_ID_REGEX.test(trimmed)
    ) {
      throw new Error(
        `contentId inválido para ${contentType}: debe ser un identificador seguro no vacío (alfanumérico, ".", "_" o "-").`
      );
    }
    return trimmed;
  }

  const rawStr = typeof contentId === 'number' ? String(contentId) : String(contentId ?? '').trim();
  if (!/^\d+$/.test(rawStr)) {
    throw new Error(`contentId inválido para ${contentType}: debe ser un entero positivo.`);
  }
  const num = Number(rawStr);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new Error(`contentId inválido para ${contentType}: debe ser un entero positivo.`);
  }
  return num;
}

function buildSafeDocId(contentType: MyListContentType, contentId: string | number): string {
  const docId = `${contentType}_${String(contentId)}`;
  if (docId.includes('/') || docId.includes('..') || RESERVED_FIRESTORE_ID_REGEX.test(docId)) {
    throw new Error('Identificador de documento inválido para Mi Lista.');
  }
  return docId;
}

function toIsoTimestamp(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      return maybeTs.toDate().toISOString();
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return new Date(maybeTs.seconds * 1000).toISOString();
    }
  }
  return '';
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getFirestoreErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

function formatFirestoreStageError(stageMessage: string, error: unknown): Error {
  const code = getFirestoreErrorCode(error) ?? 'unknown';
  return new Error(`${stageMessage} (código: ${code}).`);
}

function parseRawEntry(raw: Record<string, unknown> | undefined): MyListEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    const contentType = validateContentType(raw.content_type);
    const contentId = validateContentId(raw.content_id, contentType);
    return {
      content_id: contentId,
      content_type: contentType,
      added_at: toIsoTimestamp(raw.added_at),
      anime_title: typeof raw.anime_title === 'string' ? raw.anime_title : null,
      poster_url: typeof raw.poster_url === 'string' ? raw.poster_url : null,
      banner_url: typeof raw.banner_url === 'string' ? raw.banner_url : null,
      total_episodes: toNullableNumber(raw.total_episodes),
      episode_id: toNullableNumber(raw.episode_id),
      season: toNullableNumber(raw.season),
      episode_number: toNullableNumber(raw.episode_number),
      current_time: toNullableNumber(raw.current_time),
      duration: toNullableNumber(raw.duration),
      progress_percent: toNullableNumber(raw.progress_percent),
      last_watched_at: raw.last_watched_at ? toIsoTimestamp(raw.last_watched_at) || null : null,
    };
  } catch {
    // Ignorar documentos o entradas corruptas sin romper la lista completa.
    return null;
  }
}

async function requireAuthenticatedProfile(profileId: unknown): Promise<{
  uid: string;
  normalizedProfileId: string;
}> {
  // Wait for persisted Firebase auth before the first list read after a page reload.
  if (typeof auth?.authStateReady === 'function') await auth.authStateReady();
  const uid = auth?.currentUser?.uid;
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Usuario no autenticado en Firebase. Inicia sesión para gestionar Mi Lista.');
  }

  const normalizedProfileId = validateProfileId(profileId);
  const profileRef = doc(db, 'profiles', uid, 'profiles', normalizedProfileId);

  let profileSnap;
  try {
    profileSnap = await getDoc(profileRef);
  } catch (error) {
    throw formatFirestoreStageError(
      `Error en lectura del perfil ${normalizedProfileId} en Firestore`,
      error
    );
  }

  if (!profileSnap.exists()) {
    throw new Error(`El perfil ${normalizedProfileId} no existe o no pertenece al usuario actual.`);
  }

  return {
    uid,
    normalizedProfileId,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function enrichEntryMetadata(entry: MyListEntry): Promise<MyListEntry> {
  if (entry.content_type === 'anime') {
    try {
      // GET público al catálogo SQL; sin credenciales ni tokens para no filtrarlos a URLs custom.
      const { data } = await backendClient.get(
        `/api/catalog/anime/${encodeURIComponent(String(entry.content_id))}`,
        { withCredentials: false }
      );
      if (!data || typeof data !== 'object') return entry;
      const anime = data as {
        title?: string | null;
        poster_url?: string | null;
        banner_url?: string | null;
        total_episodes?: number | string | null;
      };
      return {
        ...entry,
        anime_title: anime.title ?? entry.anime_title ?? null,
        poster_url: anime.poster_url ?? entry.poster_url ?? null,
        banner_url: anime.banner_url ?? entry.banner_url ?? null,
        total_episodes: toNullableNumber(anime.total_episodes) ?? entry.total_episodes,
      };
    } catch {
      // Si falla o falta metadata en el catálogo público, conservar la entrada en Mi Lista.
      return entry;
    }
  }

  if (entry.content_type === 'h_anime') {
    try {
      const { data } = await backendClient.get(`/api/nsfw/details/${encodeURIComponent(String(entry.content_id))}`, { withCredentials: false });
      if (!data || typeof data !== 'object') return entry;
      return { ...entry, anime_title: data.title ?? entry.anime_title, poster_url: data.poster_path ?? entry.poster_url,
        banner_url: data.banner_path || data.banner_url || entry.banner_url, total_episodes: Array.isArray(data.episodes) ? data.episodes.length : null };
    } catch { return entry; }
  }

  if (entry.content_type === 'manga') {
    try {
      // GET público directo vía backendClient para evitar dependencia circular con mangaApi.
      const { data } = await backendClient.get(
        `/api/manga/${encodeURIComponent(String(entry.content_id))}`,
        { withCredentials: false }
      );
      if (!data || typeof data !== 'object') return entry;
      const manga = data as {
        title?: string | null;
        cover_url?: string | null;
        publication_type?: string | null;
        tags?: string[];
        chapter_count?: number | string | null;
      };
      return {
        ...entry,
        anime_title: manga.title ?? entry.anime_title ?? null,
        publication_type: typeof manga.publication_type === 'string' ? manga.publication_type : entry.publication_type,
        tags: Array.isArray(manga.tags) ? manga.tags : entry.tags,
        poster_url: manga.cover_url ?? entry.poster_url ?? null,
        banner_url: entry.banner_url ?? null,
        total_episodes: toNullableNumber(manga.chapter_count) ?? entry.total_episodes,
      };
    } catch {
      // Si falla o falta metadata en el catálogo público, conservar la entrada en Mi Lista.
      return entry;
    }
  }

  return entry;
}

export const myListApi = {
  async getMyList(profileId: number, options: { includeAdult?: boolean } = {}): Promise<MyListEntry[]> {
    const { uid, normalizedProfileId } = await requireAuthenticatedProfile(profileId);
    const listRef = collection(db, 'profiles', uid, 'profiles', normalizedProfileId, 'mylist');
    const q = query(listRef, orderBy('added_at', 'desc'));

    const baseEntries: MyListEntry[] = [];
    try {
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const parsed = parseRawEntry(docSnap.data() as Record<string, unknown> | undefined);
        if (parsed && (parsed.content_type !== 'h_anime' || options.includeAdult)) baseEntries.push(parsed);
      }
    } catch (error) {
      throw formatFirestoreStageError(
        `Error en lectura de la subcolección Mi Lista del perfil ${normalizedProfileId}`,
        error
      );
    }

    baseEntries.sort((a, b) => (b.added_at || '').localeCompare(a.added_at || ''));

    return mapWithConcurrency(baseEntries, MAX_METADATA_CONCURRENCY, enrichEntryMetadata);
  },

  async add(
    profileId: number,
    contentId: string | number,
    contentType: MyListContentType
  ): Promise<{ ok: true }> {
    const { uid, normalizedProfileId } = await requireAuthenticatedProfile(profileId);
    const validType = validateContentType(contentType);
    const validId = validateContentId(contentId, validType);
    const docId = buildSafeDocId(validType, validId);
    const normalizedContentId = (validType === 'manga' || validType === 'h_anime') ? String(validId) : Number(validId);

    const itemRef = doc(db, 'profiles', uid, 'profiles', normalizedProfileId, 'mylist', docId);
    try {
      await setDoc(
        itemRef,
        {
          content_id: normalizedContentId,
          content_type: validType,
          added_at: serverTimestamp(),
        },
        { merge: true }
      );
      return { ok: true };
    } catch (error) {
      throw formatFirestoreStageError(
        `Error en escritura de Mi Lista (subcolección) para el perfil ${normalizedProfileId}`,
        error
      );
    }
  },

  async remove(
    profileId: number,
    contentId: string | number,
    contentType: MyListContentType
  ): Promise<{ ok: true }> {
    const { uid, normalizedProfileId } = await requireAuthenticatedProfile(profileId);
    const validType = validateContentType(contentType);
    const validId = validateContentId(contentId, validType);
    const docId = buildSafeDocId(validType, validId);

    const itemRef = doc(db, 'profiles', uid, 'profiles', normalizedProfileId, 'mylist', docId);
    try {
      await deleteDoc(itemRef);
      // Earlier clients used addDoc(), so a saved title can have a random document ID.
      // Remove only matching entries in this authenticated profile's own collection.
      const saved = await getDocs(collection(db, 'profiles', uid, 'profiles', normalizedProfileId, 'mylist'));
      const legacyMatches = saved.docs.filter(entry => {
        const data = entry.data();
        return entry.id !== docId && data.content_type === validType && String(data.content_id) === String(validId);
      });
      await Promise.all(legacyMatches.map(entry => deleteDoc(doc(db, 'profiles', uid, 'profiles', normalizedProfileId, 'mylist', entry.id))));
      return { ok: true };
    } catch (error) {
      throw formatFirestoreStageError(
        `Error en eliminación de Mi Lista (subcolección) para el perfil ${normalizedProfileId}`,
        error
      );
    }
  },
};
