import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({raw='1',focused=true,get=async id=>({id,title:'Fixture'})}={}) {
 const state=[],jobs=[],cleanups=new Map();let cursor=0,calls=0;
 const route={params:{anime:raw}}, navigation={setParams:values=>Object.assign(route.params,values)};
 const react={useRef(value){const i=cursor++;return state[i]??={current:value};},useState(value){const i=cursor++;if(!(i in state))state[i]=value;return[state[i],value=>state[i]=value];},useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,j)=>v!==state[i][j]))jobs.push({i,fn});state[i]=deps;}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../hooks/useAnimeDetailLocation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require(name){if(name==='react')return react;if(name==='react-native')return{Platform:{OS:'web'}};if(name==='@react-navigation/native')return{useRoute:()=>route,useNavigation:()=>navigation,useIsFocused:()=>focused};if(name.includes('catalogService'))return{catalogService:{getAnimeById:async id=>{calls++;return get(id);}}};if(name.includes('universalSearch'))return{animeSearchResult:row=>({content:{id:row.id,type:'anime',title:row.title}})};return{};}});
 return{route,get calls(){return calls;},render(input=null,visible=false){cursor=0;const result=exports.useAnimeDetailLocation(input,visible,()=>{});for(const {i,fn} of jobs.splice(0)){cleanups.get(i)?.();cleanups.set(i,fn());}return result;}};
}
test('refresh recovers the exact anime from the route, and closing removes the query without reopening it',async()=>{
 const f=fixture({raw:'52'});assert.equal(f.render().restoring,true);await tick();let result=f.render();assert.equal(result.content.id,52);assert.equal(result.visible,true);
 result.onClose();result=f.render();await tick();assert.equal(result.visible,false);assert.equal(f.route.params.anime,undefined);assert.equal(f.calls,1);
});
test('inactive screens and invalid route identifiers never load a detail',async()=>{
 for(const options of [{focused:false},{raw:'https://bad.test/'},{raw:'-2'},{raw:'9007199254740992'}]){const f=fixture(options);f.render();await tick();assert.equal(f.calls,0);}
});
test('a failed metadata lookup removes the invalid detail query instead of staying in an endless loader',async()=>{
 const f=fixture({get:async()=>{throw Error('not found');}});f.render();await tick();const result=f.render();assert.equal(result.restoring,false);assert.equal(result.visible,false);
});
test('opening a related anime from a restored detail updates the owner and URL together without another restore lookup',async()=>{
 const f=fixture();f.render();await tick();let result=f.render();
 result.onContentChange({id:52,type:'anime',title:'Related'});result=f.render();await tick();
 assert.equal(result.content.id,52);assert.equal(result.restoring,false);assert.equal(result.visible,true);assert.equal(f.route.params.anime,52);assert.equal(f.calls,1);
 result.onClose();assert.equal(f.render().visible,false);
});
test('related selection replaces a visible input but does not leak into the next card opening', () => {
 const f=fixture();const first={id:1,type:'anime',title:'First'}, next={id:2,type:'anime',title:'Next'};
 let result=f.render(first,true);result.onContentChange({id:52,type:'anime',title:'Related'});
 assert.equal(f.render(first,true).content.id,52);
 result.onClose();assert.equal(f.render(next,true).content.id,2);
});
test('late restoration from an old route cannot replace the new detail', async()=>{
 const pending=new Map();const f=fixture({get:id=>new Promise(resolve=>pending.set(id,resolve))});
 f.render();f.route.params.anime=2;f.render();
 pending.get(2)({id:2,title:'Second'});await tick();assert.equal(f.render().content.id,2);
 pending.get(1)({id:1,title:'Old'});await tick();assert.equal(f.render().content.id,2);
});
