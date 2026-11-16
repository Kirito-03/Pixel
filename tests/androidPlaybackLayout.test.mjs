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
    Animated: { Value: function Value() {}, View: 'Animated.View', timing: () => ({ start: cb => cb?.({ finished: true }) }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, console, Promise, AbortController, requestAnimationFrame: fn => fn(),
    setTimeout: fn => { timeouts.set(++clock, fn); return clock; }, clearTimeout: id => timeouts.delete(id),
    setInterval: fn => { intervals.set(++clock, fn); return clock; }, clearInterval: id => intervals.delete(id),
    require(name) { if (name === '../hooks/usePlaybackLock') return playbackLockModule(react); if (name === './PlaybackLock') return { default:'PlaybackLock',__esModule:true }; if (name === 'react') return react; if (name === 'react-native') return native; if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: 'dark', colors: { text: '#fff', textSecondary: '#aaa', textMuted: '#999', background: '#000', card: '#141414', primary: '#e50914' } }) };  return mocks[name] || {}; },
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
  const f = runtime('screens/MangaReaderScreen.tsx', {
    '@react-navigation/native': { useIsFocused: () => true, useNavigation: () => ({ setParams: value => navigated.push(value) }), useRoute: () => route },
    '../hooks/useTabNavigation': { useTabNavigation: () => ({ navigateByLabel() {} }) },
    '../services/mangaApi': { mangaApi: { getById: async () => ({title:'Fixture'}), chapters: async () => ({ chapters }), chapterPages: async () => ({ pages: ['https://example.test/page.jpg'] }) } },
    '../utils/mangaProgress': { saveMangaProgress() {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '../utils/mangaChapterNavigation': { getMangaReaderContext: () => undefined, mangaChapterKey: chapter => 'cap-' + chapter.chapter },
    '../utils/readerRetry': { loadReaderPages: async ({request}) => (await request()).pages, readerRetryDelay: () => 3000 },
    '../components/NativeMangaPages': { default: 'NativeMangaPages', __esModule: true },
  });
  f.render(); await tick(); let tree = f.render();
  let reader = type(tree, 'NativeMangaPages');
  reader.props.onNext(); assert.equal(navigated[0].chapterKey, 'cap-3'); assert.equal(navigated[0].chapterId, undefined);
  route.params.chapterId = 'three'; f.render(); await tick(); tree = f.render();
  reader = type(tree, 'NativeMangaPages');
  assert.equal(reader.props.next, null);
  f.unmount();
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
