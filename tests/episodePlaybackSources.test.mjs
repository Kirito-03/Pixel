import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/episodePlaybackSources.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { episodePlaybackSources } = exports;
test('Android can open provider-only chapters without a main URL', () => {
  const sources = episodePlaybackSources({ external_servers: JSON.stringify([{ server: 'Uno', url: 'https://provider.test/embed/1' }]) });
  assert.equal(sources[0].server, 'Uno'); assert.equal(sources[0].url, 'https://provider.test/embed/1');
});
test('downloaded episodes play locally even when the catalog still lists remote servers', () => {
  const sources = episodePlaybackSources({ url: 'file:///offline/1.mp4', external_servers: [{ url: 'https://provider.test/embed/1' }] });
  assert.equal(sources.length, 1); assert.equal(sources[0].url, 'file:///offline/1.mp4');
});
test('malformed provider JSON falls back to the primary source', () => {
  assert.equal(episodePlaybackSources({ url: 'https://video.test/1.webm', external_servers: '{bad' })[0].url, 'https://video.test/1.webm');
});


test('managed Drive stream wins over the external provider alternatives', () => {
  const sources = episodePlaybackSources({ url: 'https://pixelnosekai.com/api/stream/fixture.mp4', external_servers: [{ server: 'External', url: 'https://provider.test/embed' }] });
  assert.equal(sources.length, 1); assert.equal(sources[0].url, 'https://pixelnosekai.com/api/stream/fixture.mp4');
});
