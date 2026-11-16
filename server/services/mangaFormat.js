// Read only explicit publication metadata; a generic /manga/ URL or title is not a type.
export function normalizePublicationType(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return ({ comic: 'Cómic', 'cómic': 'Cómic', comics: 'Cómic', novel: 'Novela', novela: 'Novela', 'web novel': 'Novela', 'novela web': 'Novela', doujinshi: 'Doujinshi', doujin: 'Doujinshi', manga: 'Manga', manhwa: 'Manhwa', manwha: 'Manhwa', manhua: 'Manhua', webtoon: 'Webtoon', 'light novel': 'Novela ligera', 'novela ligera': 'Novela ligera', 'one shot': 'One-shot', oneshot: 'One-shot' })[text] || null;
}
export function extractPublicationType($, scope) {
  const root = scope || $('article.type-wp-manga, .type-wp-manga').first();
  const metadata = root.length ? root : $.root();
  const candidates = [];
  (scope ? root.find('[data-publication-type], .ac-type, .manga-type, .manga-type-badge') : metadata.find('.manga-type, .manga-type-badge').not('.acard *, .agrid *')).each((_, el) => candidates.push($(el).attr('data-publication-type') || $(el).text()));
  metadata.find('.post-content_item, .summary-row').each((_, el) => {
    const label = $(el).find('.summary-heading, .summary-label').text().trim().replace(/:$/, '').toLowerCase();
    if (['type', 'tipo', 'formato'].includes(label)) candidates.push($(el).find('.summary-content, .summary-value').text());
  });
  metadata.find('a[href*="/manga-genre/"], a[href*="/genre/"]').filter((_, el) => !$(el).closest('.acard, .agrid, nav, aside').length).each((_, el) => candidates.push($(el).text()));
  return candidates.map(normalizePublicationType).find(Boolean) || null;
}
