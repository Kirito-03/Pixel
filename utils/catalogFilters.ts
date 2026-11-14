type FilterableItem = { title: string; genres?: string[] };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function catalogCategories(items: FilterableItem[]): string[] {
  const labels = new Map<string, string>();
  for (const item of items) {
    for (const raw of Array.isArray(item.genres) ? item.genres : []) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const label = raw.trim();
      if (!labels.has(normalize(label))) labels.set(normalize(label), label);
    }
  }
  return [...labels.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

export function filterCatalog<T extends FilterableItem>(items: T[], query: string, category: string | null): T[] {
  const search = normalize(query);
  const selected = category ? normalize(category) : null;
  return items.filter(item => (!search || normalize(item.title || '').includes(search)) &&
    (!selected || (Array.isArray(item.genres) && item.genres.some(genre => typeof genre === 'string' && normalize(genre) === selected))));
}
