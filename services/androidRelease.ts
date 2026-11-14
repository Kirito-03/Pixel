export interface AndroidRelease {
  version: string;
  versionCode: number;
  downloadUrl: string;
  sha256: string;
  size: number;
  notes: string;
}
export const RELEASE_ORIGIN = 'https://pixelnosekai.com';
export function parseAndroidRelease(value: any): AndroidRelease {
  if (!value || !Number.isSafeInteger(value.versionCode) || value.versionCode < 1 ||
      typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version) ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !Number.isSafeInteger(value.size) || value.size < 1 ||
      value.downloadUrl !== `${RELEASE_ORIGIN}/api/app-release/android/download?build=${value.versionCode}`) {
    throw new Error('La información de la actualización no es válida.');
  }
  return { version: value.version, versionCode: value.versionCode, downloadUrl: value.downloadUrl,
    sha256: value.sha256, size: value.size, notes: typeof value.notes === 'string' ? value.notes.slice(0, 1500) : '' };
}
export async function fetchAndroidRelease(): Promise<AndroidRelease | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${RELEASE_ORIGIN}/api/app-release/android`, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('No pudimos comprobar la versión. Inténtalo de nuevo.');
    return parseAndroidRelease(await response.json());
  } finally { clearTimeout(timeout); }
}
