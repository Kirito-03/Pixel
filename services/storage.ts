/**
 * Storage Abstraction - Unified Fallback
 * 
 * Uses AsyncStorage with an in-memory cache to simulate synchronous reads across ALL platforms.
 * This completely removes react-native-mmkv to bypass native build/JSI binding issues.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const cache = new Map<string, string>();
let loading: Promise<void> | null = null;
let hydrated = false;
let cleared = false;
const changedDuringLoad = new Set<string>();

// Preserve writes/deletes made while the asynchronous initial snapshot is loading.
const ensureLoaded = (): Promise<void> => {
  if (!loading) {
    loading = AsyncStorage.getAllKeys()
      .then(keys => AsyncStorage.multiGet(keys))
      .then(pairs => {
        if (cleared) return;
        for (const [key, value] of pairs) {
          if (value !== null && !changedDuringLoad.has(key)) cache.set(key, value);
        }
      })
      .catch(() => {})
      .finally(() => { hydrated = true; changedDuringLoad.clear(); });
  }
  return loading;
};
const markChanged = (key: string) => { if (!hydrated) changedDuringLoad.add(key); };

export const Storage = {
  ready: ensureLoaded,
  getString(key: string): string | undefined {
    ensureLoaded();
    return cache.get(key);
  },

  setString(key: string, value: string): void {
    markChanged(key);
    cache.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => {});
  },

  getObject<T = unknown>(key: string): T | undefined {
    ensureLoaded();
    const raw = cache.get(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },

  setObject(key: string, value: unknown): void {
    const str = JSON.stringify(value);
    markChanged(key);
    cache.set(key, str);
    AsyncStorage.setItem(key, str).catch(() => {});
  },

  delete(key: string): void {
    markChanged(key);
    cache.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
  },

  clearAll(): void {
    if (!hydrated) cleared = true;
    cache.clear();
    AsyncStorage.clear().catch(() => {});
  },

  getAllKeys(): string[] {
    ensureLoaded();
    return Array.from(cache.keys());
  }
};
