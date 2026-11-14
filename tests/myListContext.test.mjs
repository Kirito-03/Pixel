import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(api) {
  const hooks = []; let position = 0; let effects = [];
  const profile = { currentProfile: { id: 1 }, adultContentEnabled: true };
  const auth = { user: { uid: 'test-user' }, isLoading: false };
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_, props) => props.value,
    useState(initial) { const i = position++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = position++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect(fn, deps) { const i = position++; const previous = hooks[i]; hooks[i] = deps; if (!previous || deps.some((d, j) => d !== previous[j])) effects.push(fn); },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL('../contexts/MyListContext.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('ProfileContext')) return { useProfile: () => profile };
    if (name.endsWith('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('myListApi')) return { myListApi: api };
    throw new Error(name);
  } });
  return { profile, auth, render() { position = 0; const result = exports.MyListProvider({ children: null }); const run = effects; effects = []; run.forEach(fn => fn()); return result; } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('save stays pending until acknowledgement; repeated controls share one write; failures keep the old state', async () => {
  const write = deferred(); let calls = 0;
  const h = harness({ getMyList: async () => [], add: () => { calls++; return write.promise; }, remove: async () => {} });
  h.render(); await flush(); let state = h.render();
  const first = state.toggleMyList(42, 'anime');
  const second = state.toggleMyList(42, 'anime');
  assert.equal(first, second);
  await flush(); state = h.render();
  assert.equal(calls, 1);
  assert.equal(state.isUpdatingMyList(42, 'anime'), true);
  assert.equal(state.isInMyList(42, 'anime'), false);
  write.resolve(); await first; state = h.render();
  assert.equal(state.isUpdatingMyList(42, 'anime'), false);
  assert.equal(state.isInMyList(42, 'anime'), true);
  const fail = harness({ getMyList: async () => [], add: async () => { throw new Error('offline'); } });
  fail.render(); await flush(); state = fail.render();
  await assert.rejects(state.toggleMyList(42, 'anime'), /offline/);
  assert.equal(fail.render().isInMyList(42, 'anime'), false);
});

test('an old profile write cannot put a check in the new profile', async () => {
  const write = deferred();
  const h = harness({ getMyList: async () => [], add: () => write.promise });
  h.render(); await flush(); const saved = h.render().toggleMyList('demo', 'h_anime');
  h.profile.currentProfile = { id: 2 }; h.render(); await flush();
  write.resolve(); await saved;
  assert.equal(h.render().isInMyList('demo', 'h_anime'), false);
  h.profile.adultContentEnabled = false;
  await assert.rejects(h.render().toggleMyList('demo', 'h_anime'), /deshabilitada/);
});

test('a late refresh cannot overwrite a completed save', async () => {
  const read = deferred(); let reads = 0;
  const h = harness({ getMyList: () => ++reads === 1 ? Promise.resolve([]) : read.promise, add: async () => {} });
  h.render(); await flush(); let state = h.render();
  const refresh = state.refreshMyList();
  await state.addToMyList(42, 'anime'); h.render();
  read.resolve([]); await refresh;
  assert.equal(h.render().isInMyList(42, 'anime'), true);
});
