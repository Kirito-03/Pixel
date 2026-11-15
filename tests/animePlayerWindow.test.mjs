import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ os = 'android', profile = null, canReach = async () => true, getEpisodes = async () => [] } = {}) {
  const hooks = [], cleanups = new Map(); let cursor = 0, effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment',
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], v => hooks[i] = typeof v === 'function' ? v(hooks[i]) : v]; },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((d, j) => d !== hooks[i][j])) effects.push({ i, fn }); hooks[i] = deps; },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/AnimeSeriesModalWrapper.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, console, require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { Platform: { OS: os }, Modal: 'Modal', Alert: { alert() {} } };
      if (name === './AnimeSeriesModal') return { default: 'Details', __esModule: true };
      if (name === './EpisodePlayer') return { default: 'Player', __esModule: true };
      if (name.includes('ProfileContext')) return { useProfile: () => ({ currentProfile: profile }) };
      if (name.includes('connectivity')) return { canReachUrl: canReach };
      if (name.includes('catalogService')) return { catalogService: { getAnimeEpisodes: getEpisodes } };
      if (name.includes('episodePlaybackSources')) return { episodePlaybackSources: episode => [{ url: episode.url }] };
      return {};
    },
  });
  return {
    render(props) { cursor = 0; const tree = exports.default(props); const jobs = effects; effects = []; for (const job of jobs) { cleanups.get(job.i)?.(); cleanups.set(job.i, job.fn()); } return tree; },
  };
}
const props = { visible: true, content: { id: 100, type: 'anime', title: 'Fixture' }, onClose() {} };
const season = { id: 's1', season: 1, episodes: [{ id: '11', number: 11, url: 'https://video.test/drive.webm' }] };
const details = tree => tree.props.children.flat().find(child => child?.type === 'Details');
test('Android keeps the same details window visible when entering and leaving direct playback', async () => {
  const f = fixture(); let tree = f.render(props);
  await details(tree).props.onPlayEpisode(season.episodes[0], season, 30);
  tree = f.render(props);
  assert.equal(details(tree).props.visible, true); assert.equal(details(tree).props.playback.type, 'Player');
  assert.equal(tree.props.children.flat().filter(child => child?.type === 'Modal').length, 0);
  details(tree).props.onClosePlayback(); tree = f.render(props);
  assert.equal(details(tree).props.visible, true); assert.equal(details(tree).props.playback, null);
});
test('opening from My List completes despite intermediate renders and is consumed once on exit', async () => {
  let resolve, calls = 0;
  const f = fixture({ getEpisodes: () => { calls++; return new Promise(done => resolve = done); } });
  const direct = { ...props, startFromEpisodeId: 11, startFromTimeSeconds: 30 };
  f.render(direct); f.render(direct);
  resolve([{ id: 11, season: 1, episode_number: 11, stream_url: 'https://video.test/drive.webm' }]); await tick();
  let tree = f.render(direct); assert.equal(details(tree).props.playback.props.resumeTimeSeconds, 30);
  details(tree).props.onClosePlayback(); tree = f.render(direct); await tick(); tree = f.render(direct);
  assert.equal(details(tree).props.playback, null); assert.equal(details(tree).props.visible, true); assert.equal(calls, 1);
});
test('an in-flight connectivity check cannot reopen playback after the user closes details', async () => {
  let resolve;
  const f = fixture({ profile: { id: 7 }, canReach: () => new Promise(done => resolve = done) });
  const tree = f.render(props);
  const opening = details(tree).props.onPlayEpisode(season.episodes[0], season);
  f.render({ ...props, visible: false }); resolve(true); await opening;
  const reopened = f.render(props);
  assert.equal(details(reopened).props.playback, null);
});
