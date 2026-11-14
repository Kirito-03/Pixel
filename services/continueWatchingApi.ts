import { watchProgressStore } from './watchProgressStore';
import { backendClient } from './backendClient';
export interface ContinueWatchingEntry {
  anime_id: number; episode_id: number; current_time: number; duration: number;
  progress_percent: number; thumbnail: string; title: string; episode_number: number | null;
  season: number | null; updated_at: string; position_known: boolean;
}
export const continueWatchingApi = {
  async get(profileId: number): Promise<ContinueWatchingEntry[]> {
    const progress = await watchProgressStore.list(profileId);
    return Promise.all(progress.map(async row => {
      let title = row.title || '', thumbnail = row.thumbnail || '';
      if (!title || !thumbnail) {
        try {
          const { data } = await backendClient.get(`/api/catalog/anime/${row.anime_id}`, { withCredentials: false });
          title ||= data?.title || ''; thumbnail ||= data?.banner_url || data?.poster_url || '';
        } catch { /* Retain saved position even if metadata is unavailable. */ }
      }
      return { ...row, title: title || `Anime #${row.anime_id}`, thumbnail, episode_number: row.episode_number ?? null,
        season: row.season ?? null, updated_at: row.updated_at || '', position_known: row.position_known !== false,
        progress_percent: row.duration > 0 ? Math.min(100, row.current_time / row.duration * 100) : 0 };
    }));
  },
};
