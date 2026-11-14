export interface EpisodeLike {
  number: number;
}

/**
 * Parses an episode number into a finite number without truncating decimals.
 * Returns null for non-finite or non-numeric values.
 */
export function normalizeEpisodeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Returns a new array of episodes sorted in ascending numeric order
 * (e.g. 0, 1, 1.5, 2, 10) without mutating the input array.
 * Duplicate episode numbers are deduplicated, keeping the first occurrence.
 */
export function sortEpisodesAscending<T extends EpisodeLike>(
  episodes: readonly T[] | null | undefined
): T[] {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return [];
  }

  const seen = new Set<number>();
  const valid: Array<{ item: T; num: number }> = [];

  for (const item of episodes) {
    if (!item) continue;
    const num = normalizeEpisodeNumber(item.number);
    if (num === null || seen.has(num)) continue;
    seen.add(num);
    valid.push({ item, num });
  }

  valid.sort((a, b) => a.num - b.num);
  return valid.map((entry) => entry.item);
}

/**
 * Returns the first episode in ascending numeric order without mutating the input.
 */
export function getFirstEpisode<T extends EpisodeLike>(
  episodes: readonly T[] | null | undefined
): T | null {
  const sorted = sortEpisodesAscending(episodes);
  return sorted.length > 0 ? sorted[0] : null;
}

/**
 * Finds the immediate previous and next episodes in the real ascending numeric sequence.
 */
export function getAdjacentEpisodes<T extends EpisodeLike>(
  episodes: readonly T[] | null | undefined,
  currentEpisodeNumber: number
): { previous: T | null; next: T | null } {
  const currentNum = normalizeEpisodeNumber(currentEpisodeNumber);
  if (currentNum === null) {
    return { previous: null, next: null };
  }

  const sorted = sortEpisodesAscending(episodes);
  const index = sorted.findIndex(
    (ep) => normalizeEpisodeNumber(ep.number) === currentNum
  );

  if (index === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: index > 0 ? sorted[index - 1] : null,
    next: index < sorted.length - 1 ? sorted[index + 1] : null,
  };
}

/**
 * Returns the next episode in the ascending numeric sequence, or null if on the last episode.
 */
export function getNextEpisode<T extends EpisodeLike>(
  episodes: readonly T[] | null | undefined,
  currentEpisodeNumber: number
): T | null {
  return getAdjacentEpisodes(episodes, currentEpisodeNumber).next;
}

/**
 * Returns the previous episode in the ascending numeric sequence, or null if on the first episode.
 */
export function getPreviousEpisode<T extends EpisodeLike>(
  episodes: readonly T[] | null | undefined,
  currentEpisodeNumber: number
): T | null {
  return getAdjacentEpisodes(episodes, currentEpisodeNumber).previous;
}
