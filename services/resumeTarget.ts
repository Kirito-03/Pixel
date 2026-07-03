import { resumeTargetApi } from './resumeTargetApi';

export async function getResumeTarget(animeId: number, profileId: number) {
  return resumeTargetApi.get(profileId, animeId);
}

