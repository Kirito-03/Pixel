// Short copy for artwork overlays; full synopses remain available in details.
const PLATFORM_ATTR_RE =
  /\((?:Source|Fuente|Vía|Via|Adapted from|Adaptado de)\s*:[\s\S]*?\)|\[(?:Written by|Escrito por)[\s\S]*?\]|\((?:Crunchyroll|Netflix|HIDIVE|Funimation|Muse Asia|Ani-One|Aniplex|Amazon Prime Video|Disney\+|Bilibili|AniList|MyAnimeList|ANN|Wikipedia)\)/gi;

export function cleanSynopsisText(value?: string | null): string {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(PLATFORM_ATTR_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function briefSynopsis(value?: string | null, limit = 165): string {
  const text = cleanSynopsisText(value).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit - 1), boundary = prefix.lastIndexOf(' ');
  return (boundary > limit * 0.6 ? prefix.slice(0, boundary) : prefix).replace(/[,;:.!?—–-]+$/, '') + '…';
}
