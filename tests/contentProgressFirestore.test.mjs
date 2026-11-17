import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,mocks={}) {const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,setTimeout,clearTimeout,Date,Math,Map,Set,Object,Promise,Number,Error,JSON,encodeURIComponent,require:name=>mocks[name]||{}});return exports;}
const core=load('services/contentProgressEngine.ts');
const deadline=load('services/progressDeadline.ts');
function fixture(){
 const documents=new Map([['profiles/a',{name:'Account',search_history:{1:{queries:['fixture']}}}],['profiles/a/profiles/1',{name:'One'}],['profiles/a/profiles/2',{name:'Two'}]]),local=new Map();
 const auth={currentUser:{uid:'a'}};let online=true;
 const snapshot=path=>({data:()=>structuredClone(documents.get(path)),exists:()=>documents.has(path)});
 const allowed=path=>{assert.equal(path.split('/')[1],auth.currentUser.uid);if(!online)throw Error('offline');};
 function merge(target,source){for(const [key,value]of Object.entries(source)){if(value&&typeof value==='object'&&!Array.isArray(value)){target[key]??={};merge(target[key],value);}else target[key]=value;}return target;}
 const firestore={doc:(_db,...parts)=>parts.join('/'),async getDocFromServer(path){allowed(path);return snapshot(path);},
  async runTransaction(_db,fn){const changes=[];const result=await fn({get:async path=>{allowed(path);return snapshot(path);},set:(path,value,options)=>{assert.equal(options.merge,true);allowed(path);changes.push([path,value]);}});for(const [path,value]of changes)documents.set(path,merge(structuredClone(documents.get(path)||{}),structuredClone(value)));return result;},
  onSnapshot(){return()=>{};},
 };
 const storage={async getItem(key){return local.get(key)||null;},async setItem(key,value){local.set(key,value);},async getAllKeys(){return [...local.keys()];},async multiGet(keys){return keys.map(key=>[key,local.get(key)||null]);}};
 const api=load('services/contentProgressSync.ts',{'@react-native-async-storage/async-storage':storage,'firebase/firestore':firestore,'./firebase':{auth,db:{}},'./contentProgressEngine':core,'./progressDeadline':deadline});
 return {api,auth,documents,local,firestore,setOnline:value=>online=value};
}
const scope={uid:'a',profileId:1};
test('Firestore updates one profile with merge and retains account settings and the other profile',async()=>{
 const f=fixture();await f.api.contentProgressSync.save(scope,'manga','fixture',{chapterId:'chapter-12',chapterNumber:'12'});await f.api.contentProgressSync.sync(scope);
 await f.api.contentProgressSync.save({uid:'a',profileId:2},'manga','other',{chapterId:'chapter-3',chapterNumber:'3'});await f.api.contentProgressSync.sync({uid:'a',profileId:2});
 const account=f.documents.get('profiles/a');assert.equal(account.name,'Account');assert.deepEqual(account.search_history['1'].queries,['fixture']);
 assert.equal(account.content_progress_v1['1']['manga:fixture'].chapterNumber,'12');assert.equal(account.content_progress_v1['2']['manga:other'].chapterNumber,'3');
});
test('missing/deleted profiles cannot upload and a scope from another account is rejected',async()=>{
 const f=fixture();await f.api.contentProgressSync.save({uid:'a',profileId:3},'manga','fixture',{chapterId:'chapter-12',chapterNumber:'12'});await assert.rejects(f.api.contentProgressSync.sync({uid:'a',profileId:3}),/perfil/);
 assert.equal(f.documents.get('profiles/a').content_progress_v1,undefined);
 f.auth.currentUser={uid:'b'};await assert.rejects(f.api.contentProgressSync.read(scope),/cuenta/);
});
test('legacy imports are claimed only after a cloud confirmation, retained locally, and never assigned twice',async()=>{
 const f=fixture();f.local.set('pixel_manga_progress_fixture',JSON.stringify({chapterId:'chapter-12',chapterNumber:'12',updatedAt:1000}));
 assert.equal((await f.api.legacyMangaRows()).length,1);f.setOnline(false);await assert.rejects(f.api.importLegacyManga(scope));
 assert.equal((await f.api.legacyMangaRows()).length,1);assert.equal(f.local.has('pixel_legacy_manga_claims_v1'),false);
 f.setOnline(true);await f.api.importLegacyManga(scope);
 assert.equal((await f.api.legacyMangaRows()).length,0);assert.equal(f.local.has('pixel_manga_progress_fixture'),true);
 assert.equal(f.documents.get('profiles/a').content_progress_v1['1']['manga:fixture'].chapterNumber,'12');
 assert.equal(JSON.parse(f.local.get('pixel_legacy_manga_claims_v1')).pixel_manga_progress_fixture.profileId,1);
});

test('repeated legacy imports share one flight and cannot claim the same files for another profile concurrently',async()=>{
 const f=fixture();f.local.set('pixel_manga_progress_fixture',JSON.stringify({chapterId:'chapter-19',chapterNumber:'19',updatedAt:1000}));
 let entered,release;const writing=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const original=f.firestore.runTransaction;
 f.firestore.runTransaction=async(...args)=>{entered();await gate;return original(...args);};
 const first=f.api.importLegacyManga(scope);
 assert.equal(f.api.importLegacyManga(scope),first);
 await writing;
 await assert.rejects(f.api.importLegacyManga({uid:'a',profileId:2}),/otro perfil/);
 release();await first;
 assert.equal(JSON.parse(f.local.get('pixel_legacy_manga_claims_v1')).pixel_manga_progress_fixture.profileId,1);
 assert.equal((await f.api.legacyMangaRows()).length,0);
});
