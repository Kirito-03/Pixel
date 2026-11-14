import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

export type OfflineDownloadState = 'NONE' | 'DOWNLOADING' | 'DOWNLOADED' | 'FAILED';

export interface OfflineEpisodeDownload {
  episodeId: number;
  animeId: number;
  season: number;
  episodeNumber: number;
  title: string;
  localUri: string;
  createdAt: number;
}

type DownloadIndex = Record<string, OfflineEpisodeDownload>;

function key(profileId: number) {
  return `offlineDownloads:v1:${profileId}`;
}

async function readIndex(profileId: number): Promise<DownloadIndex> {
  const raw = await AsyncStorage.getItem(key(profileId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as DownloadIndex) : {};
  } catch {
    return {};
  }
}

async function writeIndex(profileId: number, index: DownloadIndex) {
  await AsyncStorage.setItem(key(profileId), JSON.stringify(index));
}

function sanitizeName(s: string) {
  return String(s || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function ensureDir(dirUri: string) {
  const info = await FileSystem.getInfoAsync(dirUri);
  if (info.exists) return;
  await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
}

export const offlineDownloads = {
  async getEpisode(profileId: number, episodeId: number) {
    const index = await readIndex(profileId);
    return index[String(episodeId)] ?? null;
  },

  async getEpisodeUri(profileId: number, episodeId: number) {
    const entry = await offlineDownloads.getEpisode(profileId, episodeId);
    if (!entry?.localUri) return null;
    const info = await FileSystem.getInfoAsync(entry.localUri);
    if (!info.exists) return null;
    return entry.localUri;
  },

  async removeEpisode(profileId: number, episodeId: number) {
    const index = await readIndex(profileId);
    const entry = index[String(episodeId)];
    if (entry?.localUri) {
      try {
        const info = await FileSystem.getInfoAsync(entry.localUri);
        if (info.exists) await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
      } catch { }
    }
    delete index[String(episodeId)];
    await writeIndex(profileId, index);
  },

  async downloadEpisode(
    profileId: number,
    payload: { animeId: number; season: number; episodeId: number; episodeNumber: number; title: string; url: string },
    onProgress?: (p: number) => void
  ) {
    const root = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '');
    if (!root) throw new Error('No filesystem directory available');

    const dir = `${root}offline/${profileId}/${payload.animeId}/${payload.season}/`;
    await ensureDir(dir);

    const filename = `${payload.episodeNumber.toString().padStart(2, '0')}-${payload.episodeId}-${sanitizeName(payload.title)}.mp4`;
    const localUri = `${dir}${filename}`;

    const existing = await FileSystem.getInfoAsync(localUri);
    if (existing.exists) {
      const index = await readIndex(profileId);
      index[String(payload.episodeId)] = {
        episodeId: payload.episodeId,
        animeId: payload.animeId,
        season: payload.season,
        episodeNumber: payload.episodeNumber,
        title: payload.title,
        localUri,
        createdAt: Date.now(),
      };
      await writeIndex(profileId, index);
      return localUri;
    }

    const resumable = FileSystem.createDownloadResumable(
      payload.url,
      localUri,
      {},
      (progress) => {
        const total = progress.totalBytesExpectedToWrite || 0;
        const written = progress.totalBytesWritten || 0;
        if (total > 0 && onProgress) onProgress(written / total);
      }
    );

    const result = await resumable.downloadAsync();
    if (!result?.uri) throw new Error('Download failed');

    const index = await readIndex(profileId);
    index[String(payload.episodeId)] = {
      episodeId: payload.episodeId,
      animeId: payload.animeId,
      season: payload.season,
      episodeNumber: payload.episodeNumber,
      title: payload.title,
      localUri: result.uri,
      createdAt: Date.now(),
    };
    await writeIndex(profileId, index);
    return result.uri;
  },

  async getSeasonSummary(profileId: number, episodeIds: number[]) {
    const index = await readIndex(profileId);
    let downloaded = 0;
    for (const id of episodeIds) {
      const entry = index[String(id)];
      if (!entry?.localUri) continue;
      const info = await FileSystem.getInfoAsync(entry.localUri);
      if (info.exists) downloaded++;
    }
    return { downloaded, total: episodeIds.length };
  },
};

