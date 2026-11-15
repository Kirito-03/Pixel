import { AnimeEpisode, VideoSource } from '../types';

export function episodePlaybackSources(episode: AnimeEpisode): (VideoSource & { server?: string })[] {
  if (/^(file|content):/i.test(episode.url || '')) return [{ url: episode.url!, server: 'Descargado' }];
  let external: unknown = episode.external_servers;
  if (typeof external === 'string') { try { external = JSON.parse(external); } catch { external = []; } }
  const providers = Array.isArray(external) ? external.filter(source => typeof source?.url === 'string' && /^https?:\/\//i.test(source.url)) : [];
  return providers.length ? providers : episode.url ? [{ url: episode.url, server: 'Principal' }] : [];
}
