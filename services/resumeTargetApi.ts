import { backendClient } from './backendClient';

export type ResumeTarget = {
  animeId: number;
  episodeId: number | null;
  season: number | null;
  episodeNumber: number | null;
  resumeTime: number;
};

export const resumeTargetApi = {
  async get(profileId: number, animeId: number) {
    const { data } = await backendClient.get(`/resume-target/${animeId}`, {
      headers: { 'x-profile-id': String(profileId) },
      params: { profileId },
    });
    const row = (data || {}) as ResumeTarget;
    return {
      animeId: Number(row.animeId || animeId),
      episodeId: row.episodeId == null ? null : Number(row.episodeId),
      season: row.season == null ? null : Number(row.season),
      episodeNumber: row.episodeNumber == null ? null : Number(row.episodeNumber),
      resumeTime: Number(row.resumeTime || 0),
    } as ResumeTarget;
  },
};

