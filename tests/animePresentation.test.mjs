import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/animePresentation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,URL});
test('Drive trailers take priority with an independent YouTube fallback, even without a YouTube ID',()=>{
 const source=exports.resolveAnimeTrailer({id:1,trailer_site:'GDrive',trailer_id:'73y6CAqPomE'});
 assert.equal(source.id,'https://pixelnosekai.com/api/stream/Anime/1/trailer.mp4');
 assert.equal(source.fallbackYoutubeId,'73y6CAqPomE');
 assert.ok(exports.resolveAnimeTrailer({id:2,trailer_site:'gdrive'}));
 assert.equal(exports.resolveAnimeTrailer({id:-1,trailer_site:'gdrive'}),null);
 assert.equal(exports.resolveAnimeTrailer({id:1,trailer_site:'youtube',trailer_id:'invalid'}),null);
});
test('related entries prioritize real franchise matches and deduplicate alternate titles, IDs and the current show without collapsing seasons',()=>{
 const current={id:1,title:'A Chronicle',title_english:'The Chronicle',franchise_key:'chronicle'};
 const rows=exports.relatedAnime(current,[{id:4,title:'A Chronicle 3rd Season',franchise_key:'chronicle',release_date:'2026'},{id:2,title:'A Chronicle 2nd Season',franchise_key:'chronicle',release_date:'2025'}],[{id:3,title:'Other show'},{id:9,title:'The Chronicle'},{id:2,title:'Duplicate season'},{id:8,title:'OTHER SHOW'}]);
 assert.equal(rows.map(row=>row.id).join(','),'2,4,3');
});
test('when franchise metadata is absent only explicit season/part suffixes establish the conservative title group',()=>{
 assert.equal(exports.seriesSearchTerm('Long Chronicle 2nd Season'),'Long Chronicle');
 assert.equal(exports.seriesSearchTerm('Long Chronicle: The Final Season Part 2'),'Long Chronicle');
 const rows=exports.relatedAnime({id:1,title:'Long Chronicle'},[{id:3,title:'Long Chronicle Season 3'},{id:5,title:'Long Chronicle Other Story'},{id:2,title:'Long Chronicle 2nd Season'}],[{id:9,title:'Unrelated'}]);
 assert.equal(rows.map(row=>row.id).join(','),'3,2,9');
});
test('different seasons remain available even when a provider gives them the same series TMDB ID and generic English name',()=>{
 const rows=exports.relatedAnime({id:1,title:'Long Chronicle',title_english:'Long Chronicle',tmdb_id:42,franchise_key:'chronicle'},[
  {id:2,title:'Long Chronicle 2nd Season',title_english:'Long Chronicle',tmdb_id:42,franchise_key:'chronicle'},
  {id:3,title:'Long Chronicle 3rd Season',title_english:'Long Chronicle',tmdb_id:42,franchise_key:'chronicle'},
 ],[]);
 assert.equal(rows.length,2);
});
test('numbered and Roman sequel titles in the real catalog join their series without stripping years or very short names',()=>{
 assert.equal(exports.seriesSearchTerm('Boku no Hero Academia 6'),'Boku no Hero Academia');
 assert.equal(exports.seriesSearchTerm('BLEACH Sennen Kessen-hen II'),'BLEACH Sennen Kessen-hen');
 assert.equal(exports.seriesSearchTerm('Tokyo 2024'),'Tokyo 2024');
 assert.equal(exports.seriesSearchTerm('Area 88'),'Area 88');
 const rows=exports.relatedAnime({id:1,title:'Boku no Hero Academia 6'},[{id:3,title:'Boku no Hero Academia FINAL SEASON',release_date:'2025'},{id:2,title:'Boku no Hero Academia 7',release_date:'2024'}],[{id:5,title:'Other anime'}]);
 assert.equal(rows.map(row=>row.id).join(','),'2,3,5');
});
test('duplicate catalog records with different titles but the same AniList work are shown once',()=>{
 const poster='https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx404-3gafSRLXJDp6.jpg';
 const rows=exports.relatedAnime({id:1,title:'Unrelated'},[],[
  {id:935,title:'Bastard!! Ankoku no Hakaishin Part 2 (ONA)',poster_url:poster},
  {id:920,title:'BASTARD!!: Ankoku no Hakaishin',poster_url:poster.replace('/large/','/medium/')+'?v=2'},
  {id:757,title:'BASTARD!!: Ankoku no Hakaishin - Jigoku no Chinkonka-hen',poster_url:poster.replace('bx404-','bx159926-')},
 ]);
 assert.equal(rows.map(row=>row.id).join(','),'935,757');
 const own=exports.relatedAnime({id:935,title:'Bastard Part 2',poster_url:poster},[],[{id:920,title:'Other name',poster_url:poster}]);assert.equal(own.length,0);
});
test('explicit seasons released on different dates remain distinct even if imported artwork was reused',()=>{
 const poster='https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx404-shared.jpg';
 const rows=exports.relatedAnime({id:1,title:'Different work'},[{id:2,title:'Long Chronicle Season 1',poster_url:poster,release_date:'2024-01-01'},{id:3,title:'Long Chronicle Season 2',poster_url:poster,release_date:'2025-01-01'}],[{id:2,title:'Long Chronicle Season 1',poster_url:poster,release_date:'2024-01-01'},{id:3,title:'Long Chronicle Season 2',poster_url:poster,release_date:'2025-01-01'}]);
 assert.equal(rows.map(r=>r.id).join(','),'2,3');
});
