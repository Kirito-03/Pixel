import {playbackLockModule} from './helpers/playbackLock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const playbackSources = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/episodePlaybackSources.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: playbackSources });
test('Android pause reflects player events, stays visible while paused and advances only on real end',()=>{
  const hooks=[];let cursor=0;let effects=[];const events={};const timers=new Map();let clock=0;let advanced=0;
  const player={playing:true,currentTime:96,duration:100,
    play(){this.playing=true;events.playingChange?.({isPlaying:true});},pause(){this.playing=false;events.playingChange?.({isPlaying:false});},
    addListener(name,fn){events[name]=fn;return{remove(){delete events[name];}};}};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},
    useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useCallback(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,j)=>d!==hooks[i].deps[j]))hooks[i]={fn,deps};return hooks[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,j)=>d!==hooks[i][j]))effects.push(fn);hooks[i]=deps;}};
  const native={Platform:{OS:'android'},StyleSheet:{create:s=>s,absoluteFill:{}},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity'};
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../components/EpisodePlayer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{exports,setTimeout:fn=>{timers.set(++clock,fn);return clock;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},require(name){
    if(name==='../hooks/usePlaybackLock')return playbackLockModule(react);if(name==='./PlaybackLock')return{default:'PlaybackLock',__esModule:true};if(name==='react')return react;if(name==='react-native')return native;
    if(name==='../hooks/useImmersivePlayer')return{useImmersivePlayer(){}};if(name==='expo-video')return{useVideoPlayer:()=>player,VideoView:'VideoView'};
    if(name==='expo-status-bar')return{StatusBar:'StatusBar'};
    if(name==='expo-linear-gradient')return{LinearGradient:'LinearGradient'};
    if(name==='@expo/vector-icons')return{Ionicons:'Ionicons'};
    return{};
  }});
  const props={videoUrl:'https://example.test/video.mp4',episode:{id:'1',number:1,title:'Prueba'},animeTitle:'Prueba',hasNextEpisode:true,hasPreviousEpisode:false,onClose(){},onNextEpisode:()=>advanced++,onProgress(){}};
  function render(){cursor=0;const tree=exports.NativeVideoPlayer(props);const tasks=effects;effects=[];tasks.forEach(fn=>fn());return tree;}
  function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label)return node;for(const child of (node.props?.children||[]).flat(Infinity)){const result=find(child,label);if(result)return result;}return null;}
  let tree=render();const pause=find(tree,'Pausar capítulo');assert.ok(pause);pause.props.onPress();tree=render();
  assert.equal(player.playing,false);assert.ok(find(tree,'Reproducir capítulo'));assert.equal(advanced,0);assert.equal(timers.size,0);
  find(tree,'Reproducir capítulo').props.onPress();tree=render();assert.equal(player.playing,true);assert.ok(find(tree,'Pausar capítulo'));
  events.playToEnd();assert.equal(advanced,1);
});

function createPlayerHarness(overrides = {}) {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const cleanups = new Map();
  const events = {};
  const intervals = new Map();
  const timeouts = new Map();
  let clock = 0;
  let nowMs = 1_000_000;
  const appStateListeners = new Set();
  const savedCalls = [];

  const player = {
    playing: true,
    currentTime: 0,
    duration: 300,
    play() {
      this.playing = true;
      events.playingChange?.({ isPlaying: true });
    },
    pause() {
      this.playing = false;
      events.playingChange?.({ isPlaying: false });
    },
    addListener(name, fn) {
      events[name] = fn;
      return { remove() { delete events[name]; } };
    },
    ...overrides.player,
  };

  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], v => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!hooks[i] || deps.some((d, j) => d !== hooks[i].deps[j])) {
        hooks[i] = { value: fn(), deps };
      }
      return hooks[i].value;
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!hooks[i] || deps.some((d, j) => d !== hooks[i].deps[j])) {
        hooks[i] = { fn, deps };
      }
      return hooks[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const prevDeps = hooks[i]?.deps;
      const changed = !hooks[i] || !deps || deps.some((d, j) => d !== prevDeps[j]);
      if (changed) {
        effects.push({ index: i, fn });
      }
      hooks[i] = { deps };
    },
  };

  const native = {
    Platform: { OS: 'android' },
    StyleSheet: { create: s => s, absoluteFill: {} },
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator',
    Animated: {
      Value: function Value(v) { return { _v: v }; },
      View: 'Animated.View',
      timing: () => ({ start: cb => cb?.() }),
    },
    AppState: {
      addEventListener(_event, fn) {
        appStateListeners.add(fn);
        return { remove() { appStateListeners.delete(fn); } };
      },
    },
  };

  const progressApi = overrides.progressApi || {
    save(profileId, payload) {
      savedCalls.push({ profileId, payload });
      return Promise.resolve({ ok: true });
    },
  };

  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(new URL('../components/EpisodePlayer.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }
  ).outputText;

  const FakeDate = {
    now: () => nowMs,
  };

  vm.runInNewContext(source, {
    exports,
    Date: FakeDate,
    console,
    Promise,
    setTimeout: fn => { timeouts.set(++clock, fn); return clock; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: fn => { intervals.set(++clock, fn); return clock; },
    clearInterval: id => intervals.delete(id),
    require(name) {
      if (name === '../hooks/usePlaybackLock') return playbackLockModule(react); if (name === './PlaybackLock') return { default:'PlaybackLock',__esModule:true }; if (name === 'react') return react;
      if (name === 'react-native') return native;
      if (name === '../hooks/useImmersivePlayer') return { useImmersivePlayer() {} };
      if (name === 'expo-video') return { useVideoPlayer: () => player, VideoView: 'VideoView' };
      if (name === 'expo-status-bar') return { StatusBar: 'StatusBar' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'expo-navigation-bar') return { setVisibilityAsync: () => {}, setBehaviorAsync: () => {} };
      if (name === 'expo-screen-orientation') return { lockAsync: () => Promise.resolve(), OrientationLock: { LANDSCAPE: 1, PORTRAIT_UP: 2 } };
      if (name === 'react-native-webview') return { WebView: 'WebView' };
      if (name === './PlaybackChrome') return { default: 'PlaybackChrome', __esModule: true };
      if (name === './PlaybackTimeline') return { default: 'PlaybackTimeline', __esModule: true };
      if (name === './SeekButton') return { default: 'SeekButton', __esModule: true };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === '../services/episodePlaybackSources') return playbackSources;
      if (name === '../services/progressApi') return { progressApi };
      if (name === '../utils/embeddedPlayerBridge') return { EMBEDDED_PLAYER_BRIDGE: '' };
      return {};
    },
  });

  function renderComponent(Component, props) {
    cursor = 0;
    const tree = Component(props);
    const pendingEffects = effects;
    effects = [];
    for (const eff of pendingEffects) {
      const prevCleanup = cleanups.get(eff.index);
      if (typeof prevCleanup === 'function') prevCleanup();
      const nextCleanup = eff.fn();
      cleanups.set(eff.index, nextCleanup);
    }
    return tree;
  }

  function unmount() {
    for (const cleanup of cleanups.values()) {
      if (typeof cleanup === 'function') cleanup();
    }
    cleanups.clear();
  }

  function findByType(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of (node.props?.children || []).flat(Infinity)) {
      const res = findByType(child, type);
      if (res) return res;
    }
    return null;
  }

  function findAllByType(node, type, acc = []) {
    if (!node || typeof node !== 'object') return acc;
    if (node.type === type) acc.push(node);
    for (const child of (node.props?.children || []).flat(Infinity)) {
      findAllByType(child, type, acc);
    }
    return acc;
  }

  return {
    exports,
    player,
    events,
    intervals,
    savedCalls,
    advanceTime(ms) { nowMs += ms; },
    tickIntervals() { for (const fn of intervals.values()) fn(); },
    triggerAppState(state) { for (const fn of appStateListeners) fn(state); },
    renderNative: props => renderComponent(exports.NativeVideoPlayer, props),
    renderEpisode: props => renderComponent(exports.default, props),
    unmount,
    findByType,
    findAllByType,
  };
}

test('NativeVideoPlayer saves every 15s and does not skip backward seeks', () => {
  const h = createPlayerHarness();
  const progressCalls = [];
  const props = {
    videoUrl: 'https://example.test/video.mp4',
    episode: { id: '1', number: 1, title: 'Prueba' },
    animeTitle: 'Prueba',
    hasNextEpisode: true,
    hasPreviousEpisode: false,
    onClose() {},
    onNextEpisode() {},
    onProgress(payload, opts) { progressCalls.push({ payload, opts }); },
  };

  h.renderNative(props);

  h.player.currentTime = 10;
  h.advanceTime(10_000);
  h.tickIntervals();
  assert.equal(progressCalls.length, 0);

  h.player.currentTime = 15;
  h.advanceTime(5_000);
  h.tickIntervals();
  assert.equal(progressCalls.length, 1);
  assert.deepEqual({ ...progressCalls[0].payload }, { current_time: 15, duration: 300, position_known: true });

  h.player.currentTime = 25;
  h.advanceTime(10_000);
  h.tickIntervals();
  assert.equal(progressCalls.length, 1);

  h.player.currentTime = 30;
  h.advanceTime(5_000);
  h.tickIntervals();
  assert.equal(progressCalls.length, 2);
  assert.equal(progressCalls[1].payload.current_time, 30);

  // Seek backward from 30s to 12s: must not be skipped!
  h.player.currentTime = 12;
  h.advanceTime(2_000);
  h.tickIntervals();
  assert.equal(progressCalls.length, 3);
  assert.equal(progressCalls[2].payload.current_time, 12);
});

test('NativeVideoPlayer never saves second 0 before resumeTimeSeconds and flushes on pause, close, next, background and unmount', () => {
  const h = createPlayerHarness();
  const progressCalls = [];
  let closed = 0;
  let nexted = 0;
  const props = {
    videoUrl: 'https://example.test/video.mp4',
    resumeTimeSeconds: 120,
    episode: { id: '1', number: 1, title: 'Prueba' },
    animeTitle: 'Prueba',
    hasNextEpisode: true,
    hasPreviousEpisode: false,
    onClose() { closed++; },
    onNextEpisode() { nexted++; },
    onProgress(payload, opts) { progressCalls.push({ payload, opts }); },
  };

  let tree = h.renderNative(props);

  // Before readyToPlay applies resumeTimeSeconds, player.currentTime is 0
  h.tickIntervals();
  h.events.playingChange({ isPlaying: false });
  h.triggerAppState('background');
  assert.equal(progressCalls.length, 0, 'Must never save 0 before resumeTimeSeconds is applied');

  // Now readyToPlay fires and resumes to 120s
  h.events.statusChange({ status: 'readyToPlay' });
  assert.equal(h.player.currentTime, 120);

  // Pause saves immediately
  h.player.play();
  h.player.pause();
  assert.equal(progressCalls.at(-1).payload.current_time, 120);
  assert.equal(progressCalls.at(-1).opts?.force, true);

  // Background saves latest snapshot
  h.player.play();
  h.player.currentTime = 138;
  h.triggerAppState('background');
  assert.equal(progressCalls.at(-1).payload.current_time, 138);
  assert.equal(progressCalls.at(-1).opts?.force, true);

  // Close button flushes latest snapshot
  h.player.currentTime = 145;
  tree = h.renderNative(props);
  h.findByType(tree, 'PlaybackChrome').props.onClose();
  assert.equal(closed, 1);
  assert.equal(progressCalls.at(-1).payload.current_time, 145);

  // Next episode button flushes latest snapshot
  h.player.currentTime = 150;
  tree = h.renderNative(props);
  h.findByType(tree, 'PlaybackChrome').props.onNext();
  assert.equal(nexted, 1);
  assert.equal(progressCalls.at(-1).payload.current_time, 150);

  // Unmount persists the last sampled snapshot without touching a released native object.
  h.player.currentTime = 155;
  h.unmount();
  assert.equal(progressCalls.at(-1).payload.current_time, 150);
  assert.equal(progressCalls.at(-1).opts?.force, true);
});

test('EpisodePlayer sends full metadata, does not drop queued saves, and flushes on episode change', async () => {
  const pendingResolvers = [];
  const saved = [];
  const h = createPlayerHarness({
    progressApi: {
      save(profileId, payload) {
        saved.push({ profileId, payload });
        return new Promise(resolve => pendingResolvers.push(resolve));
      },
    },
  });

  const baseProps = {
    profileId: 7,
    animeId: 42,
    seasonNumber: 2,
    animeTitle: 'Test Anime',
    episode: {
      id: '101',
      number: 5,
      title: 'Ep 5',
      image: 'https://img.test/ep5.jpg',
      url: 'https://example.test/ep5.mp4',
    },
    onClose() {},
    hasNextEpisode: true,
    hasPreviousEpisode: false,
  };

  h.renderEpisode(baseProps);
  await Promise.resolve();
  let tree = h.renderEpisode(baseProps);
  const nativeEl = h.findByType(tree, h.exports.NativeVideoPlayer);
  assert.ok(nativeEl);

  // First save stays pending (in-flight)
  nativeEl.props.onProgress({ current_time: 16, duration: 1200, position_known: true });
  // Second save happens immediately while first is still pending -> must NOT be dropped!
  nativeEl.props.onProgress({ current_time: 18, duration: 1200, position_known: true }, { force: true });

  assert.equal(saved.length, 2);
  assert.deepEqual({ profileId: saved[1].profileId, payload: { ...saved[1].payload } }, {
    profileId: 7,
    payload: {
      anime_id: 42,
      episode_id: 101,
      current_time: 18,
      duration: 1200,
      position_known: true,
      episode_number: 5,
      season: 2,
      title: 'Test Anime',
      thumbnail: 'https://img.test/ep5.jpg',
    },
  });

  // Update snapshot without forcing (delta < 15), then change episode -> cleanup flushes 22s for ep 101
  nativeEl.props.onProgress({ current_time: 22, duration: 1200, position_known: true });
  assert.equal(saved.length, 2);

  h.renderEpisode({
    ...baseProps,
    episode: {
      id: '102',
      number: 6,
      title: 'Ep 6',
      image: 'https://img.test/ep6.jpg',
      url: 'https://example.test/ep6.mp4',
    },
  });

  assert.equal(saved.length, 3);
  assert.equal(saved[2].payload.episode_id, 101);
  assert.equal(saved[2].payload.current_time, 22);

  while (pendingResolvers.length) pendingResolvers.shift()();
});

test('EpisodePlayer WebView handles pixel:player for cross-origin (position_known:false) and controllable embeds', async () => {
  const h = createPlayerHarness();
  const props = {
    profileId: 9,
    animeId: 88,
    seasonNumber: 1,
    animeTitle: 'Embed Anime',
    episode: {
      id: '201',
      number: 3,
      title: 'Ep 3',
      image: 'https://img.test/ep3.jpg',
      url: 'https://embed.example.test/watch/201',
    },
    onClose() {},
    hasNextEpisode: false,
    hasPreviousEpisode: false,
  };

  h.renderEpisode(props);
  await Promise.resolve();
  const tree = h.renderEpisode(props);
  const webView = h.findByType(tree, 'WebView');
  assert.ok(webView);

  // Cross-origin iframe: canControl=false -> save marker once with position_known:false, 0/0
  const crossOriginMsg = { nativeEvent: { data: JSON.stringify({ type: 'pixel:player', canControl: false, playing: false, currentTime: 0, duration: 0 }) } };
  webView.props.onMessage(crossOriginMsg);
  webView.props.onMessage(crossOriginMsg);

  assert.equal(h.savedCalls.length, 1);
  assert.deepEqual({ ...h.savedCalls[0].payload }, {
    anime_id: 88,
    episode_id: 201,
    current_time: 0,
    duration: 0,
    position_known: false,
    episode_number: 3,
    season: 1,
    title: 'Embed Anime',
    thumbnail: 'https://img.test/ep3.jpg',
  });

  // Controllable embed: canControl=true -> saves real progress & flushes on pause / background
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pixel:player', canControl: true, playing: true, currentTime: 20, duration: 1400 }) } });
  assert.equal(h.savedCalls.length, 2);
  assert.equal(h.savedCalls[1].payload.current_time, 20);
  assert.equal(h.savedCalls[1].payload.duration, 1400);
  assert.equal(h.savedCalls[1].payload.position_known, true);

  // Pause in embedded player -> force saves immediately
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pixel:player', canControl: true, playing: false, currentTime: 24, duration: 1400 }) } });
  assert.equal(h.savedCalls.length, 3);
  assert.equal(h.savedCalls[2].payload.current_time, 24);

  // Advance slightly (+2s) then go to background -> flushes 26s
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pixel:player', canControl: true, playing: true, currentTime: 26, duration: 1400 }) } });
  assert.equal(h.savedCalls.length, 3);
  h.triggerAppState('background');
  assert.equal(h.savedCalls.length, 4);
  assert.equal(h.savedCalls[3].payload.current_time, 26);
});


test('10-second buttons clamp direct video seeks and preserve paused state and second zero', () => {
  const h = createPlayerHarness({ player: { currentTime: 6, duration: 300, playing: false } });
  const calls = [];
  const tree = h.renderNative({ videoUrl: 'https://video.test/drive.webm', episode: { id: '11', number: 11 }, animeTitle: 'Drive', onClose() {}, onProgress: (payload, options) => calls.push({ payload, options }) });
  const buttons = h.findAllByType(tree, 'SeekButton');
  buttons.find(button => !button.props.forward).props.onPress();
  assert.equal(h.player.currentTime, 0); assert.equal(h.player.playing, false);
  assert.equal(calls.at(-1).payload.current_time, 0); assert.equal(calls.at(-1).payload.position_known, true); assert.equal(calls.at(-1).options.force, true);
  buttons.find(button => button.props.forward).props.onPress();
  assert.equal(h.player.currentTime, 10);
  h.player.currentTime = 297;
  buttons.find(button => button.props.forward).props.onPress();
  assert.equal(h.player.currentTime, 300); assert.equal(h.player.playing, false);
  h.unmount();
});

test('unmount persists the JS snapshot after Expo has released the native player', () => {
  const h = createPlayerHarness({ player: { currentTime: 80, duration: 300 } });
  const saved = [];
  h.renderNative({ videoUrl: 'https://video.test/drive.mp4', episode: { id: '11', number: 11 }, animeTitle: 'Drive', onClose() {}, onProgress: value => saved.push(value) });
  h.tickIntervals();
  Object.defineProperty(h.player, 'currentTime', { get() { throw Error('ERR_USING_RELEASED_SHARED_OBJECT'); } });
  Object.defineProperty(h.player, 'duration', { get() { throw Error('ERR_USING_RELEASED_SHARED_OBJECT'); } });
  Object.defineProperty(h.player, 'playing', { get() { throw Error('ERR_USING_RELEASED_SHARED_OBJECT'); } });
  assert.doesNotThrow(() => h.unmount());
  assert.equal(saved.at(-1).current_time, 80);
});


test('timeline seeks to an arbitrary minute while preserving pause and saving that position', () => {
  const h = createPlayerHarness({ player: { currentTime: 60, duration: 1200, playing: false } });
  const saved = [];
  const tree = h.renderNative({ videoUrl: 'https://video.test/drive.mp4', episode: { id: '11', number: 11 }, animeTitle: 'Drive', onClose() {}, onProgress: value => saved.push(value) });
  h.findByType(tree, 'PlaybackTimeline').props.onSeek(600);
  assert.equal(h.player.currentTime, 600); assert.equal(h.player.playing, false);
  assert.equal(saved.at(-1).current_time, 600); h.unmount();
});
test('locking native playback hides chrome through accidental touches and playback events until explicit unlock',()=>{
 const h=createPlayerHarness();
 const props={videoUrl:'https://example.test/video.mp4',episode:{id:'5',number:5,title:'Fixture'},animeTitle:'Fixture',onClose(){},onProgress(){}};
 let tree=h.renderNative(props);
 h.findByType(tree,'PlaybackLock').props.onLock();tree=h.renderNative(props);
 assert.equal(h.findByType(tree,'PlaybackLock').props.locked,true);
 tree.props.onTouchStart();h.events.playingChange?.({isPlaying:true});tree=h.renderNative(props);
 assert.equal(h.findByType(tree,'PlaybackChrome'),null);
 h.findByType(tree,'PlaybackLock').props.onUnlock();tree=h.renderNative(props);
 assert.ok(h.findByType(tree,'PlaybackChrome'));
});
