export const readerRetryDelay = (attempt: number) => Math.min(30000, 3000 * 2 ** Math.min(4, Math.max(0, attempt - 1)));

export function waitForReaderRetry(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('cancelled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function loadReaderPages({ request, signal, onRetry, wait = waitForReaderRetry }: {
  request: () => Promise<{ pages: string[] }>;
  signal: AbortSignal;
  onRetry: (attempt: number, delay: number) => void;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  let attempt = 0;
  while (!signal.aborted) {
    try {
      const result = await request();
      if (signal.aborted) return null;
      if (Array.isArray(result?.pages) && result.pages.length) return result.pages;
    } catch (error: any) {
      if (signal.aborted) return null;
      const status = Number(error?.response?.status);
      if ([400, 401, 403, 404, 410].includes(status)) throw error;
    }
    if (signal.aborted) return null;
    const delay = readerRetryDelay(++attempt);
    onRetry(attempt, delay);
    try { await wait(delay, signal); } catch { return null; }
  }
  return null;
}
