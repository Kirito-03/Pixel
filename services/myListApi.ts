import { backendClient } from './backendClient';

export interface MyListEntry {
  content_id: string | number;
  content_type: 'movie' | 'tv' | 'anime' | 'manga';
  added_at: string;
  anime_title?: string | null;
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

export const myListApi = {
  async getMyList(profileId: number) {
    const { data } = await backendClient.get('/my-list', {
      headers: { 'x-profile-id': String(profileId) },
    });
    const rows = (Array.isArray(data) ? data : []) as MyListEntry[];
    return rows.map((row) => ({
      ...row,
      content_id: row.content_type === 'manga' ? String(row.content_id) : Number(row.content_id),
      total_episodes: row.total_episodes === null ? null : Number(row.total_episodes),
      episode_id: row.episode_id === null ? null : Number(row.episode_id),
      season: row.season === null ? null : Number(row.season),
      episode_number: row.episode_number === null ? null : Number(row.episode_number),
      current_time: row.current_time === null ? null : Number(row.current_time),
      duration: row.duration === null ? null : Number(row.duration),
      progress_percent: row.progress_percent === null ? null : Number(row.progress_percent),
    }));
  },

  async add(profileId: number, contentId: string | number, contentType: 'movie' | 'tv' | 'anime' | 'manga') {
    const { data } = await backendClient.post(
      '/my-list',
      { content_id: contentId, content_type: contentType },
      { headers: { 'x-profile-id': String(profileId) } }
    );
    return data as { ok: true };
  },

  async remove(profileId: number, contentId: string | number, contentType: 'movie' | 'tv' | 'anime' | 'manga') {
    const { data } = await backendClient.delete(`/my-list/${contentId}`, {
      headers: { 'x-profile-id': String(profileId) },
      params: { type: contentType },
    });
    return data as { ok: true };
  },
};
