import { useEffect, useState } from 'react';
import { readerRetryDelay } from '../utils/readerRetry';

export function useReaderImage(uri: string, active = true) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setAttempt(0); setLoaded(false); setFailed(false); setPaused(false); }, [uri]);
  useEffect(() => {
    if (!uri || !active || paused || loaded) return;
    const timer = setTimeout(() => {
      if (failed) { setFailed(false); setAttempt(value => value + 1); }
      else setFailed(true);
    }, failed ? readerRetryDelay(attempt + 1) : 30000);
    return () => clearTimeout(timer);
  }, [uri, attempt, active, loaded, failed, paused]);
  let source = uri;
  if (attempt > 0) {
    try {
      const url = new URL(uri);
      // Signed third-party URLs must remain untouched.
      if (url.pathname === '/api/proxy/manga-image') { url.searchParams.set('_retry', String(attempt)); source = url.href; }
    } catch {}
  }
  return { source, attempt, loaded, failed, paused, setPaused,
    onLoad: () => { setLoaded(true); setFailed(false); },
    onError: () => { setLoaded(false); setFailed(true); },
    retry: () => { setLoaded(false); setFailed(false); setPaused(false); setAttempt(value => value + 1); } };
}
