import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Expo's entry filename may stay unchanged when only its lazy chunk map changes.
// Fingerprint actual bytes before serving it with immutable caching.
export function finalizeWebExport(directory) {
 const htmlPath = path.join(directory, 'index.html');
 let html = fs.readFileSync(htmlPath, 'utf8');
 const entries = [...new Set([...html.matchAll(/(?:src|href)=["']\/?(_expo\/static\/js\/web\/index-[a-f0-9]+\.js)["']/g)].map(match => match[1]))];
 if (!entries.length) throw Error('No web entry found; refusing to publish an unverified export');
 for (const relative of entries) {
  const bytes = fs.readFileSync(path.join(directory, relative));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0,32);
  const next = relative.replace(/index-[a-f0-9]+\.js$/, `index-${hash}.js`);
  if (next !== relative) fs.writeFileSync(path.join(directory, next), bytes);
  html = html.split(relative).join(next);
 }
 fs.writeFileSync(htmlPath, html);
 return entries.length;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 console.log(`Fingerprint verified: ${finalizeWebExport(path.resolve(process.argv[2] || 'dist'))} web entry`);
}
