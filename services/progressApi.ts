import { watchProgressStore, WatchProgress } from './watchProgressStore';
export const progressApi = {
  async save(profileId: number, payload: WatchProgress) {
    await watchProgressStore.save(profileId, payload);
    return { ok: true as const };
  },
};
