import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/catalogFilters.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports });
const { catalogCategories, filterCatalog } = exports;
const items = [
  { id: 1, title: 'Crónicas del bosque', genres: ['Fantasía', 'Drama'] },
  { id: 2, title: 'La torre', genres: ['fantasia', ' Aventura '] },
  { id: 3, title: 'Viaje al bosque', genres: ['Drama', ''] },
  { id: 4, title: 'Sin categoría' },
];
test('categories come from metadata, ignore empty labels and deduplicate accents/case', () => {
  assert.deepEqual(Array.from(catalogCategories(items)), ['Aventura', 'Drama', 'Fantasía']);
  assert.deepEqual(Array.from(catalogCategories([])), []);
});
test('local title search is case/accent insensitive', () => {
  assert.deepEqual(Array.from(filterCatalog(items, ' CRONICAS ', null), x => x.id), [1]);
});
test('category and title search combine, rather than replacing each other', () => {
  assert.deepEqual(Array.from(filterCatalog(items, 'bosque', 'drama'), x => x.id), [1, 3]);
  assert.deepEqual(Array.from(filterCatalog(items, 'bosque', 'FANTASIA'), x => x.id), [1]);
});
test('clearing criteria restores all items including uncategorized records', () => {
  assert.equal(filterCatalog(items, '', null).length, 4);
  assert.equal(filterCatalog(items, '', 'Drama').length, 2);
});
test('unmatched criteria give a true empty result without mutating the catalog', () => {
  assert.equal(filterCatalog(items, 'no match', 'Drama').length, 0);
  assert.equal(items.length, 4);
  assert.equal(items[1].genres[1], ' Aventura ');
});
