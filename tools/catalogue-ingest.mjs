#!/usr/bin/env node
// Private operator CLI. No public endpoint, shell interpolation or source URL logs.
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../server/db.js';
const args = process.argv.slice(2);
const episodeId = Number(args[args.indexOf('--episode-id') + 1]);
if (!args.includes('--episode-id') || !Number.isSafeInteger(episodeId) || episodeId <= 0 || args.some((x,i) => !['--episode-id','--enqueue'].includes(x) && args[i-1] !== '--episode-id')) {
  console.error('Usage: node --env-file=.env tools/catalogue-ingest.mjs --episode-id ID [--enqueue]');process.exit(2);
}
try {
  const { rows } = await pool.query('SELECT id, anime_id, episode_number, external_servers FROM anime_episodes WHERE id = $1', [episodeId]);
  const episode = rows[0];
  if (!episode) throw new Error('Episode not found');
  const source = (episode.external_servers || []).find(x => {
    try { const u = new URL(x.url);return u.protocol === 'https:' && ['mp4upload.com','www.mp4upload.com'].includes(u.hostname) && !u.username && !u.password && (!u.port || u.port === '443'); } catch { return false; }
  });
  if (!source) throw new Error('This connector currently supports MP4Upload sources only');
  const script = join(dirname(fileURLToPath(import.meta.url)), 'resolve-and-enqueue.py');
  const python = process.env.PIXEL_RESOLVER_PYTHON || join(homedir(),'server/tools/media-resolver/bin/python');
  const result = spawnSync(python, [script], {
    input: JSON.stringify({ episode_id: episode.id, anime_id: episode.anime_id, number: episode.episode_number, url: source.url, enqueue: args.includes('--enqueue') }),
    encoding: 'utf8', timeout: 2100000, maxBuffer: 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {console.error('Resolver/ingest failed; no source URLs or credentials logged.');process.exitCode=1;}
} catch { console.error('Catalogue ingest failed; check episode ID and private operator configuration.');process.exitCode=1; }
finally { await pool.end(); }
