import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareAv1Video, probeVideo } from './drive-video.mjs';

function metadata(codec = 'av1') {
  return { streams: [
    { index: 0, codec_type: 'video', codec_name: codec, width: 1920, height: 1080,
      pix_fmt: 'yuv420p10le', avg_frame_rate: '24000/1001', duration: '1455.0' },
    { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000' },
  ], format: { duration: '1455.0' } };
}

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'pixel-av1-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const inputPath = join(dir, 'raw episode.mp4');
  const outputPath = join(dir, 'prepared.mp4');
  const configPath = join(dir, 'config.json');
  const callsPath = join(dir, 'calls.jsonl');
  const statePath = join(dir, 'output-probe.json');
  let config = { input: metadata(), encoders: ['libsvtav1', 'libaom-av1'], ...overrides };
  await writeFile(inputPath, 'original download');
  await writeFile(configPath, JSON.stringify(config));
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(configPath)}, 'utf8'));
const isProbe = path.basename(process.argv[1]).startsWith('ffprobe');
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({kind: isProbe ? 'probe' : 'ffmpeg', args}) + '\\n');
if (isProbe) {
 const result = args.at(-1) === ${JSON.stringify(inputPath)} ? cfg.input : JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, 'utf8'));
 process.stdout.write(JSON.stringify(result));
} else if (args.includes('-encoders')) {
 process.stdout.write(cfg.encoders.map(name => ' V..... ' + name + ' encoder').join('\\n'));
} else {
 fs.writeFileSync(args.at(-1), Buffer.alloc(2048, 7));
 const probe = structuredClone(cfg.input);
 probe.streams[0].codec_name = 'av1';
 if (cfg.changedVideo) Object.assign(probe.streams[0], cfg.changedVideo);
 if (cfg.dropAudio) probe.streams = probe.streams.filter(item => item.codec_type !== 'audio');
 fs.writeFileSync(${JSON.stringify(statePath)}, JSON.stringify(probe));
 if (cfg.fail) process.exit(2);
}
`;
  const ffmpegBin = join(dir, 'ffmpeg.cjs');
  const ffprobeBin = join(dir, 'ffprobe.cjs');
  for (const path of [ffmpegBin, ffprobeBin]) { await writeFile(path, script); await chmod(path, 0o700); }
  return {
    inputPath, outputPath, ffmpegBin, ffprobeBin,
    prepare: () => prepareAv1Video({ inputPath, outputPath, ffmpegBin, ffprobeBin, log() {} }),
    async calls() { return (await readFile(callsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); },
    async update(patch) { config = { ...config, ...patch }; await writeFile(configPath, JSON.stringify(config)); },
  };
}

test('AV1 is copied without probing encoders; valid preparations resume without recoding', async t => {
  const f = await fixture(t);
  const result = await f.prepare();
  assert.equal(result.mode, 'remux');
  assert.equal(result.reused, false);
  assert.equal(result.manifestPath, `${f.outputPath}.manifest.json`);
  const firstCalls = await f.calls();
  const conversions = firstCalls.filter(call => call.kind === 'ffmpeg');
  assert.equal(conversions.length, 1);
  const args = conversions[0].args;
  assert.equal(args[args.indexOf('-c') + 1], 'copy');
  assert.ok(args.includes('+faststart'));
  assert.equal(args.includes('-vf'), false);
  assert.equal(args.includes('-r'), false);
  const resumed = await f.prepare();
  assert.equal(resumed.reused, true);
  assert.equal((await f.calls()).filter(call => call.kind === 'ffmpeg').length, 1);
});

test('non-AV1 is encoded once with bounded SVT, same dimensions/fps/audio', async t => {
  const f = await fixture(t, { input: metadata('h264') });
  assert.equal((await f.prepare()).mode, 'encode');
  const args = (await f.calls()).find(call => call.kind === 'ffmpeg' && !call.args.includes('-encoders')).args;
  for (const [option, value] of [['-c:v', 'libsvtav1'], ['-preset', '8'], ['-crf', '25'], ['-svtav1-params', 'lp=2'], ['-c:a', 'copy'], ['-pix_fmt', 'yuv420p10le']]) {
    assert.equal(args[args.indexOf(option) + 1], value);
  }
  assert.equal(args.includes('-vf'), false);
  assert.equal(args.includes('-r'), false);
  assert.equal((await f.prepare()).reused, true);
  assert.equal((await f.calls()).filter(call => call.args.includes('-encoders')).length, 1);
});

test('libaom fallback remains AV1 when SVT is unavailable', async t => {
  const f = await fixture(t, { input: metadata('hevc'), encoders: ['libaom-av1'] });
  await f.prepare();
  const args = (await f.calls()).find(call => call.kind === 'ffmpeg' && !call.args.includes('-encoders')).args;
  assert.equal(args[args.indexOf('-c:v') + 1], 'libaom-av1');
  assert.equal(args[args.indexOf('-threads') + 1], '2');
});

test('missing AV1 encoder preserves download and fails without H264 fallback', async t => {
  const f = await fixture(t, { input: metadata('h264'), encoders: ['libx264'] });
  await assert.rejects(f.prepare(), /no dispone de un codificador AV1/);
  assert.ok((await stat(f.inputPath)).size > 0);
  await assert.rejects(stat(f.outputPath), { code: 'ENOENT' });
});

for (const [label, change, message] of [
  ['resolution', { changedVideo: { width: 1280, height: 720 } }, /resolución/],
  ['fps', { changedVideo: { avg_frame_rate: '12/1' } }, /fotogramas/],
  ['duration', { changedVideo: { duration: '1200' } }, /duración/],
  ['audio', { dropAudio: true }, /audio/],
]) {
  test(`prepared ${label} mismatch is rejected and never published`, async t => {
    const f = await fixture(t, change);
    await assert.rejects(f.prepare(), message);
    await assert.rejects(stat(f.outputPath), { code: 'ENOENT' });
    await assert.rejects(stat(`${f.outputPath}.partial.mp4`), { code: 'ENOENT' });
    assert.ok((await stat(f.inputPath)).size > 0);
  });
}

test('same-size corrupted prepared file is not reused', async t => {
  const f = await fixture(t);
  await f.prepare();
  await writeFile(f.outputPath, Buffer.alloc(2048, 9));
  assert.equal((await f.prepare()).reused, false);
  assert.equal((await f.calls()).filter(call => call.kind === 'ffmpeg').length, 2);
});

test('changed source invalidates prepared manifest', async t => {
  const f = await fixture(t);
  await f.prepare();
  await writeFile(f.inputPath, 'replacement longer source download');
  assert.equal((await f.prepare()).reused, false);
});

test('interrupted encode keeps source and removes only partial output', async t => {
  const f = await fixture(t, { fail: true });
  await assert.rejects(f.prepare(), /terminó con 2/);
  assert.ok((await stat(f.inputPath)).size > 0);
  await assert.rejects(stat(`${f.outputPath}.partial.mp4`), { code: 'ENOENT' });
  await f.update({ fail: false });
  assert.equal((await f.prepare()).codec, 'av1');
});

test('probeVideo rejects source without duration before running ffmpeg', async t => {
  const input = metadata();
  input.streams[0].duration = '0';
  input.format.duration = '0';
  const f = await fixture(t, { input });
  await assert.rejects(probeVideo(f.inputPath, f.ffprobeBin), /duración válidas/);
  assert.equal((await f.calls()).some(call => call.kind === 'ffmpeg'), false);
});
