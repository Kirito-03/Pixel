import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/catalogSections.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports });
const { dailySelection, catalogSections, localDayKey } = exports;
const items = Array.from({length: 60}, (_, i) => ({id:i+1,slug:`demo-${i}`,status:'Finalizado'}));
const ids = list => Array.from(list, item=>item.slug);
test('daily picks remain stable on reload and catalog reordering, without mutating input', () => {
  assert.deepEqual(ids(dailySelection(items, '2026-11-13', 5)), ids(dailySelection([...items].reverse(), '2026-11-13', 5)));
  assert.equal(items[0].id, 1);
  assert.equal(new Set(ids(dailySelection([...items, items[0]], '2026-11-13', 5))).size, 5);
});
test('another day changes the banner selection; a small/empty catalog is safe', () => {
  assert.notDeepEqual(ids(dailySelection(items, '2026-11-13', 5)), ids(dailySelection(items, '2026-11-14', 5)));
  assert.equal(dailySelection(items.slice(0,2), '2026-11-13', 5).length, 2);
  assert.equal(dailySelection([], '2026-11-13', 5).length, 0);
  assert.equal(localDayKey(new Date(2026,10,13,23,59)), '2026-11-13');
});
test('browse has at most four named rows, bounded items and no repeated title across rows', () => {
  const sections = catalogSections(items, '2026-11-13');
  assert.deepEqual(Array.from(sections, s=>s.title), ['Recién actualizados','Selección del día','Series finalizadas','Para descubrir']);
  const shown = Array.from(sections).flatMap(s=>ids(s.items));
  assert.equal(shown.length, 32);
  assert.equal(new Set(shown).size, 32);
  assert.equal(items.length, 60, 'Browse selection must not discard the searchable source catalog');
  assert.equal(catalogSections([], '2026-11-13').length, 0);
});
test('finished row only contains titles marked finished, and empty rows are omitted', () => {
  const mixed = items.map((item,i)=>({...item,status:i%2?'Finalizado':'En emisión'}));
  const finished = catalogSections(mixed, '2026-11-13').find(s=>s.key==='finished');
  assert.ok(finished.items.every(item=>item.status==='Finalizado'));
  const ongoing = items.map(item=>({...item,status:'En emisión'}));
  assert.equal(catalogSections(ongoing, '2026-11-13').some(s=>s.key==='finished'), false);
});
