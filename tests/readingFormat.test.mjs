import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as cheerio from '../server/node_modules/cheerio/dist/esm/index.js';
import { extractPublicationType, normalizePublicationType } from '../server/services/mangaFormat.js';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/readingFormat.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});

test('publication type is explicit metadata, never inferred from a title, URL or generic media kind',()=>{
 assert.equal(exports.readingFormat({title:'Some Manhwa',type:'manga'}),'Lectura');
 assert.equal(exports.readingFormat({publication_type:'Manhua',tags:['Manga']}),'Manhua');
 assert.equal(exports.readingFormat({tags:['Romance','Manhwa']}),'Manhwa');
 assert.equal(exports.readingFormat({tags:['Manga','Drama']}),'Manga');
 assert.equal(exports.readingFormat({tags:['Webtoon']}),'Webtoon');
 assert.equal(exports.readingFormat({publication_type:'unknown'}),'Lectura');
});
test('source extractor uses explicit type labels and genres, not recommendations or synopsis text',()=>{
 const $=cheerio.load('<div class="acard"><h2>Manhwa story</h2><div class="description">Manga and webtoon fans</div></div><div class="post-content_item"><div class="summary-heading">Tipo:</div><div class="summary-content">Manhua</div></div>');
 assert.equal(extractPublicationType($,$('.acard')),null);
 assert.equal(extractPublicationType($),'Manhua');
 const card=cheerio.load('<a class="acard" href="/manga/x"><span class="ac-type">Manhwa</span></a>');
 assert.equal(extractPublicationType(card,card('.acard')),'Manhwa');
 assert.equal(normalizePublicationType('one-shot'),'One-shot');
});
