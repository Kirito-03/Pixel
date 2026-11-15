// Read only explicit publication metadata; a generic /manga/ URL or title is not a type.
export function normalizePublicationType(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return ({ manga: 'Manga', manhwa: 'Manhwa', manwha: 'Manhwa', manhua: 'Manhua', webtoon: 'Webtoon', 'light novel': 'Novela ligera', 'novela ligera': 'Novela ligera', 'one shot': 'One-shot', oneshot: 'One-shot' })[text] || null;
}
export function extractPublicationType($, scope) {
  const root = scope || $.root();
  const candidates = [];
  root.find('[data-publication-type], .ac-type, .manga-type, .manga-type-badge').each((_, el) => candidates.push($(el).attr('data-publication-type') || $(el).text()));
  root.find('.post-content_item, .summary-row').each((_, el) => {
    const label = $(el).find('.summary-heading, .summary-label').text().trim().replace(/:$/, '').toLowerCase();
    if (['type', 'tipo', 'formato'].includes(label)) candidates.push($(el).find('.summary-content, .summary-value').text());
  });
  root.find('a[href*="/manga-genre/"], a[href*="/genre/"]').each((_, el) => candidates.push($(el).text()));
  return candidates.map(normalizePublicationType).find(Boolean) || null;
}
