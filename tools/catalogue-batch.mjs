#!/usr/bin/env node
// Operator batch CLI: resolves at most N episodes, sequentially. Dry-run by default.
import pool from '../server/db.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);
const limit=args.includes('--limit') ? Number(args[args.indexOf('--limit')+1]) : 3;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {console.error('Use --limit 1..20 [--enqueue]. Default: dry-run, limit 3.');process.exit(2);}
try {
 const {rows}=await pool.query("SELECT id FROM anime_episodes WHERE external_servers @> $1::jsonb ORDER BY id", [JSON.stringify([{server:'MP4Upload'}])]);
 let processed=0;
 for (const row of rows) {
  if (processed >= limit) break;
  if (existsSync(join(homedir(),'server/data/pixel-ingest',`episode-${row.id}`,'catalogue.json'))) continue;
  const command=[...process.execArgv,join(dirname(fileURLToPath(import.meta.url)),'catalogue-ingest.mjs'),'--episode-id',String(row.id)];
  if(args.includes('--enqueue')) command.push('--enqueue');
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,command,{stdio:'inherit'});child.once('exit',resolve);child.once('error',()=>resolve(1));});
  console.log(JSON.stringify({episode_id:row.id,result:code===0?'ok':'failed'}));processed++;
 }
 console.log(JSON.stringify({processed,mode:args.includes('--enqueue')?'enqueue':'dry-run'}));
} finally {await pool.end();}
