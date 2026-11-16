import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import ts from'typescript';
const source=fs.readFileSync(new URL('../screens/HomeScreen.tsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function fixture(loaded=true){
 const a=source.indexOf('    const loadContent = async'),b=source.indexOf('\n    const addToMyList',a);let reject;
 const loading=[],errors=[],ctx={homeMounted:{current:true},homeLoaded:{current:loaded},homeGeneration:{current:0},catalogService:{getHomeSections:()=>new Promise((_,r)=>reject=r)},setLoading:value=>loading.push(value),setLoadError:value=>errors.push(value),Alert:{alert(){throw Error('unexpected alert');}}};
 vm.runInNewContext(ts.transpileModule(source.slice(a,b)+'\nglobalThis.run=loadContent;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,ctx);
 return{ctx,loading,errors,reject:()=>reject(Error('offline'))};
}
test('manual refresh preserves already visible home content instead of switching back to a blocking loader',async()=>{
 const f=fixture(),promise=f.ctx.run(true);assert.deepEqual(f.loading,[]);f.reject();await promise;assert.deepEqual(f.loading,[false]);
});
test('a request settling after home unmount does not update its loading or error state',async()=>{
 const f=fixture(),promise=f.ctx.run();f.ctx.homeMounted.current=false;f.ctx.homeGeneration.current++;f.reject();await promise;assert.deepEqual(f.loading,[]);assert.deepEqual(f.errors,[false]);
});
