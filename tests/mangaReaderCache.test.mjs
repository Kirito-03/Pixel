import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,require:name=>{if(!(name in mocks))throw Error(name);return mocks[name];},Date,Map,Set,Promise,Object,Error,Number,JSON,encodeURIComponent});return exports;}
function fixture(storage=new Map(),handler=async()=>({data:{pages:['https://dragontranslation.org/p1.webp'],chapterId:'x',baseUrl:null}})){
 let calls=0;const store={getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)};
 const cache=load('services/publicCatalogCache.ts'),abort=load('services/mangaReaderCache.ts');
 const {mangaApi}=load('services/mangaApi.ts',{'@react-native-async-storage/async-storage':store,'./publicCatalogCache':cache,'./mangaReaderCache':abort,'./backendClient':{backendClient:{get:async(...args)=>{calls++;return handler(...args);}}},'./db/networkClient':{getCurrentBaseURL:()=> 'https://pixel.test'}});
 return{api:mangaApi,storage,calls:()=>calls};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('a cancelled reader cannot cancel a shared chapter load; returning reuses unchanged original image URLs',async()=>{
 let resolve;const f=fixture(undefined,()=>new Promise(done=>resolve=done)),controller=new AbortController();
 const first=f.api.chapterPages('chapter-x',{signal:controller.signal}),second=f.api.chapterPages('chapter-x');await tick();assert.equal(f.calls(),1);
 controller.abort();await assert.rejects(first,{name:'AbortError'});
 const original='https://dragontranslation.org/original.webp';resolve({data:{pages:[original],chapterId:'chapter-x',baseUrl:null}});
 const result=await second;assert.equal(new URL(result.pages[0]).searchParams.get('url'),original);
 await f.api.chapterPages('chapter-x');assert.equal(f.calls(),1);await tick();
 const reopened=fixture(f.storage);const saved=await reopened.api.chapterPages('chapter-x');assert.equal(reopened.calls(),0);assert.equal(saved.pages[0],result.pages[0]);
});
test('empty pages retry on the next visit and explicit refresh bypasses stored pages',async()=>{
 let empty=true;const f=fixture(undefined,async()=>({data:{chapterId:'x',pages:empty?[]:['/api/stream/Manga/fixture/page.webp'],baseUrl:null}}));
 await assert.rejects(f.api.chapterPages('x'));empty=false;assert.equal((await f.api.chapterPages('x')).pages[0],'https://pixel.test/api/stream/Manga/fixture/page.webp');
 await f.api.chapterPages('x');assert.equal(f.calls(),2);await f.api.chapterPages('x',{refresh:true});assert.equal(f.calls(),3);
});
test('empty chapter catalogs stay retryable; normal revisits are cached and pull refresh fetches again',async()=>{
 let empty=true;const f=fixture(undefined,async()=>({data:{chapters:empty?[]:[{id:'c1',chapter:'1'}]}}));
 assert.equal((await f.api.chapters('fixture')).chapters.length,0);empty=false;
 assert.equal((await f.api.chapters('fixture')).chapters.length,1);await f.api.chapters('fixture');assert.equal(f.calls(),2);
 await f.api.chapters('fixture',{refresh:true});assert.equal(f.calls(),3);
});

test('an already aborted consumer detaches cleanly even when the shared request later fails',async()=>{
 const {withReaderAbort}=load('services/mangaReaderCache.ts');const controller=new AbortController();controller.abort();let reject;
 const underlying=new Promise((_,fail)=>reject=fail);await assert.rejects(withReaderAbort(underlying,controller.signal),{name:'AbortError'});reject(Error('offline'));await tick();
});


test('explicit chapter refresh also invalidates the server chapter catalog',async()=>{
 const requests=[];const f=fixture(undefined,async(url,options)=>{requests.push({url,options});return{data:{chapters:[{id:'c1',chapter:'1'}]}};});
 await f.api.chapters('fixture',{limit:500,preferredLanguage:'es',allowEnglishFallback:true});
 await f.api.chapters('fixture',{allowEnglishFallback:true,preferredLanguage:'es',limit:500});assert.equal(f.calls(),1);
 await f.api.chapters('fixture',{limit:500,preferredLanguage:'es',allowEnglishFallback:true,refresh:true});assert.equal(f.calls(),2);assert.equal(requests[1].options.params.refresh,true);assert.equal(requests[0].options.params.refresh,undefined);
});
