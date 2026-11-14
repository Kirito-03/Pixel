import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, Date, Promise, Set, Map, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return module.exports;
}
const policy = load('../utils/publicCatalog.ts');
const { createUniversalSearch } = load('../services/universalSearch.ts', {
  './catalogService': { catalogService: {} }, './mangaApi': { mangaApi: {} }, '../utils/publicCatalog': policy,
});

test('adult flags and labels are excluded independently of profile preferences', () => {
  for (const entry of [{ isAdult: true }, { is_adult: 'TRUE' }, { is_nsfw: 1 }, { type: 'hentai' }, { content_type: 'h_anime' }, { genres: ['Action', ' HENTAI '] }, { tags: [{ name: 'NSFW' }] }, { content_rating: 'pornographic' }, { content_rating: 'erotica' }]) {
    assert.equal(policy.isPublicCatalogItem(entry), false);
  }
  assert.equal(policy.isPublicCatalogItem({ genres: ['Action', 'Romance'], isAdult: false }), true);
  assert.equal(policy.isPublicCatalogItem({ content_rating: 'safe' }), true);
  assert.equal(policy.isPublicCatalogItem(null), false);
});
test('universal results include manga and anime with independent IDs; adult results never pass through', async () => {
  const search = createUniversalSearch({
    anime: async () => [{ id: 7, title: 'A' }, { id: 7, title: 'A duplicate' }, { id: 8, title: 'Hidden', genres: ['Hentai'] }],
    manga: async () => ({ items: [{ id: '7', title: 'M', content_rating: 'safe' }, { id: '9', title: 'Hidden', content_rating: 'pornographic' }] }),
  });
  const result = await search('test');
  assert.deepEqual(Array.from(result.items, item => item.key), ['anime:7', 'manga:7']);
  assert.equal(result.items[1].kind, 'manga');
  assert.equal(result.items[1].manga.id, '7');
});
test('empty or one-character queries never call providers; normalized concurrent/repeated queries share requests', async () => {
  let anime = 0; let manga = 0;
  const search = createUniversalSearch({ anime: async () => { anime++; return [{ id: 1 }]; }, manga: async () => { manga++; return { data: [] }; } });
  await search(' '); await search('a');
  assert.equal(anime + manga, 0);
  await Promise.all([search(' Naruto '), search('naruto')]);
  await search('NARUTO');
  assert.equal(anime, 1); assert.equal(manga, 1);
});
test('one provider may fail without hiding the other, and retry recovers instead of caching a failure', async () => {
  let fail = true;
  const search = createUniversalSearch({ anime: async () => [{ id: 1 }], manga: async () => { if (fail) throw new Error('offline'); return { items: [{ id: 'm', title: 'M' }] }; } });
  const first = await search('query');
  assert.deepEqual(Array.from(first.unavailable), ['manga']);
  assert.equal(first.items.length, 1);
  fail = false;
  const retry = await search('query');
  assert.equal(retry.items.length, 2);
  assert.equal(retry.unavailable.length, 0);
});
test('a total failure remains an explicit error and can be retried', async () => {
  const search = createUniversalSearch({ anime: async () => { throw Error('offline'); }, manga: async () => { throw Error('offline'); } });
  await assert.rejects(search('query'), /No se pudo realizar/);
  await assert.rejects(search('query'), /No se pudo realizar/);
});
test('malformed provider responses behave as partial errors instead of an empty success or crashed grid', async () => {
  const search = createUniversalSearch({ anime: async () => [{ id: 1, title: 'A' }], manga: async () => '<html>unavailable</html>' });
  const result = await search('query');
  assert.equal(result.items.length, 1);
  assert.deepEqual(Array.from(result.unavailable), ['manga']);
});
test('manga is visible among initial suggestions even when many anime match', async () => {
  const search = createUniversalSearch({ anime: async () => Array.from({ length: 12 }, (_, id) => ({ id: id + 1, title: `A${id}` })), manga: async () => ({ items: [{ id: 'm', title: 'M' }] }) });
  const result = await search('query');
  assert.equal(result.items[1].kind, 'manga');
  assert.equal(result.items.length, 13);
});
