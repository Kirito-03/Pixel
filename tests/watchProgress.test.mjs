import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name]; } });
  return exports;
}
function fixture(setImpl) {
  const data = new Map(), writes = [];
  const auth = { currentUser: { uid: 'alice' }, async authStateReady() {} };
  const firestore = {
    doc: (_, ...parts) => parts.join('/'), collection: (_, ...parts) => parts.join('/'),
    orderBy: () => null, query: path => path, serverTimestamp: () => ({ toDate: () => new Date('2026-11-14T12:00:00Z') }),
    async setDoc(path, entry) { writes.push({path, entry}); await setImpl?.(entry); data.set(path, {...data.get(path), ...entry}); },
    async getDoc(path) { return { exists: () => data.has(path), data: () => data.get(path) }; },
    async getDocs(path) { return { docs: [...data].filter(([key]) => key.startsWith(path+'/')).map(([,v])=>({data:()=>v})) }; },
  };
  return { ...load('services/watchProgressStore.ts', {'firebase/firestore': firestore, './firebase': { auth, db: {} }}), data, writes, auth };
}
const entry = { anime_id: 10, episode_id: 21, current_time: 43.9, duration: 300.4, episode_number: 2, title: 'Serie de prueba' };
test('watch progress writes and reads only authenticated account and profile', async () => {
  const f=fixture(); await f.watchProgressStore.save(1, entry);
  assert.equal(f.writes[0].path, 'profiles/alice/profiles/1/watch_progress/10');
  assert.equal((await f.watchProgressStore.get(1,10)).current_time,43);
  assert.equal((await f.watchProgressStore.list(1)).length,1);
  assert.equal((await f.watchProgressStore.list(2)).length,0);
  f.auth.currentUser={uid:'bob'}; assert.equal(await f.watchProgressStore.get(1,10),null);
  f.auth.currentUser=null; await assert.rejects(()=>f.watchProgressStore.save(1,entry), /Inicia sesión/);
});
test('last queued episode wins even when earlier writes are slow', async()=>{
  let release; const first=new Promise(resolve=>release=resolve);
  const f=fixture(e=>e.episode_id===21?first:undefined);
  const old=f.watchProgressStore.save(1,entry); const recent=f.watchProgressStore.save(1,{...entry,episode_id:23});
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(f.writes.length,1);
  release(); await Promise.all([old,recent]); assert.equal((await f.watchProgressStore.get(1,10)).episode_id,23);
});
test('rejects invalid identifiers/seconds and ignores malformed stored values',async()=>{
  const f=fixture();
  for(const current_time of [-1,Infinity,NaN]) await assert.rejects(()=>f.watchProgressStore.save(1,{...entry,current_time}));
  await assert.rejects(()=>f.watchProgressStore.save(-1,entry));
  await assert.rejects(()=>f.watchProgressStore.save(1,{...entry,episode_id:0}));
  f.data.set('profiles/alice/profiles/1/watch_progress/10',{...entry,duration:Infinity});
  assert.equal((await f.watchProgressStore.list(1)).length,0);
});
function resume(saved, episodes) { return load('services/resumeTargetApi.ts', { './watchProgressStore': { watchProgressStore: {get:async()=>saved} }, './backendClient': { backendClient: {get:async()=>({data:{episodes}})} } }).resumeTargetApi; }
test('resume preserves exact position and unknown cross-origin chapter bookmark',async()=>{
  assert.equal((await resume(entry,[]).get(1,10)).resumeTime,43.9);
  const result=await resume({...entry,position_known:false,current_time:0},[]).get(1,10);
  assert.equal(result.episodeId,21); assert.equal(result.resumeTime,0);
});
test('completed chapter continues at the next real playable episode, not number + 1',async()=>{
  const api=resume({...entry,current_time:300,duration:300},[{id:40,episode_number:10,video_url:'x'},{id:21,episode_number:2,video_url:'x'},{id:30,episode_number:3}]);
  assert.equal((await api.get(1,10)).episodeId,40);
  assert.equal((await resume({...entry,current_time:300,duration:300},[{id:21,episode_number:2,video_url:'x'}]).get(1,10)).episodeId,null);
});
