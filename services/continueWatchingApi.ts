import { backendClient } from './backendClient';

export interface ContinueWatchingEntry {
  anime_id: number;
  episode_id: number;
  current_time: number;
  duration: number;
  progress_percent: number | string;
  thumbnail: string;
  title: string;
  episode_number: number | null;
  season: number | null;
  updated_at: string;
}

export const continueWatchingApi = {
  async get(userId: number) {
    const { data } = await backendClient.get('/continue-watching', {
      headers: { 'x-profile-id': String(userId) },
      params: { userId },
    });
    const rows = (Array.isArray(data) ? data : []) as ContinueWatchingEntry[];
    return rows.map((row) => ({
      ...row,
      anime_id: Number(row.anime_id),
      episode_id: Number(row.episode_id),
      current_time: Number(row.current_time || 0),
      duration: Number(row.duration || 0),
      progress_percent: Number(row.progress_percent || 0),
      episode_number: row.episode_number === null ? null : Number(row.episode_number),
      season: row.season === null ? null : Number(row.season),
    }));
  },
};

