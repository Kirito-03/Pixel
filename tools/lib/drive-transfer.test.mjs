import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureVideoDownload, fileMd5, verifyDriveUpload, withVideoLock } from './drive-transfer.mjs';

async function fixture(work) {
  const dir = await mkdtemp(join(tmpdir(), 'pixel-transfer-'));
  try { await work(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('download checkpoint skips resolver/network on retry and invalidates a changed source', () => fixture(async dir => {
  const filePath = join(dir, 'raw.mp4');
  let downloads = 0, resolutions = 0;
  const options = { filePath, sourceKey: 'anime:9:v1',
    resolve: async () => { resolutions++; return { directUrl: 'https://example.invalid/video' }; },
    run: async (_bin, args) => { downloads++; assert.ok(args.includes('--fail')); await writeFile(args.at(-1), Buffer.alloc(120000, downloads)); },
    probe: async path => { assert.equal((await readFile(path)).length, 120000); }, log() {},
  };
  assert.equal((await ensureVideoDownload(options)).reused, false);
  assert.equal((await ensureVideoDownload(options)).reused, true);
  assert.equal(downloads, 1); assert.equal(resolutions, 1);
  await ensureVideoDownload({ ...options, sourceKey: 'anime:9:v2' });
  assert.equal(downloads, 2);
}));
test('failed downloads preserve previous complete input and cannot become a checkpoint', () => fixture(async dir => {
  const filePath = join(dir, 'raw.mp4');
  await writeFile(filePath, 'previous original');
  await assert.rejects(ensureVideoDownload({ filePath, sourceKey: 'new', resolve: async () => ({ directUrl: 'https://example.invalid' }),
    run: async (_bin, args) => { await writeFile(args.at(-1), 'partial'); throw Error('network failed'); }, probe: async () => {},
  }), /network failed/);
  assert.equal(await readFile(filePath, 'utf8'), 'previous original');
  await assert.rejects(readFile(`${filePath}.download.json`));
}));
test('Drive upload commits only if size and MD5 both match', () => fixture(async dir => {
  const file = join(dir, 'prepared.mp4'); await writeFile(file, 'prepared AV1');
  const md5 = await fileMd5(file);
  const capture = async (_bin, args) => { assert.deepEqual(args.slice(-2), ['--stat', '--hash']); return { stdout: JSON.stringify({ Size: 12, Hashes: { MD5: md5 } }) }; };
  assert.equal(await verifyDriveUpload(file, 'private:path/episode.mp4', 'rclone', capture), 12);
  for (const info of [{ Size: 12, Hashes: { MD5: 'bad' } }, { Size: 11, Hashes: { MD5: md5 } }, { Size: 12 }]) {
    await assert.rejects(verifyDriveUpload(file, 'private:path', 'rclone', async () => JSON.stringify(info)), /MD5/);
  }
}));
test('video lock excludes overlapping jobs and releases on failure', () => fixture(async dir => {
  await withVideoLock(dir, async () => { await assert.rejects(withVideoLock(dir, async () => {}), /activo/); });
  await assert.rejects(withVideoLock(dir, async () => { throw Error('upload failed'); }), /upload failed/);
  assert.equal(await withVideoLock(dir, async () => 'resumed'), 'resumed');
}));
test('stale video lock recovers a terminated worker', () => fixture(async dir => {
  const lock = join(dir, '.video-job.lock'); await mkdir(lock);
  await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647 }));
  assert.equal(await withVideoLock(dir, async () => 'resumed'), 'resumed');
}));
