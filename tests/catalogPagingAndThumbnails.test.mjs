import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {statusAliases} from '../server/services/catalogStatus.js';
import {getNSFWCatalog} from '../server/services/nsfwCatalog.js';
import {createThumbnailCache} from '../server/services/episodeThumbnailCache.js';
test('reading state labels include the stored ongoing/completed values',async()=>{
 const source=fs.readFileSync(new URL('../server/services/mangaService.js',import.meta.url),'utf8');
 const a=source.indexOf('export async function queryMangaCache'),b=source.indexOf('\nasync function resolveFallbackMangaCover',a);
 const ctx={statusAliases};vm.runInNewContext(source.slice(a,b).replace('export async function','async function')+'\nglobalThis.run=queryMangaCache;',ctx);
 const calls=[],pool={query:async(sql,params)=>{calls.push({sql,params});return{rows:sql.includes('COUNT(*)')?[{total:1150}]:[]};}};
 await ctx.run(pool,{page:2,limit:50,status:'En emisión'});
 assert.match(calls[0].sql,/lower\(trim\(status\)\) = ANY/);assert.ok(calls[0].params[0].includes('ongoing'));
 assert.equal(calls[0].params.at(-1),50);assert.ok(statusAliases('Finalizado').includes('completed'));
});
test('catalog filters and pages query the full database with stable order and bounded parameters',async()=>{
 const calls=[],pool={query:async(sql,params)=>{calls.push({sql,params});return{rows:sql.includes('COUNT(*)')?[{total:121}]:sql.includes('DISTINCT')?[{category:'Fixture'}]:[{id:'51',title:'Fixture'}]};}};
 const result=await getNSFWCatalog(pool,{page:2,limit:1000,status:'Finalizado',search:"x'",category:'Fixture'});
 assert.equal(result.pagination.totalPages,3);assert.equal(result.pagination.limit,50);assert.equal(calls[1].params.at(-1),50);assert.match(calls[1].sql,/updated_at DESC, id DESC/);
 assert.ok(calls[0].params[0].includes('completed'));assert.equal(calls[0].params[1],"%x'%");assert.match(calls[0].sql,/jsonb_array_elements_text/);assert.equal(result.categories[0],'Fixture');
});
const jpeg=Buffer.from([255,216,1,2,255,217]);
test('thumbnail requests deduplicate, cache valid JPEGs and evict by byte budget',async()=>{
 let calls=0;const get=createThumbnailCache({maxBytes:6,load:async()=>{calls++;return jpeg;}});
 await Promise.all([get('1/1'),get('1/1')]);assert.equal(calls,1);
 await get('1/1');assert.equal(calls,1);await get('1/2');await get('1/1');assert.equal(calls,3);
 await assert.rejects(get('../x'));assert.equal(calls,3);
});
test('thumbnail errors and non-image responses are not cached',async()=>{
 let calls=0;const get=createThumbnailCache({load:async()=>{calls++;return calls===1?Buffer.from('<html>bad</html>'):jpeg;}});
 await assert.rejects(get('1/1'));assert.deepEqual(await get('1/1'),jpeg);assert.equal(calls,2);
});
