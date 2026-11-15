import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/seriesPlaybackTarget.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { seriesPlaybackTarget } = exports;
const seasons = [
  { season: 2, episodes: [{ id: '203', number: 3, url: 'https://video.test/203' }] },
  { season: 1, episodes: [{ id: '102', number: 2, external_servers: [{ url: 'https://video.test/102' }] }, { id: '101', number: 1, url: 'https://video.test/101' }] },
];
test('resume card opens the actual saved episode in its season instead of always episode one', () => {
  const selected = seriesPlaybackTarget(seasons, { episodeId: 203, resumeTime: 140 });
  assert.equal(selected.episode.id, '203'); assert.equal(selected.season.season, 2); assert.equal(selected.resumeTime, 140);
});
test('fresh series starts with the first playable episode in chronological order', () => {
  assert.equal(seriesPlaybackTarget(seasons).episode.id, '101');
  assert.equal(seasons[0].season, 2); assert.equal(seasons[1].episodes[0].id, '102');
});
test('no pending episode or missing target does not advertise episode one as next', () => {
  assert.equal(seriesPlaybackTarget(seasons, { episodeId: null, resumeTime: 0 }), null);
  assert.equal(seriesPlaybackTarget(seasons, { episodeId: 999, resumeTime: 0 }), null);
});
