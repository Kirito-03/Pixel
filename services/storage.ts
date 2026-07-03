/**
 * Storage Abstraction - Unified Fallback
 * 
 * Uses AsyncStorage with an in-memory cache to simulate synchronous reads across ALL platforms.
 * This completely removes react-native-mmkv to bypass native build/JSI binding issues.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const cache = new Map<string, string>();
let _initialized = false;

// Pre-load all keys into cache as a fire-and-forget operation on first access.
const ensureLoaded = () => {
  if (_initialized) return;
  _initialized = true;
  AsyncStorage.getAllKeys()
    .then((keys) => AsyncStorage.multiGet(keys))
    .then((pairs) => {
      for (const [k, v] of pairs) {
        if (v !== null) cache.set(k, v);
      }
    })
    .catch(() => {});
};

export const Storage = {
  getString(key: string): string | undefined {
    ensureLoaded();
    return cache.get(key);
  },

  setString(key: string, value: string): void {
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
    cache.set(key, str);
    AsyncStorage.setItem(key, str).catch(() => {});
  },

  delete(key: string): void {
    cache.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
  },

  clearAll(): void {
    cache.clear();
    AsyncStorage.clear().catch(() => {});
  },

  getAllKeys(): string[] {
    ensureLoaded();
    return Array.from(cache.keys());
  }
};
