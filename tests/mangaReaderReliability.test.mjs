import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createChapterPageLoader, extractOriginalPages, normalizeChapterUrl } from '../server/services/mangaPageCache.js';
import { getStateFromPath } from '../node_modules/@react-navigation/core/lib/module/getStateFromPath.js';
import { getPathFromState } from '../node_modules/@react-navigation/core/lib/module/getPathFromState.js';
function module(file) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports,setTimeout,clearTimeout,URL,AbortController,require(){return{};}});
 return exports;
}
const retry = module('utils/readerRetry.ts'), navigation = module('utils/mangaChapterNavigation.ts'), html = module('utils/nativeReaderHtml.ts');
const url = 'https://dragontranslation.org/manga/fixture/capitulo-2/';
const fixture = '<div class="reading-content"><img src="/placeholder.png" data-src="/page.jpg" srcset="/small.jpg 300w, /original.jpg 1200w"><img data-src="/next.jpg"></div>';

test('chapter cache deduplicates concurrent requests, persists successful pages and rejects unrelated origins',async()=>{
 let calls=0,written;let finish;
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return{rows:written?[{pages:written}]:[]};if(sql.startsWith('INSERT'))written=JSON.parse(args[1]);return{rows:[]};}};
 const load=createChapterPageLoader({fetchHtml:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
 const a=load(pool,url),b=load(pool,url);await new Promise(r=>setImmediate(r));finish(fixture);
 assert.deepEqual(await a,await b);assert.equal(calls,1);assert.equal((await load(pool,url)).meta.cache_hit,true);
 const restarted=createChapterPageLoader({fetchHtml:async()=>{throw Error('must use DB');}});
 assert.equal((await restarted(pool,url)).meta.source,'db');assert.equal(written.length,2);
 assert.equal(await load(pool,'http://127.0.0.1/private'),null);
 assert.equal(normalizeChapterUrl('https://dragontranslation.org.evil.test/manga/x'),null);
 assert.equal(normalizeChapterUrl(encodeURIComponent(encodeURIComponent(url))),url);
});
test('empty responses and failures are never saved as successful page caches',async()=>{
 let calls=0;const load=createChapterPageLoader({fetchHtml:async()=>++calls===1?'':fixture});
 assert.equal((await load(null,url)).pages.length,0);assert.equal((await load(null,url)).pages.length,2);assert.equal(calls,2);
});
test('image extraction selects the original srcset and handles lazy/relative URLs without requesting a thumbnail',()=>{
 const pages=extractOriginalPages(fixture,url);
 assert.match(decodeURIComponent(pages[0]),/original\.jpg/);assert.match(decodeURIComponent(pages[1]),/next\.jpg/);
 assert.deepEqual(extractOriginalPages('<div class="reading-content"><img src="https://evil.test/img.jpg"></div>',url),[]);
});
test('reader retries empty/temporary failures until success with bounded backoff and stops on cancellation',async()=>{
 let calls=0;const waits=[],c=new AbortController();
 const result=await retry.loadReaderPages({signal:c.signal,request:async()=>{calls++;if(calls===2)throw Error('offline');return{pages:calls<4?[]:['page']};},onRetry(){},wait:async ms=>waits.push(ms)});
 assert.deepEqual(Array.from(result),['page']);assert.deepEqual(waits,[3000,6000,12000]);assert.equal(retry.readerRetryDelay(100),30000);
 const aborted=new AbortController();let count=0;
 assert.equal(await retry.loadReaderPages({signal:aborted.signal,request:async()=>{count++;return{pages:[]};},onRetry:()=>aborted.abort(),wait:async()=>{}}),null);assert.equal(count,1);
 await assert.rejects(()=>retry.loadReaderPages({signal:c.signal,request:async()=>{throw{response:{status:404}};},onRetry(){}}));
});
test('canonical chapter links hide upstream URLs and previous encoded links remain readable',()=>{
 const source=fs.readFileSync(new URL('../navigation/AppNavigator.tsx',import.meta.url),'utf8');
 const config=vm.runInNewContext('('+source.match(/const linking: LinkingOptions<LinkRoutes> = ([\s\S]*?\n});/)[1]+')').config;
 const state=getStateFromPath('/manga/fixture/cap-2',config);
 assert.ok(state);assert.equal(getPathFromState(state,config),'/manga/fixture/cap-2');
 const old=getStateFromPath('/manga/read/fixture/'+encodeURIComponent(encodeURIComponent(url)),config);
 assert.ok(old);let route=old.routes[0];while(route.state)route=route.state.routes.at(-1);assert.ok(route.params.chapterId.includes('dragontranslation'));
 const key=navigation.mangaChapterKey({id:url,chapter:'02.5'});assert.equal(key,'cap-2.5');
 assert.match(navigation.mangaChapterKey({id:url,chapter:null}),/^cap-extra-[a-z0-9]+$/);
});
test('native reader displays original image URLs with explicit navigation at both ends and escapes untrusted attributes',()=>{
 const text=html.nativeReaderHtml(['https://example.test/page.jpg?x=" onerror="evil'], '1','3');
 assert.equal((text.match(/Siguiente capítulo →/g)||[]).length,2);assert.equal((text.match(/← Anterior/g)||[]).length,2);
 assert.match(text,/&quot; onerror=&quot;/);assert.match(text,/IntersectionObserver/);assert.match(text,/1600px/);
 assert.doesNotMatch(text,/resizeMultiplier|data-saver|\.256\.jpg/);assert.match(text,/pixelReaderActive/);
});
test('native reader retries failed near pages, stops timers in background and preserves original dimensions',()=>{
 const timers=new Map();let clock=0,observe,requests=0;
 const classes=new Set();const image={dataset:{src:'https://pixelnosekai.com/api/proxy/manga-image?url=https%3A%2F%2Fdragontranslation.org%2Fpage.jpg'},naturalWidth:720,set src(value){this.current=value;requests++;}};
 const message={textContent:''};
 const page={dataset:{page:'1'},style:{},classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},querySelector:s=>s==='img'?image:message};
 const scope={window:{ReactNativeWebView:{postMessage(){}}},document:{querySelectorAll:()=>[page],addEventListener(){}},URL,Array,Math,Number,
  IntersectionObserver:function(fn){observe=fn;this.observe=()=>{};},setTimeout:fn=>{timers.set(++clock,fn);return clock;},clearTimeout:id=>timers.delete(id)};
 const script=html.nativeReaderHtml(['https://pixelnosekai.com/page.jpg'],null,null).match(/<script>([\s\S]*)<\/script>/)[1];
 vm.runInNewContext(script,scope);observe([{target:page,isIntersecting:true}]);assert.equal(requests,1);
 image.onerror();assert.ok(classes.has('failed'));assert.equal(timers.size,1);
 scope.window.pixelReaderActive(false);assert.equal(timers.size,0);
 scope.window.pixelReaderActive(true);assert.equal(requests,2);assert.match(image.current,/_retry=2/);
 image.onload();assert.equal(page.style.maxWidth,'800px');assert.equal(page.style.width,'100%');assert.ok(classes.has('loaded'));assert.equal(timers.size,0);
 observe([{target:page,isIntersecting:true}]);assert.equal(requests,2);
});

test('reader chrome keeps a hysteresis band near the top instead of oscillating on small scrolls',()=>{
 const {createReaderChromeController}=module('utils/readerChrome.ts');
 const update=createReaderChromeController();
 for(const y of [0,12,25,23,32,24,40,80,110]) assert.equal(update(y).topVisible,true);
 assert.equal(update(112).topVisible,false);
 for(const y of [110,114,109,85,40,25,28,26]) assert.equal(update(y).topVisible,false);
 assert.equal(update(24).topVisible,true);
 assert.equal(update(-9).topVisible,true);
});
test('bottom reader menu needs deliberate direction changes and returns near the top',()=>{
 const {createReaderChromeController}=module('utils/readerChrome.ts');
 const update=createReaderChromeController();
 update(0);update(80);assert.equal(update(160).bottomVisible,false);
 for(const y of [159,160,159,160,159,160]) assert.equal(update(y).bottomVisible,false);
 update(145);assert.equal(update(125).bottomVisible,true);
 update(150);assert.equal(update(175).bottomVisible,true);
 assert.equal(update(184).bottomVisible,false);
 assert.equal(update(15).bottomVisible,true);
 assert.equal(createReaderChromeController()(0).bottomVisible,true);
});
test('native scroll bridge preserves its reserved layout and reports offsets to the hysteresis controller',()=>{
 let y=0,scroll;const messages=[];
 const document={querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(name,fn)=>{if(name==='scroll')scroll=fn;}};
 const scope={window:{ReactNativeWebView:{postMessage:value=>messages.push(JSON.parse(value))},get scrollY(){return y;}},
   document,URL,Array,Math,Number,innerHeight:800,IntersectionObserver:function(){this.observe=()=>{};},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout};
 const markup=html.nativeReaderHtml([],null,null,180,80);
 assert.match(markup,/padding-top:180px;padding-bottom:80px/);
 vm.runInNewContext(markup.match(/<script>([\s\S]*)<\/script>/)[1],scope);
 for(const value of [0,30,112,109,100,24]){y=value;scroll();}
 assert.deepEqual(messages.filter(m=>m.type==='scroll').map(m=>m.value),[0,30,112,109,100,24]);
 assert.equal(messages.some(m=>m.type==='atTop'),false);
});
