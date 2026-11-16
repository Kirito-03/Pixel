import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

export const SPANISH_SYNOPSIS_SCHEMA = `
CREATE TABLE IF NOT EXISTS anime_synopsis_es (
 source_hash TEXT PRIMARY KEY, source_text TEXT NOT NULL, segments JSONB NOT NULL,
 translated_text TEXT, status TEXT NOT NULL DEFAULT 'pending', priority INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), translated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS anime_synopsis_es_queue ON anime_synopsis_es(status,next_attempt_at,priority DESC);
CREATE TABLE IF NOT EXISTS synopsis_translation_usage (
 id BIGSERIAL PRIMARY KEY, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), characters INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS synopsis_translation_usage_time ON synopsis_translation_usage(requested_at);
`;
export const cleanSynopsis = value => cheerio.load(String(value || '').replace(/<br\s*\/?\s*>/gi, ' ')).text().replace(/\s+/g, ' ').trim();
export function synopsisLanguage(value) {
 const words = cleanSynopsis(value).toLowerCase().match(/[a-záéíóúüñ]+/g) || [];
 const en = new Set('the is of and to in with his her he she after from who has was will their they that this when by for not an season story'.split(' '));
 const es = new Set('el la los las de del que una un y con sus por para su es en se como tras pero desde al sin cuando historia'.split(' '));
 const english = words.filter(word => en.has(word)).length, spanish = words.filter(word => es.has(word)).length;
 if (spanish >= 3 && spanish > english) return 'es';
 return english >= 2 && english > spanish * 1.3 ? 'en' : null;
}
export const synopsisHash = text => crypto.createHash('sha256').update(cleanSynopsis(text)).digest('hex');
export function splitTranslationSegments(text, limit = 480) {
 const segments = []; let chunk = '';
 for (const word of cleanSynopsis(text).match(/\S+\s*/g) || []) {
  if (Buffer.byteLength(chunk + word) <= limit) { chunk += word; continue; }
  if (chunk.trim()) segments.push(chunk.trim()); chunk = '';
  for (const character of word) {
   if (Buffer.byteLength(chunk + character) > limit) { segments.push(chunk.trim()); chunk = ''; }
   chunk += character;
  }
 }
 if (chunk.trim()) segments.push(chunk.trim());
 return segments.map(text => ({ text, translated: null }));
}
// Reading a catalog only reads/queues database records. External translation happens exclusively in the worker.
export async function withSpanishSynopses(pool, rows) {
 const english = new Map();
 for (const row of rows) if (synopsisLanguage(row.description) === 'en') {
  const source_text = cleanSynopsis(row.description), source_hash = synopsisHash(source_text);
  english.set(source_hash, { source_hash, source_text, segments: splitTranslationSegments(source_text), priority: row.banner_url ? 10 : 0 });
 }
 if (!english.size) return rows.map(row => ({ ...row, description_language: synopsisLanguage(row.description) }));
 try {
  const cache = await pool.query('SELECT source_hash, translated_text, status FROM anime_synopsis_es WHERE source_hash = ANY($1::text[])', [[...english.keys()]]);
  const stored = new Map(cache.rows.map(row => [row.source_hash, row]));
  const missing = [...english.values()].filter(row => !stored.has(row.source_hash));
  if (missing.length) await pool.query(`INSERT INTO anime_synopsis_es(source_hash,source_text,segments,priority)
    SELECT source_hash,source_text,segments,priority FROM jsonb_to_recordset($1::jsonb) AS x(source_hash TEXT,source_text TEXT,segments JSONB,priority INTEGER)
    ON CONFLICT(source_hash) DO NOTHING`, [JSON.stringify(missing)]);
  return rows.map(row => {
   const hash = synopsisHash(row.description), translation = stored.get(hash);
   if (!english.has(hash)) return { ...row, description_language: synopsisLanguage(row.description) };
   const ready = translation?.status === 'ready' && translation.translated_text;
   return { ...row, description: ready || row.description, description_original: row.description,
    description_es: ready || null, description_language: ready ? 'es' : 'en', translation_status: ready ? 'ready' : 'pending' };
  });
 } catch (error) {
  console.warn('[SynopsisES] Cache unavailable:', error.message);
  return rows;
 }
}
async function claimSegment(pool) {
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(728145903)');
  const usage = await client.query("SELECT COALESCE(SUM(characters),0)::int AS used FROM synopsis_translation_usage WHERE requested_at > NOW() - INTERVAL '24 hours'");
  const remaining = 5000 - Number(usage.rows[0].used);
  if (remaining <= 0) { await client.query('COMMIT'); return null; }
  const jobs = await client.query("SELECT source_hash,segments FROM anime_synopsis_es WHERE status != 'ready' AND next_attempt_at <= NOW() ORDER BY priority DESC,created_at FOR UPDATE SKIP LOCKED LIMIT 12");
  for (const job of jobs.rows) {
   const index = job.segments.findIndex(part => !part.translated);
   if (index < 0) continue;
   const text = job.segments[index].text, characters = Buffer.byteLength(text);
   if (characters > remaining) continue;
   await client.query("UPDATE anime_synopsis_es SET status='working',next_attempt_at=NOW()+INTERVAL '10 minutes' WHERE source_hash=$1", [job.source_hash]);
   // Reserve before the request, including failed requests. Several workers cannot exceed the rolling free allowance.
   await client.query('INSERT INTO synopsis_translation_usage(characters) VALUES($1)', [characters]);
   await client.query('COMMIT'); return { ...job, index, text };
  }
  await client.query('COMMIT'); return null;
 } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
 finally { client.release(); }
}
export async function translateSynopsisSegment(text, request = fetch) {
 if (Buffer.byteLength(text) > 500) throw new Error('Translation segment exceeds provider limit');
 const url = new URL('https://api.mymemory.translated.net/get');
 url.searchParams.set('q', text); url.searchParams.set('langpair', 'en|es');
 const response = await request(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
 const data = await response.json();
 const translated = cleanSynopsis(data?.responseData?.translatedText);
 if (!response.ok || Number(data.responseStatus) !== 200 || data.quotaFinished || !translated || /MYMEMORY WARNING|USED ALL AVAILABLE FREE|INVALID LANGUAGE/i.test(translated)) throw new Error('Translation unavailable or free quota exhausted');
 return translated;
}
let running = false;
export async function runSpanishSynopsisBatch(pool, { maxRequests = 4, request = fetch } = {}) {
 if (running) return { translated: 0 };
 running = true; let translated = 0;
 try {
  for (let i = 0; i < Math.min(12, maxRequests); i++) {
   const job = await claimSegment(pool); if (!job) break;
   try {
    job.segments[job.index].translated = await translateSynopsisSegment(job.text, request);
    const complete = job.segments.every(part => !!part.translated);
    await pool.query(`UPDATE anime_synopsis_es SET segments=$2::jsonb, status=$3, translated_text=$4,
      failures=0,next_attempt_at=NOW(),translated_at=CASE WHEN $3='ready' THEN NOW() ELSE NULL END WHERE source_hash=$1`,
      [job.source_hash, JSON.stringify(job.segments), complete ? 'ready' : 'pending', complete ? job.segments.map(part => part.translated).join(' ') : null]);
    translated++;
   } catch (error) {
    await pool.query("UPDATE anime_synopsis_es SET status='pending',failures=failures+1,next_attempt_at=NOW()+INTERVAL '6 hours' WHERE source_hash=$1", [job.source_hash]);
    console.warn('[SynopsisES] Translation deferred:', error.message); break;
   }
  }
  return { translated };
 } finally { running = false; }
}
