import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { syncChapterPages } from '../tools/pixel-drive-manga.mjs';

const chapterUrl = 'https://dragontranslation.org/manga/fixture/capitulo-1/';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=', 'base64');
const source = Array.from({ length: 4 }, (_, index) => `https://dragontranslation.org/page-${index + 1}.png`);
const original = url => Buffer.concat([png, Buffer.from(url)]);
const fingerprint = bytes => ({ size: bytes.length, md5: createHash('md5').update(bytes).digest('hex') });

function fixture(t) {
  const localDir = mkdtempSync(join(tmpdir(), 'pixel-manga-resume-'));
  t.after(() => rmSync(localDir, { recursive: true, force: true }));
  const remote = new Map();
  const calls = { downloads: [], listings: 0, uploads: 0 };
  const options = {
    chapterUrl, originalUrls: source, localDir, remoteDir: 'fixture-remote',
    download: async (url, path) => { calls.downloads.push(url); writeFileSync(path, original(url)); },
    listRemote: async () => { calls.listings++; return new Map([...remote].map(([name, bytes]) => [name, fingerprint(bytes)])); },
    upload: async directory => {
      calls.uploads++;
      for (const file of readdirSync(directory).filter(file => file.endsWith('.jpg'))) {
        if (!remote.has(file)) remote.set(file, readFileSync(join(directory, file)));
      }
    },
  };
  return { options, remote, calls, localDir };
}

test('manga downloads at most two pages concurrently and uploads original image bytes in one batch', async t => {
  const { options, remote, calls } = fixture(t);
  const download = options.download;
  let active = 0, maximum = 0;
  options.download = async (...args) => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    await download(...args);
    active--;
  };
  const result = await syncChapterPages(options);
  assert.equal(maximum, 2);
  assert.equal(result.downloaded, 4);
  assert.equal(calls.uploads, 1);
  assert.equal(calls.listings, 2);
  for (let index = 0; index < source.length; index++) {
    assert.deepEqual(remote.get(`${String(index + 1).padStart(3, '0')}.jpg`), original(source[index]));
  }
});

test('an interrupted upload resumes from its checkpoint, skips verified remote pages and reuses local pages', async t => {
  const { options, remote, localDir, calls } = fixture(t);
  const upload = options.upload;
  options.upload = async directory => {
    calls.uploads++;
    for (const name of ['001.jpg', '002.jpg']) remote.set(name, readFileSync(join(directory, name)));
    throw new Error('connection interrupted');
  };
  await assert.rejects(syncChapterPages(options), /connection interrupted/);
  assert.equal(JSON.parse(readFileSync(join(localDir, '.resume.json'), 'utf8')).pages.length, 4);
  const savedFirst = remote.get('001.jpg');
  unlinkSync(join(localDir, '001.jpg'));
  unlinkSync(join(localDir, '002.jpg'));
  options.download = async () => { throw new Error('must not download completed pages again'); };
  options.upload = upload;
  const resumed = await syncChapterPages(options);
  assert.equal(resumed.downloaded, 0);
  assert.equal(resumed.uploaded, 2);
  assert.equal(remote.get('001.jpg'), savedFirst);
  assert.equal(remote.size, 4);
  assert.equal(calls.downloads.length, 4);
});

test('failed downloads settle before returning and retry only pages that are still missing', async t => {
  const { options, calls, localDir } = fixture(t);
  const download = options.download;
  let inFlight = 0;
  options.download = async (url, file) => {
    inFlight++;
    try {
      if (url === source[1]) await new Promise(resolve => setTimeout(resolve, 10));
      if (url === source[2]) throw new Error('temporary source failure');
      return await download(url, file);
    } finally { inFlight--; }
  };
  await assert.rejects(syncChapterPages(options), /temporary source failure/);
  assert.equal(inFlight, 0);
  assert.equal(calls.uploads, 0);
  assert.ok(readdirSync(localDir).includes('002.jpg'));
  calls.downloads.length = 0;
  options.download = download;
  await syncChapterPages(options);
  assert.deepEqual(calls.downloads.sort(), source.slice(2));
});

test('all pages must verify after upload; a missing middle page cannot pass', async t => {
  const { options, remote } = fixture(t);
  const upload = options.upload;
  options.upload = async (...args) => { await upload(...args); remote.delete('002.jpg'); };
  await assert.rejects(syncChapterPages(options), /1\/4 páginas pendientes/);
});

test('same-sized remote data with another hash is preserved and never overwritten', async t => {
  const { options, remote, calls } = fixture(t);
  const other = Buffer.from(original(source[0]));
  other[other.length - 1] ^= 1;
  remote.set('001.jpg', other);
  await assert.rejects(syncChapterPages(options), /001.jpg no coincide/);
  assert.equal(calls.uploads, 0);
  assert.equal(remote.get('001.jpg'), other);
});

test('a changed source cannot reuse a checkpoint for another set or order of pages', async t => {
  const { options, calls } = fixture(t);
  await syncChapterPages(options);
  calls.downloads.length = 0;
  await assert.rejects(syncChapterPages({ ...options, originalUrls: [...source].reverse() }), /Cambió el origen/);
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.uploads, 1);
});

test('HTML errors cannot become uploaded images and corrupt local pages are downloaded again', async t => {
  const { options, calls, localDir } = fixture(t);
  const download = options.download;
  options.download = async (_url, file) => writeFileSync(file, '<html>' + 'source temporarily unavailable'.repeat(10) + '</html>');
  await assert.rejects(syncChapterPages(options), /imagen inválida/);
  assert.equal(calls.uploads, 0);
  options.download = download;
  options.upload = async () => { throw new Error('stop after downloads'); };
  await assert.rejects(syncChapterPages(options), /stop after downloads/);
  const corrupt = Buffer.from(readFileSync(join(localDir, '001.jpg')));
  corrupt[corrupt.length - 1] ^= 1;
  writeFileSync(join(localDir, '001.jpg'), corrupt);
  calls.downloads.length = 0;
  await assert.rejects(syncChapterPages(options), /stop after downloads/);
  assert.deepEqual(calls.downloads, [source[0]]);
});

test('a fully verified remote chapter resumes without any image downloads or upload', async t => {
  const { options, localDir, calls } = fixture(t);
  await syncChapterPages(options);
  for (const file of readdirSync(localDir).filter(file => file.endsWith('.jpg'))) unlinkSync(join(localDir, file));
  calls.downloads.length = 0;
  calls.listings = 0;
  calls.uploads = 0;
  const result = await syncChapterPages(options);
  assert.equal(result.downloaded, 0);
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.uploads, 0);
  assert.equal(calls.listings, 1);
});

test('Drive inventory failures stop before downloading or changing any remote data', async t => {
  const { options, calls } = fixture(t);
  options.listRemote = async () => { throw new Error('Drive credentials temporarily unavailable'); };
  await assert.rejects(syncChapterPages(options), /Drive credentials temporarily unavailable/);
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.uploads, 0);
});

test('size-only remote inventories still require exact sizes for every page', async t => {
  const { options, remote } = fixture(t);
  options.listRemote = async () => new Map([...remote].map(([name, bytes]) => [name, { size: bytes.length }]));
  await syncChapterPages(options);
  remote.set('003.jpg', remote.get('003.jpg').subarray(0, 40));
  await assert.rejects(syncChapterPages(options), /003.jpg no coincide/);
});

test('two jobs cannot use the same chapter checkpoint simultaneously, and a crashed job lock can resume', async t => {
  const { options, localDir } = fixture(t);
  const list = options.listRemote;
  let releaseListing, firstListing = true;
  options.listRemote = () => {
    if (!firstListing) return list();
    firstListing = false;
    return new Promise(resolve => { releaseListing = async () => resolve(await list()); });
  };
  const active = syncChapterPages(options);
  await assert.rejects(syncChapterPages(options), /ya se está procesando/);
  const release = releaseListing;
  options.listRemote = list;
  // The first job is still waiting inside the initial inventory function.
  await release();
  await active;
  const lockDir = join(localDir, '.resume.lock');
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, 'pid'), '999999999');
  assert.equal((await syncChapterPages(options)).downloaded, 0);
});
