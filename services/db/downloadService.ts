/**
 * Servicio de Descargas — Firestore.
 * CRUD de descargas bajo profiles/{uid}/profiles/{perfilId}/downloads
 */
import { auth, db } from '../firebase';
import { collection, addDoc, deleteDoc, doc, setDoc, query, orderBy, where, getDocs, serverTimestamp } from 'firebase/firestore';

type DownloadStatus = 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';

interface DownloadItem {
  content_id: number;
  content_type: 'movie' | 'tv' | 'anime';
  status?: DownloadStatus;
  progress?: number;
  file_path?: string | null;
}

export const downloadService = {
  async getDownloads(perfilId: number): Promise<DownloadItem[]> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/downloads`);
    const q = query(ref, orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as DownloadItem);
  },

  async addToDownloads(
    perfilId: number,
    contentId: number,
    type: 'movie' | 'tv' | 'anime',
    options?: { status?: DownloadStatus; progress?: number; file_path?: string | null }
  ) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/downloads`);
    const payload = {
      content_id: contentId,
      content_type: type,
      status: options?.status ?? 'PENDING',
      progress: options?.progress ?? 0,
      file_path: options?.file_path ?? null,
      created_at: serverTimestamp(),
    };
    const res = await addDoc(ref, payload);
    return { id: res.id, ...payload } as any;
  },

  async updateDownloadItem(
    perfilId: number,
    contentId: number,
    type: 'movie' | 'tv' | 'anime',
    updates: { status?: DownloadStatus; progress?: number; file_path?: string | null }
  ) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/downloads`);
    const q = query(ref, where('content_id', '==', contentId), where('content_type', '==', type));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d =>
      setDoc(doc(db, `profiles/${uid}/profiles/${perfilId}/downloads/${d.id}`), { ...updates, updated_at: serverTimestamp() }, { merge: true })
    ));
    return { ok: true } as any;
  },

  async removeFromDownloads(perfilId: number, contentId: number, type: 'movie' | 'tv' | 'anime') {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/downloads`);
    const q = query(ref, where('content_id', '==', contentId), where('content_type', '==', type));
    const snap = await getDocs(q);
    const batchDeletes = snap.docs.map(d => deleteDoc(doc(db, `profiles/${uid}/profiles/${perfilId}/downloads/${d.id}`)));
    await Promise.all(batchDeletes);
    return { ok: true } as any;
  },

  async isInDownloads(perfilId: number, contentId: number, type: 'movie' | 'tv' | 'anime'): Promise<boolean> {
    try {
      const downloads = await this.getDownloads(perfilId);
      return downloads.some(item => item.content_id === contentId && item.content_type === type);
    } catch {
      return false;
    }
  },

  async addAnimeToDownloads(
    perfilId: number,
    contentId: number,
    seasons: Array<{ season_number: number; episodes: Array<{ episode_number: number; name: string }> }>
  ): Promise<void> {
    await this.addToDownloads(perfilId, contentId, 'anime', {
      status: 'PENDING',
      progress: 0,
      file_path: JSON.stringify({
        type: 'full_anime',
        total_seasons: seasons.length,
        total_episodes: seasons.reduce((acc, season) => acc + season.episodes.length, 0)
      })
    });
    for (const season of seasons) {
      for (const episode of season.episodes) {
        await this.addToDownloads(perfilId, contentId, 'anime', {
          status: 'PENDING',
          progress: 0,
          file_path: JSON.stringify({
            type: 'episode',
            season_number: season.season_number,
            episode_number: episode.episode_number,
            episode_name: episode.name
          })
        });
      }
    }
  },

  async addAnimeSeasonToDownloads(
    perfilId: number,
    contentId: number,
    seasonNumber: number,
    episodes: Array<{ episode_number: number; name: string }>
  ): Promise<void> {
    await this.addToDownloads(perfilId, contentId, 'anime', {
      status: 'PENDING',
      progress: 0,
      file_path: JSON.stringify({
        type: 'season',
        season_number: seasonNumber,
        total_episodes: episodes.length
      })
    });
    for (const episode of episodes) {
      await this.addToDownloads(perfilId, contentId, 'anime', {
        status: 'PENDING',
        progress: 0,
        file_path: JSON.stringify({
          type: 'episode',
          season_number: seasonNumber,
          episode_number: episode.episode_number,
          episode_name: episode.name
        })
      });
    }
  },

  async addAnimeEpisodeToDownloads(
    perfilId: number,
    contentId: number,
    seasonNumber: number,
    episode: { episode_number: number; name: string }
  ): Promise<void> {
    await this.addToDownloads(perfilId, contentId, 'anime', {
      status: 'PENDING',
      progress: 0,
      file_path: JSON.stringify({
        type: 'episode',
        season_number: seasonNumber,
        episode_number: episode.episode_number,
        episode_name: episode.name,
      }),
    });
  },
};
