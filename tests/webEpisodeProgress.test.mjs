import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture(overrides={}) {
  const hooks=[],effects=[],calls=[],cleanups=[];let cursor=0,closed=0,advanced=0;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const n=cursor++;if(!(n in hooks))hooks[n]=value;return[hooks[n],x=>hooks[n]=x];},useRef(value){const n=cursor++;return hooks[n]??=( {current:value});},useEffect(fn){effects.push(fn);}};
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../components/EpisodePlayer.web.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{exports,console,Date,window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},require(name){
    if(name==='react')return react;if(name==='react-native')return{View:'View',Text:'Text',TouchableOpacity:'Button',ScrollView:'ScrollView',StyleSheet:{create:s=>s}};
    if(name==='@expo/vector-icons')return{Ionicons:'Icon'};if(name==='hls.js')return{};
    if(name.includes('progressApi'))return{progressApi:{save:async(profile,entry)=>calls.push({profile,entry})}};
    return{getCurrentBaseURL:()=> 'https://example.test'};
  }});
  const props={episode:{id:21,number:2,url:'https://example.test/video.mp4'},profileId:1,animeId:10,animeTitle:'Prueba',resumeTimeSeconds:90,hasNextEpisode:true,onClose:()=>closed++,onNextEpisode:()=>advanced++,...overrides};
  const tree=exports.default(props);
  function find(type,node=tree){if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of(node.props?.children||[]).flat(Infinity)){const result=child && typeof child === "object" ? find(type,child) : null;if(result)return result;}return null;}
  const video={duration:300,currentTime:0,load(){},play:()=>Promise.resolve()};
  if(find('video'))find('video').props.ref.current=video;
  effects.forEach(fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);});
  return{calls,video,find,cleanups,get closed(){return closed;},get advanced(){return advanced;}};
}
test('web restores minute before saving, throttles updates, flushes pause and ends once',async()=>{
  const f=fixture(),events=f.find('video').props;
  events.onTimeUpdate();assert.equal(f.calls.length,0);
  events.onLoadedMetadata();assert.equal(f.video.currentTime,90);
  events.onTimeUpdate();assert.equal(f.calls[0].entry.current_time,90);
  f.video.currentTime=95;events.onTimeUpdate();assert.equal(f.calls.length,1);
  events.onPause();assert.equal(f.calls.at(-1).entry.current_time,95);
  f.video.currentTime=300;events.onEnded();events.onEnded();assert.equal(f.advanced,1);
  f.cleanups.forEach(fn=>fn());assert.equal(f.calls.at(-1).entry.current_time,300);
});
test('cross-origin iframe saves chapter bookmark without fabricated time',()=>{
  const f=fixture({episode:{id:22,number:3,external_servers:[{url:'https://example.test/embed',server:'Prueba'}]}});
  f.find('iframe').props.onLoad();
  assert.equal(f.calls[0].entry.episode_id,22);assert.equal(f.calls[0].entry.position_known,false);assert.equal(f.calls[0].entry.current_time,0);
});
