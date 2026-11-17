import {playbackLockModule} from './helpers/playbackLock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
function runtime(file, mocks = {}) {
  const hooks = [], pending = [], cleanups = new Map(), timeouts = new Map(), intervals = new Map();
  let cursor = 0, clock = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((d,j) => d !== hooks[i].deps[j])) hooks[i] = { value: fn(), deps }; return hooks[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || !deps || deps.some((d,j) => d !== hooks[i][j])) pending.push({ i, fn }); hooks[i] = deps; },
  };
  const native = { Platform: { OS: 'android' }, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable', FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: value => value, absoluteFill: {}, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }),
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) },
    Animated: { Value: function Value() { this.interpolate = value => value; this.stopAnimation = () => {}; }, View: 'Animated.View', timing: () => ({ start: cb => cb?.({ finished: true }), stop() {} }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, console, Promise, AbortController, requestAnimationFrame: fn => fn(),
    setTimeout: fn => { timeouts.set(++clock, fn); return clock; }, clearTimeout: id => timeouts.delete(id),
    setInterval: fn => { intervals.set(++clock, fn); return clock; }, clearInterval: id => intervals.delete(id),
    require(name) { if (name === '@react-navigation/native' && mocks[name]) return { ...mocks[name], useFocusEffect: fn => react.useEffect(fn, [fn]) }; if (name === '../utils/readerChrome') { const result = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/readerChrome.ts', import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: result }); return result; } if (name === '../hooks/usePlaybackLock') return playbackLockModule(react); if (name === './PlaybackLock') return { default:'PlaybackLock',__esModule:true }; if (name === 'react') return react; if (name === 'react-native') return native; if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: 'dark', colors: { text: '#fff', textSecondary: '#aaa', textMuted: '#999', background: '#000', card: '#141414', primary: '#e50914' } }) };  return mocks[name] || {}; },
  });
  return { exports, intervals, timeouts,
    render(props) { cursor = 0; const tree = exports.default(props); for (const { i, fn } of pending.splice(0)) { cleanups.get(i)?.(); cleanups.set(i, fn()); } return tree; },
    unmount() { for (const cleanup of cleanups.values()) cleanup?.(); },
    hide() { for (const [id, fn] of [...timeouts]) { timeouts.delete(id); fn(); } },
  };
}
function find(node, label) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.accessibilityLabel === label) return node;
  for (const child of (node.props?.children || []).flat(Infinity)) { const found = find(child, label); if (found) return found; }
  return null;
}
function type(node, expected) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === expected) return node;
  for (const child of (node.props?.children || []).flat(Infinity)) { const found = type(child, expected); if (found) return found; }
  return null;
}

test('periodic playing reports do not prevent the video title from hiding; pause and touch reveal controls', () => {
  const f = runtime('components/HentaiVideoPlayer.tsx', {
    '../hooks/useImmersivePlayer': { useImmersivePlayer() {} }, 'react-native-webview': { WebView: 'WebView' },
    '../utils/embeddedPlayerBridge': { EMBEDDED_PLAYER_BRIDGE: '', shouldAllowEmbeddedNavigation: () => true },
  });
  const props = { animeTitle: 'Fixture', episodeNumber: 1, servers: [{ server: 'Fixture', url: 'https://example.test/embed' }], onClose() {} };
  let tree = f.render(props); tree = f.render(props);
  const report = playing => type(tree, 'WebView').props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pixel:player', canControl: true, playing }) } });
  const initialTimer = [...f.timeouts.keys()];
  report(true); report(true); report(true);
  assert.deepEqual([...f.timeouts.keys()], initialTimer);
  f.hide(); tree = f.render(props);
  assert.equal(type(tree, 'Animated.View').props.pointerEvents, 'none');
  type(tree, 'WebView').props.onMessage({ nativeEvent: { data: 'user_interaction' } });
  tree = f.render(props); assert.equal(type(tree, 'Animated.View').props.pointerEvents, 'box-none');
  report(false); tree = f.render(props); assert.equal(f.timeouts.size, 0);
  assert.equal(type(tree, 'Animated.View').props.pointerEvents, 'box-none');
  f.unmount();
});

test('manga carousel keeps advancing after using an arrow or a dot on Android', async () => {
  const f = runtime('components/CatalogHero.tsx');
  const props = { items: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }, { key: 'c', title: 'C' }], onOpen() {} };
  f.render(props); await tick(); let tree = f.render(props);
  assert.equal(f.intervals.size, 1);
  find(tree, 'Siguiente destacado').props.onPress(); tree = f.render(props);
  assert.equal(find(tree, 'Mostrar destacado 2 de 3').props.accessibilityState.selected, true);
  assert.equal(f.intervals.size, 1);
  [...f.intervals.values()][0](); tree = f.render(props);
  assert.equal(find(tree, 'Mostrar destacado 3 de 3').props.accessibilityState.selected, true);
  find(tree, 'Mostrar destacado 1 de 3').props.onPress(); tree = f.render(props);
  [...f.intervals.values()][0](); tree = f.render(props);
  assert.equal(find(tree, 'Mostrar destacado 2 de 3').props.accessibilityState.selected, true);
  f.unmount(); assert.equal(f.intervals.size, 0);
});

test('reader footer opens the actual next chapter and disappears on the last one', async () => {
  const chapters = [{ id: 'three', chapter: '3' }, { id: 'two', chapter: '2' }, { id: 'one', chapter: '1' }];
  const route = { params: { id: 'manga', chapterId: 'two', chapters } }, navigated = [];
  const visibility = [], reading = [];
  const chrome = { setReading: value => reading.push(value), setBottomVisible: value => visibility.push(value) };
  const f = runtime('screens/MangaReaderScreen.tsx', {
    '@react-navigation/native': { useIsFocused: () => true, useNavigation: () => ({ setParams: value => navigated.push(value) }), useRoute: () => route },
    '../hooks/useTabNavigation': { useTabNavigation: () => ({ navigateByLabel() {} }) },
    '../services/mangaApi': { mangaApi: { getById: async () => ({title:'Fixture'}), chapters: async () => ({ chapters }), chapterPages: async () => ({ pages: ['https://example.test/page.jpg'] }) } },
    '../contexts/ReaderChromeContext': { useReaderChrome: () => chrome },
    '../contexts/ProfileContext': { useProfile: () => ({currentProfile:{id:1}}) },
    '../utils/mangaProgress': { async saveMangaProgress() {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 24 }) },
    '../utils/mangaChapterNavigation': { getMangaReaderContext: () => undefined, mangaChapterKey: chapter => 'cap-' + chapter.chapter },
    '../utils/readerRetry': { loadReaderPages: async ({request}) => (await request()).pages, readerRetryDelay: () => 3000 },
    '../components/NativeMangaPages': { default: 'NativeMangaPages', __esModule: true },
  });
  f.render(); await tick(); let tree = f.render();
  let reader = type(tree, 'NativeMangaPages');
  const reserved = reader.props.topSpace;
  reader.props.onScroll(180); tree = f.render();
  assert.equal(type(tree, 'NativeMangaPages').props.topSpace, reserved);
  assert.equal(type(tree, 'Animated.View').props.pointerEvents, 'none');
  assert.equal(visibility.at(-1), false);
  reader = type(tree, 'NativeMangaPages'); reader.props.onScroll(120); tree = f.render();
  assert.equal(visibility.at(-1), true);
  assert.equal(type(tree, 'Animated.View').props.pointerEvents, 'none');
  reader = type(tree, 'NativeMangaPages'); reader.props.onScroll(20); tree = f.render();
  assert.equal(type(tree, 'Animated.View').props.pointerEvents, 'auto');
  reader.props.onNext(); assert.equal(navigated[0].chapterKey, 'cap-3'); assert.equal(navigated[0].chapterId, undefined);
  route.params.chapterId = 'three'; f.render(); await tick(); tree = f.render();
  reader = type(tree, 'NativeMangaPages');
  assert.equal(reader.props.next, null);
  f.unmount();
  assert.equal(reading.at(-1), false);
  assert.equal(visibility.at(-1), true);
});

test('closing a player during an in-flight landscape request still restores portrait afterwards', async () => {
  const calls = []; let finish;
  const f = runtime('hooks/useImmersivePlayer.ts', {
    'expo-screen-orientation': { OrientationLock: { LANDSCAPE: 1, PORTRAIT_UP: 2 }, lockAsync: lock => { calls.push(lock); return lock === 1 ? new Promise(resolve => finish = resolve) : Promise.resolve(); } },
  });
  f.exports.default = f.exports.useImmersivePlayer;
  f.render(); await tick(); f.unmount(); assert.deepEqual(calls, [1]);
  finish(); await tick(); assert.deepEqual(calls, [1, 2]);
});
test('embedded playback stays locked through provider interaction and pause messages',()=>{
 const f=runtime('components/HentaiVideoPlayer.tsx',{'../hooks/useImmersivePlayer':{useImmersivePlayer(){}},'react-native-webview':{WebView:'WebView'}});
 const props={animeTitle:'Fixture',episodeNumber:1,servers:[{server:'Fixture',url:'https://example.test/embed'}],onClose(){}};
 let tree=f.render(props);tree=f.render(props);type(tree,'PlaybackLock').props.onLock();tree=f.render(props);
 type(tree,'WebView').props.onMessage({nativeEvent:{data:'user_interaction'}});tree=f.render(props);
 assert.equal(type(tree,'PlaybackLock').props.locked,true);assert.equal(type(tree,'Animated.View').props.pointerEvents,'none');
 type(tree,'PlaybackLock').props.onUnlock();tree=f.render(props);assert.equal(type(tree,'Animated.View').props.pointerEvents,'box-none');
});


test('locked playback fades the unlock button, keeps intercepting touches, and only reveals it on a tap',()=>{
 const f=runtime('components/PlaybackLock.tsx');let unlocked=0,locked=0;
 const props={locked:true,visible:false,onLock:()=>locked++,onUnlock:()=>unlocked++};
 let tree=f.render(props);tree=f.render(props);
 assert.equal(type(tree,'Animated.View').props.pointerEvents,'auto');
 f.hide();tree=f.render(props);
 assert.equal(type(tree,'Animated.View').props.pointerEvents,'none');
 assert.equal(type(tree,'Animated.View').props.importantForAccessibility,'no-hide-descendants');
 const blocker=find(tree,'Pantalla bloqueada. Toca para mostrar cómo desbloquear');
 blocker.props.onPress();tree=f.render(props);
 assert.equal(unlocked,0);assert.equal(type(tree,'Animated.View').props.pointerEvents,'auto');
 const button=find(tree,'Mantén pulsado para desbloquear controles');
 button.props.onPressIn();assert.equal(f.timeouts.size,0);
 button.props.onLongPress();assert.equal(unlocked,1);
 const unlockedProps={...props,locked:false,visible:true};
 tree=f.render(unlockedProps);tree=f.render(unlockedProps);
 assert.equal(find(tree,'Pantalla bloqueada. Toca para mostrar cómo desbloquear'),null);
 find(tree,'Bloquear controles').props.onPress();assert.equal(locked,1);
 f.unmount();assert.equal(f.timeouts.size,0);
});

test('H reports the known episode/minute, restores a saved minute, and flushes the old episode before switching',()=>{
 const reports=[],scripts=[];
 const f=runtime('components/HentaiVideoPlayer.tsx',{
  '../hooks/useImmersivePlayer':{useImmersivePlayer(){}},'react-native-webview':{WebView:'WebView'},
  '../utils/embeddedPlayerBridge':{EMBEDDED_PLAYER_BRIDGE:'',shouldAllowEmbeddedNavigation:()=>true},
 });
 const servers=[{server:'Fixture',url:'https://example.test/embed'}];
 const props={contentId:'fixture',animeTitle:'Fixture',episodeNumber:2,resumeTimeSeconds:420,servers,onClose(){},onProgress:value=>reports.push(value)};
 let tree=f.render(props);tree=f.render(props);
 type(tree,'WebView').props.ref.current={injectJavaScript:script=>scripts.push(script)};
 const report=value=>type(tree,'WebView').props.onMessage({nativeEvent:{data:JSON.stringify({type:'pixel:player',canControl:true,playing:true,duration:1440,...value})}});
 report({currentTime:0});assert.ok(scripts.some(script=>script.includes('420')));assert.equal(reports.length,0);
 report({currentTime:422});assert.equal(reports.at(-1).episodeNumber,2);assert.equal(reports.at(-1).currentTime,422);
 const next={...props,episodeNumber:3,resumeTimeSeconds:0};tree=f.render(next);tree=f.render(next);
 assert.equal(reports.at(-1).episodeNumber,2);assert.equal(reports.at(-1).currentTime,422);
 type(tree,'WebView').props.onMessage({nativeEvent:{data:JSON.stringify({type:'pixel:player',canControl:true,playing:true,duration:1440,currentTime:10})}});
 assert.equal(reports.at(-1).episodeNumber,3);assert.equal(reports.at(-1).currentTime,10);
 f.unmount();assert.equal(reports.at(-1).episodeNumber,3);
});
