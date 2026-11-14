import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyAnimeResolver } from '../services/legacyAnimeMetadata.js';
function fixture(media = {id:167152,title:{romaji:'Serie de prueba'},coverImage:{large:'https://example.test/poster.jpg'},isAdult:false}) {
  const records = new Map(); let calls = 0;
  const pool = {query:async(sql, args)=>{
    if (sql.startsWith('SELECT')) return { rows: records.has(args[0]) ? [{payload:records.get(args[0])}] : [] };
    records.set(args[0], args[1] ? JSON.parse(args[1]) : null); return {rows:[]};
  }};
  const resolve = createLegacyAnimeResolver({pool, fetchMedia:async()=>{calls++;return {ok:true,status:200,json:async()=>({data:{Media:media}})};}});
  return {resolve, records, calls:()=>calls};
}
test('legacy title/poster is cached persistently, keeping its ID and no fake episodes', async()=>{
  const f=fixture(); const first=await f.resolve(167152); const next=await f.resolve(167152);
  assert.equal(first.title,'Serie de prueba'); assert.equal(next.poster_url,'https://example.test/poster.jpg');
  assert.equal(first.id,167152); assert.deepEqual(first.seasons,[]); assert.equal(f.calls(),1);
  assert.equal(f.records.size,1);
});
test('concurrent lookups share one provider request and invalid IDs do no work', async()=>{
  const f=fixture(); await Promise.all([f.resolve(167152),f.resolve(167152)]); assert.equal(f.calls(),1);
  for(const id of ['abc',-1,0,2.5,2147483648]) assert.equal(await f.resolve(id),null);
  assert.equal(f.calls(),1);
});
test('adult and missing metadata are negatively cached outside the public catalog', async()=>{
  for(const media of [null,{id:167152,isAdult:true,title:{romaji:'Private'}},{id:167152,genres:['Hentai'],title:{romaji:'Private'}}]) {
    const f=fixture(media); assert.equal(await f.resolve(167152),null); assert.equal(await f.resolve(167152),null); assert.equal(f.calls(),1);
  }
});
test('temporary API failure is not cached as a permanent missing title', async()=>{
  let writes=0;const resolve=createLegacyAnimeResolver({pool:{query:async(sql)=>{if(!sql.startsWith('SELECT'))writes++;return{rows:[]};}},fetchMedia:async()=>({ok:false,status:429})});
  await assert.rejects(resolve(167152),/metadatos/);assert.equal(writes,0);
});
