import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../components/AnimeSeriesModal.tsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function fixture(name) {
 const a=source.indexOf(`  const ${name} = async () => {`), b=source.indexOf('\n  };',a)+6;
 const requestScope={current:{id:1,visible:true,details:0,streams:0}}, pending=[],writes=[];
 const context={requestScope,currentContent:{id:1,type:'anime'},console:{error(){}},
 catalogService:{getAnimeById:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),getAnimeEpisodes:async()=>[]},
 setLoading(){},setLoadingStreaming(){},setDetailData:x=>writes.push(x),setStreamingInfo:x=>writes.push(x),setSelectedSeason(){},setTrailerKey(){},setTrailerFallback(){}};
 const js=ts.transpileModule(source.slice(a,b)+`\nglobalThis.run=${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(js,context);
 return {context,pending,writes};
}
for(const name of ['loadContentDetails','loadStreamingInfo']) {
 test(`${name} ignores responses and errors from the previously opened anime`,async()=>{
  for(const failed of [false,true]) {
   const f=fixture(name), promise=f.context.run();
   f.context.requestScope.current.id=2;
   if(failed)f.pending[0].reject(Error('late'));else f.pending[0].resolve({id:1,title:'Old'});
   await promise;assert.equal(f.writes.length,0);
  }
 });
 test(`${name} ignores a superseded refresh for the same anime`,async()=>{
  const f=fixture(name), old=f.context.run(), fresh=f.context.run();
  f.pending[0].resolve({id:1,title:'Old'});await old;assert.equal(f.writes.length,0);
  f.pending[1].resolve({id:1,title:'Fresh'});await fresh;assert.equal(f.writes.length,1);
 });
}
