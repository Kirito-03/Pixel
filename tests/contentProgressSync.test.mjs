import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/contentProgressEngine.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,Math,Map,Set,Object,Promise,Number,Error,JSON,encodeURIComponent});
const {createContentProgressEngine,progressKey,newerProgress}=exports;
const A={uid:'account-a',profileId:1}, B={uid:'account-a',profileId:2}, C={uid:'account-b',profileId:1};
function storage() {const data=new Map();return {data,async getItem(key){return data.get(key)||null;},async setItem(key,value){data.set(key,value);}};}
function cloud() {
 const data=new Map();let online=true;
 const key=s=>`${s.uid}:${s.profileId}`;
 return {data,setOnline:value=>online=value,
  async read(scope){if(!online)throw Error('offline');return structuredClone(data.get(key(scope))||{});},
  async write(scope,rows){if(!online)throw Error('offline');const all=data.get(key(scope))||{},confirmed={};for(const row of rows){const id=progressKey(row.kind,row.id);if(newerProgress(row,all[id]))all[id]=structuredClone(row);confirmed[id]=all[id];}data.set(key(scope),all);return structuredClone(confirmed);},
 };
}
function client(remote,local=storage(),initial=1000) {let time=initial,uid='account-a';const engine=createContentProgressEngine({storage:local,remote,now:()=>time,assertScope:scope=>{if(scope.uid!==uid)throw Error('wrong account');}});return {engine,local,tick:value=>time=value,setUid:value=>uid=value};}
const manga=(chapter)=>({chapterId:`https://dragontranslation.org/manga/fixture/capitulo-${chapter}/`,chapterNumber:String(chapter)});

test('a fresh installation restores chapter 12 from cloud, isolated by profile and account',async()=>{
 const remote=cloud(), phone=client(remote);await phone.engine.save(A,'manga','fixture',manga(12));await phone.engine.sync(A);
 const laptop=client(remote);await laptop.engine.sync(A);assert.equal((await laptop.engine.read(A)).records['manga:fixture'].chapterNumber,'12');
 await laptop.engine.sync(B);assert.equal(Object.keys((await laptop.engine.read(B)).records).length,0);
 laptop.setUid('account-b');await laptop.engine.sync(C);assert.equal(Object.keys((await laptop.engine.read(C)).records).length,0);
});
test('offline changes persist across restart and become backed up only after a server confirmation',async()=>{
 const remote=cloud(), local=storage();remote.setOnline(false);let phone=client(remote,local);
 await phone.engine.save(A,'manga','fixture',manga(12));await assert.rejects(phone.engine.sync(A),/offline/);
 let state=await phone.engine.read(A);assert.equal(state.pendingCount,1);assert.equal(state.lastSyncedAt,0);assert.equal(state.failed,true);
 phone=client(remote,local);state=await phone.engine.read(A);assert.equal(state.pendingCount,1);assert.equal(state.records['manga:fixture'].chapterNumber,'12');
 remote.setOnline(true);await phone.engine.sync(A);state=await phone.engine.read(A);assert.equal(state.pendingCount,0);assert.equal(state.lastSyncedAt,1000);
 const restored=client(remote);await restored.engine.sync(A);assert.equal((await restored.engine.read(A)).records['manga:fixture'].chapterNumber,'12');
});
test('an old offline chapter cannot replace a more recent web reading when it reconnects',async()=>{
 const remote=cloud();remote.setOnline(false);const phone=client(remote,storage(),1000);
 await phone.engine.save(A,'manga','fixture',manga(12));await assert.rejects(phone.engine.sync(A));
 remote.setOnline(true);const web=client(remote,storage(),2000);await web.engine.save(A,'manga','fixture',manga(15));await web.engine.sync(A);
 await phone.engine.sync(A);const state=await phone.engine.read(A);assert.equal(state.records['manga:fixture'].chapterNumber,'15');assert.equal(state.pendingCount,0);
});
test('a new local chapter written during an in-flight upload stays pending until its own confirmation',async()=>{
 const base=cloud();let release,entered;
 const waiting=new Promise(resolve=>entered=resolve);
 let first=true;
 const remote={...base,async write(scope,rows){if(first){first=false;entered();await new Promise(resolve=>release=resolve);}return base.write(scope,rows);}};
 const phone=client(remote);await phone.engine.save(A,'manga','fixture',manga(11));await waiting;
 phone.tick(1001);await phone.engine.save(A,'manga','fixture',manga(12));release();await phone.engine.sync(A);
 let state=await phone.engine.read(A);assert.equal(state.records['manga:fixture'].chapterNumber,'12');assert.equal(state.pendingCount,0);
 assert.equal(base.data.get('account-a:1')['manga:fixture'].chapterNumber,'12');
});
test('switching accounts during a network request cannot upload old progress into the new account',async()=>{
 let release;const remote=cloud();const baseRead=remote.read;remote.read=async scope=>{await new Promise(resolve=>release=resolve);return baseRead(scope);};
 const phone=client(remote);await phone.engine.save(A,'manga','fixture',manga(12));await new Promise(resolve=>setImmediate(resolve));
 phone.setUid('account-b');release();await assert.rejects(phone.engine.sync(A),/wrong account/);
 assert.equal(remote.data.size,0);assert.equal(Object.keys((await phone.engine.read(C)).records).length,0);
});
test('optimistic or cached snapshots do not acknowledge an unconfirmed outbox',async()=>{
 const remote=cloud();remote.setOnline(false);const phone=client(remote);
 await phone.engine.save(A,'manga','fixture',manga(12));await assert.rejects(phone.engine.sync(A));const row=(await phone.engine.read(A)).records['manga:fixture'];
 await phone.engine.acceptRemote(A,{'manga:fixture':row},false);assert.equal((await phone.engine.read(A)).pendingCount,1);
 await phone.engine.acceptRemote(A,{'manga:fixture':row},true);assert.equal((await phone.engine.read(A)).pendingCount,0);
});
test('legacy data requires an explicit import and cannot overwrite newer cloud data',async()=>{
 const remote=cloud(), local=storage();await local.setItem('pixel_manga_progress_fixture',JSON.stringify({...manga(12),updatedAt:500}));
 const phone=client(remote,local,1000);assert.equal(Object.keys((await phone.engine.read(A)).records).length,0);
 await phone.engine.importRows(A,[{kind:'manga',id:'fixture',...manga(12),updatedAt:500,revision:'legacy'}]);
 assert.equal((await phone.engine.read(A)).records['manga:fixture'].chapterNumber,'12');
 await phone.engine.save(A,'manga','fixture',manga(15));await phone.engine.sync(A);
 await phone.engine.importRows(A,[{kind:'manga',id:'fixture',...manga(12),updatedAt:500,revision:'legacy'}]);
 assert.equal((await phone.engine.read(A)).records['manga:fixture'].chapterNumber,'15');assert.ok(await local.getItem('pixel_manga_progress_fixture'));
});
test('H stores a known playback minute but an opaque marker for the same episode does not erase it',async()=>{
 const remote=cloud(),phone=client(remote);
 await phone.engine.save(A,'h_anime','fixture',{episodeNumber:2,currentTime:420,duration:1440,positionKnown:true});await phone.engine.sync(A);
 await phone.engine.save(A,'h_anime','fixture',{episodeNumber:2,currentTime:0,duration:0,positionKnown:false});await phone.engine.sync(A);
 const laptop=client(remote);await laptop.engine.sync(A);let row=(await laptop.engine.read(A)).records['h_anime:fixture'];assert.equal(row.currentTime,420);assert.equal(row.positionKnown,true);
 await phone.engine.save(A,'h_anime','fixture',{episodeNumber:3,currentTime:0,duration:0,positionKnown:false});await phone.engine.sync(A);row=(await phone.engine.read(A)).records['h_anime:fixture'];assert.equal(row.episodeNumber,3);assert.equal(row.positionKnown,false);
});
test('invalid payloads and corrupted stored records never become cloud uploads',async()=>{
 const remote=cloud(),phone=client(remote);
 await assert.rejects(phone.engine.save(A,'manga','fixture',{chapterId:'',chapterNumber:'12'}),/inválido/);
 await assert.rejects(phone.engine.save(A,'h_anime','fixture',{episodeNumber:1,currentTime:NaN,duration:30,positionKnown:true}),/inválido/);
 await phone.engine.acceptRemote(A,{'manga:fixture':{kind:'manga',id:'fixture',chapterId:'x',chapterNumber:'1',updatedAt:-1,revision:'bad'}},true);
 assert.equal(Object.keys((await phone.engine.read(A)).records).length,0);assert.equal(remote.data.size,0);
});

test('a failed local read cannot overwrite an existing outbox with an empty state',async()=>{
 const remote=cloud(),local=storage();const original=local.getItem;let fail=true;
 await local.setItem('pixel_content_progress_v1:account-a:1',JSON.stringify({records:{},pending:{}}));
 const bytes=local.data.get('pixel_content_progress_v1:account-a:1');
 local.getItem=async key=>{if(fail)throw Error('storage I/O');return original(key);};
 const phone=client(remote,local);await assert.rejects(phone.engine.save(A,'manga','fixture',manga(12)),/storage I\/O/);
 assert.equal(local.data.get('pixel_content_progress_v1:account-a:1'),bytes);assert.equal(remote.data.size,0);
 fail=false;await phone.engine.save(A,'manga','fixture',manga(12));await phone.engine.sync(A);assert.equal((await phone.engine.read(A)).pendingCount,0);
});
test('an unrelated server snapshot cannot clear a failed pending upload or claim a full backup',async()=>{
 const remote=cloud();remote.setOnline(false);const phone=client(remote);
 await phone.engine.save(A,'manga','fixture',manga(12));await assert.rejects(phone.engine.sync(A));
 await phone.engine.acceptRemote(A,{},true);const state=await phone.engine.read(A);
 assert.equal(state.pendingCount,1);assert.equal(state.failed,true);assert.equal(state.lastSyncedAt,0);
});
