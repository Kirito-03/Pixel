import test from 'node:test';import assert from 'node:assert/strict';import{getRelatedAnime}from'../server/services/relatedAnime.js';
test('related pool ranks the full active catalog by genre similarity and release proximity, without sending full descriptions',async()=>{
 const calls=[],pool={query:async(sql,params)=>{calls.push({sql,params});return{rows:calls.length===1?[{genres:['Action','Fantasy'],release_date:'2026-01-01'}]:[{id:2,title:'Fixture',description:'Esta es la historia de una aventura y de sus personajes. '.repeat(20)}]};}};
 assert.equal((await getRelatedAnime(pool,1))[0].id,2);assert.ok((await getRelatedAnime({query:async(sql)=>({rows:sql.includes('SELECT genres')?[{genres:['Action']}]:[{id:3,description:'Esta es la historia de una aventura y de sus personajes. '.repeat(20)}]})},3))[0].description.length<=240);assert.match(calls[1].sql,/WHERE overlap>0/);assert.match(calls[1].sql,/unnest\(COALESCE\(genres,ARRAY\[\]::text\[\]\)\)/);assert.ok(!calls[1].sql.includes('genres::jsonb'));assert.match(calls[1].sql,/id<>\$1/);assert.match(calls[1].sql,/genre_count\+cardinality/);assert.deepEqual(calls[1].params,[1,['action','fantasy'],2026]);
});
test('invalid or missing IDs and records without genres do not scan recommendation candidates',async()=>{
 let calls=0;const pool={query:async()=>{calls++;return{rows:[]};}};assert.deepEqual(await getRelatedAnime(pool,-1),[]);assert.equal(calls,0);assert.deepEqual(await getRelatedAnime(pool,2),[]);assert.equal(calls,1);
});
