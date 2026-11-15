import { AnimeSeason } from '../types';
import { ResumeTarget } from './resumeTargetApi';

export function seriesPlaybackTarget(seasons: AnimeSeason[], resume?: ResumeTarget | null) {
  const ordered = [...seasons].sort((a, b) => a.season - b.season);
  for (const season of ordered) {
    const episodes = [...season.episodes].sort((a, b) => a.number - b.number);
    const episode = resume
      ? episodes.find(ep => String(ep.id) === String(resume.episodeId))
      : episodes.find(ep => !!ep.url || !!ep.external_servers?.length);
    if (episode) return { episode, season, resumeTime: Math.max(0, Number(resume?.resumeTime) || 0) };
  }
  return null;
}
