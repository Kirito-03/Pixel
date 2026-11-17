import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/publicCatalogCache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});
const create=exports.createPublicCatalogCache;
function store(){const data=new Map();return{data,getItem:async key=>data.get(key)||null,setItem:async(key,value)=>data.set(key,value),removeItem:async key=>data.delete(key)};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('simultaneous consumers share one request, fresh visits and app reopen read saved public data',async()=>{
 const disk=store(),cache=create(disk);let calls=0;const load=async()=>{calls++;return{id:1};};
 await Promise.all([cache.read('anime:1',load),cache.read('anime:1',load)]);assert.equal(calls,1);
 await cache.flush();await cache.read('anime:1',load);await create(disk).read('anime:1',load);assert.equal(calls,1);
});
test('slow revalidation does not block rendering saved data; force refresh waits for the new response',async()=>{
 let time=100,resolve;const disk=store(),cache=create(disk,{now:()=>time,freshMs:100});
 await cache.read('x',async()=>({value:'saved'}));time=300;
 const stale=await cache.read('x',()=>new Promise(done=>resolve=done));assert.equal(stale.value,'saved');await tick();
 const fresh=cache.read('x',async()=>({value:'unused'}),{force:true});resolve({value:'updated'});assert.equal((await fresh).value,'updated');
});
test('offline revalidation keeps the saved data without unhandled rejection, but expired data is not presented as current',async()=>{
 let time=100;const disk=store(),cache=create(disk,{now:()=>time,freshMs:10,maxAgeMs:100});
 await cache.read('x',async()=>1);time=120;assert.equal(await cache.read('x',async()=>{throw Error('offline');}),1);await tick();
 time=500;await assert.rejects(cache.read('x',async()=>{throw Error('offline');}));
});
test('cache storage is bounded, handles corruption/quota errors and never persists explicitly transient queries',async()=>{
 const disk=store(),cache=create(disk,{maxEntries:2});
 await cache.read('a',async()=>1);await cache.read('b',async()=>2);await cache.read('c',async()=>3);await cache.flush();
 assert.equal([...disk.data.keys()].filter(k=>k.endsWith(':a')).length,0);
 await cache.read('search',async()=>4,{persist:false});await cache.flush();assert.equal([...disk.data.keys()].some(k=>k.endsWith(':search')),false);
 const broken={getItem:async()=>'{bad',setItem:async()=>{throw Error('quota');},removeItem:async()=>{}};const other=create(broken);assert.equal(await other.read('x',async()=>5),5);await other.flush();
});
test('background refresh notifies mounted consumers once and unsubscribed views receive nothing',async()=>{
 let time=10,notified=0;const cache=create(store(),{now:()=>time,freshMs:10});const unsubscribe=cache.subscribe(()=>notified++);
 await cache.read('x',async()=>1);assert.equal(notified,0);time=30;assert.equal(await cache.read('x',async()=>2),1);await tick();assert.equal(notified,1);assert.equal(await cache.read('x',async()=>3),2);
 unsubscribe();time=50;await cache.read('x',async()=>4);await tick();assert.equal(notified,1);
});
test('transient calls do not retain query results in memory or persistent storage',async()=>{
 const disk=store(),cache=create(disk);let calls=0;const load=async()=>++calls;await cache.read('query',load,{persist:false});await cache.read('query',load,{persist:false});assert.equal(calls,2);await cache.flush();assert.equal(disk.data.size,0);
});

test('reader caches use a separate bounded namespace and never retain an empty chapter list',async()=>{
 const disk=store(),reader=create(disk,{prefix:'pixel:manga-reader:v1:',maxEntries:2}),catalog=create(disk);let calls=0;
 const accept=data=>data.chapters.length>0;
 await reader.read('chapters',async()=>{calls++;return{chapters:[]};},{accept});
 await reader.read('chapters',async()=>{calls++;return{chapters:[1]};},{accept});
 await reader.flush();assert.equal(calls,2);assert.equal((await reader.read('chapters',async()=>{throw Error('offline');},{accept})).chapters[0],1);
 await catalog.read('chapters',async()=>({separate:true}));await catalog.flush();
 assert.ok(disk.data.has('pixel:manga-reader:v1:chapters'));assert.ok(disk.data.has('pixel:public-catalog:v1:chapters'));
});
