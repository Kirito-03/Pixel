import { backendClient } from './backendClient';

export async function hasInternet(): Promise<boolean> {
  try {
    await backendClient.get('/health', { timeout: 3500 });
    return true;
  } catch {
    return false;
  }
}

export async function canReachUrl(url: string, timeoutMs: number = 3500): Promise<boolean> {
  if (!url) return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal as any });
    if (res.ok) return true;
  } catch { }
  clearTimeout(t);
  const controller2 = new AbortController();
  const t2 = setTimeout(() => controller2.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller2.signal as any });
    return !!res;
  } catch {
    return false;
  } finally {
    clearTimeout(t2);
  }
}
