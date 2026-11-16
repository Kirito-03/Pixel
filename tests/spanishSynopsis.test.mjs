import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSynopsis, synopsisLanguage, synopsisHash, splitTranslationSegments, withSpanishSynopses, translateSynopsisSegment, runSpanishSynopsisBatch } from '../server/services/spanishSynopsisService.js';
const english = 'This is the story of a girl who lives in the city and discovers her own power.';
function database(used = 0) {
 const records = new Map(), usage = []; let queries = 0;
 const pool = { records, usage, get queries() { return queries; }, async query(sql, values = []) {
  queries++;
  if (sql.includes('SELECT source_hash, translated_text')) return { rows: values[0].filter(key => records.has(key)).map(key => records.get(key)) };
  if (sql.includes('jsonb_to_recordset')) { for (const record of JSON.parse(values[0])) records.set(record.source_hash, { ...record, status: 'pending' }); }
  if (sql.includes('AS used')) return { rows: [{ used: used + usage.reduce((a,b) => a+b,0) }] };
  if (sql.includes('SELECT source_hash,segments')) return { rows: [...records.values()].filter(row => row.status !== 'ready' && !row.deferred) };
  if (sql.includes("status='working'")) records.get(values[0]).status = 'working';
  if (sql.includes('INSERT INTO synopsis_translation_usage')) usage.push(values[0]);
  if (sql.includes('SET segments=')) Object.assign(records.get(values[0]), { segments: JSON.parse(values[1]), status: values[2], translated_text: values[3] });
  if (sql.includes('failures=failures+1')) Object.assign(records.get(values[0]), { status: 'pending', deferred: true });
  return { rows: [] };
 }, async connect() { return { query: pool.query, release() {} }; } };
 return pool;
}
const response = text => ({ ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: text } }) });
test('source hashing normalizes whitespace, rejects stale source reuse, and splitting respects UTF8 limit', () => {
 assert.equal(synopsisHash('The story\n of her life'), synopsisHash('The story of her life'));
 assert.notEqual(synopsisHash(english), synopsisHash(english + ' New season.'));
 assert.equal(synopsisLanguage(english), 'en');
 assert.equal(synopsisLanguage('Esta es la historia de una joven que vive en la ciudad con su familia.'), 'es');
 const source = ('日本語🎬 descripción '.repeat(70)).trim();
 const parts = splitTranslationSegments(source);
 assert.ok(parts.length > 2 && parts.every(part => Buffer.byteLength(part.text) <= 480));
 assert.equal(parts.map(part => part.text).join(' ').replace(/\s+/g,' '), source);
 assert.equal(cleanSynopsis('<b>La historia</b> &amp; la música'), 'La historia & la música');
});
test('catalog visits only queue SQL; finished translations survive new visits and changed sources are queued separately', async () => {
 const db = database(); let requests = 0;
 const row = { id: 1, description: english, banner_url: 'banner' };
 let rows = await withSpanishSynopses(db, [row]);
 assert.equal(rows[0].translation_status, 'pending'); assert.equal(db.records.size, 1);
 await runSpanishSynopsisBatch(db, { request: async url => { requests++; assert.equal(url.hostname, 'api.mymemory.translated.net'); assert.equal(url.searchParams.get('langpair'), 'en|es'); return response('Es la historia de una joven en la ciudad.'); } });
 rows = await withSpanishSynopses(db, [row]);
 await withSpanishSynopses(db, [row]);
 assert.equal(requests, 1); assert.equal(db.usage.length, 1);
 assert.equal(rows[0].description, 'Es la historia de una joven en la ciudad.');
 assert.equal(rows[0].description_original, english);
 rows = await withSpanishSynopses(db, [{ ...row, description: english + ' The story has changed.' }]);
 assert.equal(rows[0].translation_status, 'pending'); assert.equal(db.records.size, 2);
});
test('a restarted worker resumes stored segments and never publishes an incomplete synopsis', async () => {
 const db = database(); const row = { description: english.repeat(18) };
 await withSpanishSynopses(db, [row]); let requests = 0;
 const request = async () => { requests++; return response('Fragmento traducido.'); };
 await runSpanishSynopsisBatch(db, { maxRequests: 1, request });
 const partial = await withSpanishSynopses(db, [row]);
 assert.equal(partial[0].description, row.description); assert.equal(partial[0].translation_status, 'pending');
 const record = [...db.records.values()][0];
 const total = record.segments.length;
 await runSpanishSynopsisBatch(db, { maxRequests: 12, request });
 assert.equal(requests, total); assert.equal(record.status, 'ready');
 await runSpanishSynopsisBatch(db, { request }); assert.equal(requests, total);
});
test('free allowance blocks external calls and failed responses cannot enter the cache as Spanish', async () => {
 const db = database(4995); await withSpanishSynopses(db, [{ description: english }]);
 let requests = 0;
 await runSpanishSynopsisBatch(db, { request: async () => { requests++; return response('ok'); } });
 assert.equal(requests, 0);
 const failing = database(); await withSpanishSynopses(failing, [{ description: english }]);
 await runSpanishSynopsisBatch(failing, { request: async () => response('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS') });
 const record = [...failing.records.values()][0];
 assert.equal(record.status, 'pending'); assert.equal(record.translated_text, undefined);
 assert.equal(failing.usage.length, 1); assert.equal(record.deferred, true);
 await assert.rejects(translateSynopsisSegment('a'.repeat(501), async () => { throw Error('must not request'); }), /limit/);
});
