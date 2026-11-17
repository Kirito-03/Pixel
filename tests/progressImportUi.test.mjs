import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, scope = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, Date, Math, Map, Set, Promise, Object, Number, Error, JSON, encodeURIComponent, ...scope });
  return exports;
}
function renderFixture(file, mocks = {}) {
  const state = [], effects = []; let cursor = 0;
  const react = { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useRef(initial) { const i=cursor++;return state[i]??={current:initial}; }, useEffect(fn,deps) {const i=cursor++;if(!state[i]||deps.some((x,j)=>x!==state[i][j]))effects.push(fn);state[i]=deps;}, useMemo: fn => fn() };
  const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', TouchableOpacity: 'Button', Modal: 'Modal', ActivityIndicator: 'Spinner',
    StyleSheet: { create: x => x, absoluteFillObject: {} }, Animated: { Value: class {}, View: 'Animated.View', timing:()=>({}), parallel:()=>({start:fn=>fn?.()}) } };
  const module = load(file, { require: name => name === 'react' ? react : name === 'react-native' ? native : mocks[name] || { LinearGradient: 'Gradient', Ionicons: 'Icon' } });
  return props => { cursor = 0; const tree=module.default(props);while(effects.length)effects.shift()();return tree; };
}
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)]; }
function text(tree) { return !tree ? '' : typeof tree !== 'object' ? String(tree) : (tree.props?.children || []).flat(Infinity).map(text).join(' '); }

test('import confirmation displays Importando while pending and restores its action after completion', async () => {
  const render = renderFixture('components/ConfirmDialog.tsx'); let finish;
  const props = { visible: true, title: 'Guardar lecturas', message: 'Fixture', destructive: false, confirmText: 'Importar y respaldar', busyText: 'Importando…', onCancel() {}, onConfirm: () => new Promise(resolve => { finish = resolve; }) };
  let tree = render(props);
  const action = nodes(tree).find(n => n.type === 'Pressable' && text(n).includes('Importar y respaldar')).props.onPress();
  tree = render(props); assert.match(text(tree), /Importando/); assert.doesNotMatch(text(tree), /Eliminando/);
  finish(); await action;
  assert.match(text(render(props)), /Importar y respaldar/);
});

test('cloud confirmation and unimported local copies are shown separately', () => {
  const render = renderFixture('components/ProgressBackupPanel.tsx', {
    '../contexts/ProgressSyncContext': { useProgressSync: () => ({ records: { fixture: {} }, legacyCount: 3, pendingCount: 0, lastSyncedAt: 1000, failed: false }) },
    '../contexts/ProfileContext': { useProfile: () => ({ currentProfile: { name: 'Fixture' } }) },
    '../contexts/ThemeContext': { useTheme: () => ({ colors: {} }) },
    './ConfirmDialog': { default: 'ConfirmDialog', __esModule: true },
  });
  const copy = text(render());
  assert.match(copy, /Respaldo confirmado en la nube/);
  assert.match(copy, /lecturas de versiones anteriores en este dispositivo/);
});

test('a stalled commit times out without dropping the outbox and a later server acknowledgement recovers it', async () => {
  const timers = new Map(); let next = 0;
  const { withProgressDeadline } = load('services/progressDeadline.ts', { setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id) });
  const { createContentProgressEngine } = load('services/contentProgressEngine.ts');
  const local = new Map(), scope = { uid: 'fixture', profileId: 1 }; let finish, entered, uploaded;
  const writing = new Promise(resolve => { entered = resolve; });
  const engine = createContentProgressEngine({ assertScope() {}, now: () => 1000,
    storage: { getItem: async key => local.get(key) || null, setItem: async (key, value) => { local.set(key, value); } },
    remote: { read: async () => ({}), write: async (_, rows) => { uploaded = rows[0]; entered(); return withProgressDeadline(new Promise(resolve => { finish = resolve; })); } },
  });
  await engine.save(scope, 'manga', 'fixture', { chapterId: 'chapter-19', chapterNumber: '19' });
  const sync = engine.sync(scope); await writing;
  [...timers.values()][0]();
  await assert.rejects(sync, /todavía no confirmó/);
  let state = await engine.read(scope);
  assert.equal(state.pendingCount, 1); assert.equal(state.failed, true); assert.equal(state.syncing, false); assert.equal(state.lastSyncedAt, 0);
  const ack = { 'manga:fixture': uploaded }; finish(ack);
  assert.equal((await engine.read(scope)).pendingCount, 1);
  await engine.acceptRemote(scope, ack, true);
  state = await engine.read(scope); assert.equal(state.pendingCount, 0); assert.equal(state.failed, false); assert.equal(state.records['manga:fixture'].chapterNumber, '19');
  assert.equal(timers.size, 0);
});

test('closing and reopening a confirmation cannot retain loading or let an old callback unlock a new request',async()=>{
 const render=renderFixture('components/ConfirmDialog.tsx'), finish=[];
 const props={visible:true,title:'Fixture',message:'Fixture',destructive:false,confirmText:'Importar',busyText:'Importando…',onCancel(){},onConfirm:()=>new Promise(resolve=>finish.push(resolve))};
 const press=tree=>nodes(tree).find(n=>n.type==='Pressable'&&text(n)==='Importar').props.onPress();
 const first=press(render(props));
 assert.match(text(render(props)),/Importando/);
 render({...props,visible:false});render(props);
 let tree=render(props);assert.doesNotMatch(text(tree),/Importando/);
 const second=press(tree);
 finish[0]();await first;
 assert.match(text(render(props)),/Importando/);
 finish[1]();await second;assert.doesNotMatch(text(render(props)),/Importando/);
});
