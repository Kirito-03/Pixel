import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../utils/briefSynopsis.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('hero copy is bounded at a word boundary and removes provider notes without changing the full source',()=>{
 const source = '<p>Una joven descubre un mundo diferente y debe proteger a su familia. </p>'.repeat(9)+' (Source: Publisher)';
 const brief = exports.briefSynopsis(source);
 assert.ok(brief.length <= 165 && brief.endsWith('…') && !brief.includes('<') && !brief.includes('Source:'));
 assert.equal(exports.briefSynopsis('Una historia breve.'),'Una historia breve.');
 assert.equal(exports.briefSynopsis(null),'');
});
