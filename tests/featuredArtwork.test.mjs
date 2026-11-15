import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import fs from 'node:fs';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/featuredArtwork.ts',import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('hero prefers a real banner with a large cover over medium or portrait-only art',()=>{
  const rows=[{id:1,poster_url:'/cover/medium/a',banner_url:'/banner/a'},{id:2,poster_url:'/cover/large/b'},{id:3,poster_url:'/cover/large/c',banner_url:'/banner/c'},{id:4,poster_url:'/cover/large/d',banner_url:'/banner/d'}];
  assert.equal(exports.prioritizeFeaturedArtwork(rows).map(x=>x.id).join(','),'3,4,1,2');
  assert.equal(rows[0].id,1);
});
test('a portrait stored as banner is not ranked as panoramic artwork',()=>{
  const rows=[{id:1,poster_url:'https://cdn.myanimelist.net/images/anime/a.jpg',banner_url:'https://cdn.myanimelist.net/images/anime/b.jpg'},{id:2,poster_url:'/large/a',banner_url:'/banner/real.jpg'}];
  assert.equal(exports.prioritizeFeaturedArtwork(rows)[0].id,2);
});
