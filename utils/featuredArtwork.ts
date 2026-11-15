// Prefer artwork suitable for a large hero. Preserve the shuffled order within each group.
export function prioritizeFeaturedArtwork<T extends { poster_url?: string | null; banner_url?: string | null }>(items: T[]): T[] {
  const quality = (item: T) => {
    const smallPoster = /\/cover\/medium\//i.test(item.poster_url || '');
    const banner = item.banner_url || '';
    const realBanner = !!banner && banner !== item.poster_url && !/\/cover\/|myanimelist\.net\/images\/anime\//i.test(banner);
    return (realBanner ? 0 : 2) + (smallPoster ? 1 : 0);
  };
  return [...items].sort((a, b) => quality(a) - quality(b));
}
