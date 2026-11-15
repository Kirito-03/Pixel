import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../services/searchHistoryStore.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function cloud() {
  const documents = new Map(), listeners = new Map();
  const snapshot = path => ({ data: () => documents.get(path) });
  const firebase = {
    doc: (_, ...parts) => parts.join('/'), serverTimestamp: () => 'SERVER_TIME',
    onSnapshot(path, callback) { const callbacks = listeners.get(path) || new Set(); callbacks.add(callback); listeners.set(path, callbacks); callback(snapshot(path)); return () => callbacks.delete(callback); },
    async runTransaction(_, work) {
      return work({ get: async path => snapshot(path), set(path, next) {
        const previous = documents.get(path) || {};
        documents.set(path, { ...previous, search_history: { ...previous.search_history, ...next.search_history } });
        for (const fn of listeners.get(path) || []) fn(snapshot(path));
      } });
    },
  };
  function client(uid) {
    const auth = { currentUser: uid ? { uid } : null, authStateReady: async () => {} }, exports = {};
    vm.runInNewContext(source, { exports, require(name) { return name === 'firebase/firestore' ? firebase : { auth, db: {} }; } });
    return { store: exports.searchHistoryStore, clean: exports.cleanSearchHistory, auth };
  }
  return { client, documents };
}
test('two clients synchronize searches and clearing in the same account/profile', async () => {
  const c = cloud(), phone = c.client('owner'), web = c.client('owner'), received = [];
  const stop = await web.store.watch(7, entries => received.push([...entries]), assert.fail, 'owner');
  await phone.store.add(7, 'Chitose', 'owner');
  assert.deepEqual(received.at(-1), ['Chitose']);
  await web.store.add(7, 'Mikadono', 'owner');
  await phone.store.add(7, 'chitose', 'owner');
  assert.deepEqual(received.at(-1), ['chitose', 'Mikadono']);
  await phone.store.clear(7, 'owner'); assert.deepEqual(received.at(-1), []); stop();
});
test('histories remain isolated by account and profile, with five bounded unique searches', async () => {
  const c = cloud(), a = c.client('owner'), b = c.client('other');
  await a.store.add(7, 'Perfil7'); await a.store.add(8, 'Perfil8'); await b.store.add(7, 'Otra cuenta');
  assert.equal(c.documents.get('profiles/owner').search_history['7'].queries[0], 'Perfil7');
  assert.equal(c.documents.get('profiles/owner').search_history['8'].queries[0], 'Perfil8');
  assert.equal(c.documents.get('profiles/other').search_history['7'].queries[0], 'Otra cuenta');
  assert.equal(a.clean(['A',' a ',...Array.from({length:10},(_,i)=>String(i))]).length, 5);
});
test('legacy migration cannot resurrect a history cleared on another device', async () => {
  const c = cloud(), a = c.client('owner'), b = c.client('owner');
  await a.store.migrate(7, ['Vieja']); await a.store.clear(7); await b.store.migrate(7, ['Vieja']);
  assert.equal(c.documents.get('profiles/owner').search_history['7'].queries.length, 0);
});
test('logged out or changed accounts cannot receive an old profile request', async () => {
  const c = cloud(), a = c.client('owner'), out = c.client(null);
  a.auth.currentUser = { uid: 'other' };
  await assert.rejects(a.store.add(7, 'Private', 'owner'));
  await assert.rejects(out.store.add(7, 'Private'));
  assert.equal(c.documents.size, 0);
});
