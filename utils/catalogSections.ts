type CatalogEntry = { id: string | number; slug?: string; status?: string };
const key = (item: CatalogEntry) => item.slug || String(item.id);
const hash = (text: string) => {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
};
export function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dailySelection<T extends CatalogEntry>(items: T[], day: string, limit: number): T[] {
  // Rank stable IDs rather than array positions, so reloads/reordering preserve today's picks.
  const unique = [...new Map(items.map(item => [key(item), item])).values()];
  return unique.map(item => ({ item, score: hash(`${day}:${key(item)}`) }))
    .sort((a, b) => a.score - b.score || (key(a.item) < key(b.item) ? -1 : 1))
    .slice(0, Math.max(0, limit)).map(entry => entry.item);
}
export function catalogSections<T extends CatalogEntry>(items: T[], day: string, size = 8): { key: string; title: string; items: T[] }[] {
  const used = new Set<string>();
  const take = (source: T[]) => source.filter(item => !used.has(key(item))).slice(0, size).filter(item => {
    if (used.has(key(item))) return false;
    used.add(key(item)); return true;
  });
  const latest = take(items);
  // Reserve the status-specific row before assigning the daily discovery rows.
  const finished = take(items.filter(item => /finalizad|finished|completed/i.test(item.status || '')));
  const daily = take(dailySelection(items, `${day}:selection`, items.length));
  const discover = take(dailySelection(items, `${day}:discover`, items.length));
  return [
    { key: 'latest', title: 'Recién actualizados', items: latest },
    { key: 'daily', title: 'Selección del día', items: daily },
    { key: 'finished', title: 'Series finalizadas', items: finished },
    { key: 'discover', title: 'Para descubrir', items: discover },
  ].filter(section => section.items.length > 0);
}
