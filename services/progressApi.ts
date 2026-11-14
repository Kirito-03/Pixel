import { backendClient } from './backendClient';

export const progressApi = {
  async save(profileId: number, payload: { anime_id: number; episode_id: number; current_time: number; duration: number }) {
    const body = {
      userId: profileId,
      animeId: payload.anime_id,
      episodeId: payload.episode_id,
      currentTime: payload.current_time,
      duration: payload.duration,
      anime_id: payload.anime_id,
      episode_id: payload.episode_id,
      current_time: payload.current_time,
    };
    const { data } = await backendClient.post('/progress', body, {
      headers: { 'x-profile-id': String(profileId) },
    });
    return data as { ok: true };
  },
};
