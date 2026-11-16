// Short copy for artwork overlays; full synopses remain available in details.
export function briefSynopsis(value?: string | null, limit = 165): string {
  const text = String(value || '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/\(Source:[\s\S]*?\)|\[Written by[\s\S]*?\]/gi, '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit - 1), boundary = prefix.lastIndexOf(' ');
  return (boundary > limit * 0.6 ? prefix.slice(0, boundary) : prefix).replace(/[,;:.!?—–-]+$/, '') + '…';
}
