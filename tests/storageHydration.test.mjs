import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture() {
 let resolve;const snapshot=new Promise(r=>resolve=r);
 const storage={getAllKeys:async()=>['currentProfile','deleted'],multiGet:()=>snapshot,setItem:async()=>{},removeItem:async()=>{},clear:async()=>{}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/storage.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,require:()=>storage});
 return{Storage:exports.Storage,resolve};
}
test('awaiting storage readiness restores a persisted profile on cold start',async()=>{
 const f=fixture();assert.equal(f.Storage.getObject('currentProfile'),undefined);
 f.resolve([['currentProfile','{"id":1,"name":"Prueba"}']]);await f.Storage.ready();assert.equal(f.Storage.getObject('currentProfile').name,'Prueba');
});
test('a stale storage snapshot cannot overwrite a newly selected profile or resurrect deleted keys',async()=>{
 const f=fixture();const ready=f.Storage.ready();f.Storage.setObject('currentProfile',{id:2});f.Storage.delete('deleted');
 f.resolve([['currentProfile','{"id":1}'],['deleted','old']]);await ready;assert.equal(f.Storage.getObject('currentProfile').id,2);assert.equal(f.Storage.getString('deleted'),undefined);
});
test('clearing storage during hydration does not restore old profile state',async()=>{
 const f=fixture();const ready=f.Storage.ready();f.Storage.clearAll();f.resolve([['currentProfile','{"id":1}']]);await ready;assert.equal(f.Storage.getObject('currentProfile'),undefined);
});
