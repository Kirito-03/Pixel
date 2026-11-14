import { watchProgressStore } from './watchProgressStore';
import { backendClient } from './backendClient';
export type ResumeTarget = { animeId: number; episodeId: number | null; season: number | null; episodeNumber: number | null; resumeTime: number };
export const resumeTargetApi = {
  async get(profileId: number, animeId: number): Promise<ResumeTarget> {
    const saved = await watchProgressStore.get(profileId, animeId);
    const finished = !!saved && saved.duration > 0 && saved.current_time / saved.duration >= 0.95;
    if (saved && !finished && (saved.current_time > 0 || saved.position_known === false)) return {
      animeId, episodeId: saved.episode_id, season: saved.season ?? null, episodeNumber: saved.episode_number ?? null,
      resumeTime: saved.position_known === false ? 0 : saved.current_time,
    };
    const { data } = await backendClient.get(`/api/catalog/anime/${animeId}/episodes`, { withCredentials: false });
    const episodes = [...(Array.isArray(data?.episodes) ? data.episodes : [])].sort((a,b) => Number(a.season || 1) - Number(b.season || 1) || Number(a.episode_number) - Number(b.episode_number));
    const current = finished ? episodes.findIndex(ep => Number(ep.id) === saved!.episode_id) : -1;
    const available = episodes.slice(current + 1).find(ep => ep.stream_url || ep.video_url || ep.external_servers?.length);
    return { animeId, episodeId: available ? Number(available.id) : null, season: available ? Number(available.season || 1) : null,
      episodeNumber: available ? Number(available.episode_number) : null, resumeTime: 0 };
  },
};
