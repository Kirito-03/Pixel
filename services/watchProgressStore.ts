import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface WatchProgress {
  anime_id: number;
  episode_id: number;
  current_time: number;
  duration: number;
  episode_number?: number;
  season?: number;
  title?: string;
  thumbnail?: string;
  position_known?: boolean;
  updated_at?: string;
}
const pending = new Map<string, Promise<void>>();
function positive(value: unknown, name: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${name} inválido`);
  return number;
}
async function profilePath(profileId: number) {
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para guardar el progreso.');
  return ['profiles', uid, 'profiles', String(positive(profileId, 'Perfil'))] as const;
}
function parse(value: any): WatchProgress | null {
  try {
    if (!Number.isFinite(value.current_time) || value.current_time < 0 || !Number.isFinite(value.duration) || value.duration < 0) return null;
    return { ...value, anime_id: positive(value.anime_id, 'Anime'), episode_id: positive(value.episode_id, 'Episodio'),
      current_time: Math.max(0, Number(value.current_time) || 0), duration: Math.max(0, Number(value.duration) || 0),
      updated_at: typeof value.updated_at === 'string' ? value.updated_at : value.updated_at?.toDate?.().toISOString() || '' };
  } catch { return null; }
}
export const watchProgressStore = {
  async save(profileId: number, value: WatchProgress) {
    const path = await profilePath(profileId);
    const anime = positive(value.anime_id, 'Anime');
    const current = Number(value.current_time), duration = Number(value.duration);
    if (!Number.isFinite(current) || current < 0 || !Number.isFinite(duration) || duration < 0) throw new Error('Posición de reproducción inválida');
    const record: Record<string, unknown> = {
      anime_id: anime, episode_id: positive(value.episode_id, 'Episodio'), current_time: Math.floor(current),
      duration: Math.floor(duration), position_known: value.position_known !== false, updated_at: serverTimestamp(),
    };
    if (Number.isFinite(value.episode_number) && value.episode_number! >= 0) record.episode_number = value.episode_number;
    if (Number.isFinite(value.season) && value.season! >= 0) record.season = value.season;
    if (value.title) record.title = String(value.title).slice(0, 300);
    if (value.thumbnail) record.thumbnail = String(value.thumbnail).slice(0, 2048);
    const key = [...path, String(anime)].join('/');
    const previous = pending.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => setDoc(doc(db, ...path, 'watch_progress', String(anime)), record, { merge: true }));
    pending.set(key, task);
    try { await task; } finally { if (pending.get(key) === task) pending.delete(key); }
  },
  async get(profileId: number, animeId: number): Promise<WatchProgress | null> {
    const path = await profilePath(profileId);
    const snap = await getDoc(doc(db, ...path, 'watch_progress', String(positive(animeId, 'Anime'))));
    return snap.exists() ? parse(snap.data()) : null;
  },
  async list(profileId: number): Promise<WatchProgress[]> {
    const path = await profilePath(profileId);
    const snap = await getDocs(query(collection(db, ...path, 'watch_progress'), orderBy('updated_at', 'desc')));
    return snap.docs.map(entry => parse(entry.data())).filter((entry): entry is WatchProgress => !!entry);
  },
};
