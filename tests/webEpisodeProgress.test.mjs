import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const playbackSources = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../services/episodePlaybackSources.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: playbackSources });
function fixture(overrides={}) {
  const hooks=[],effects=[],calls=[],cleanups=[];let cursor=0,closed=0,advanced=0;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(value){const n=cursor++;if(!(n in hooks))hooks[n]=value;return[hooks[n],x=>hooks[n]=x];},useRef(value){const n=cursor++;return hooks[n]??=( {current:value});},useEffect(fn){effects.push(fn);}};
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../components/EpisodePlayer.web.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{exports,console,Date,setTimeout:()=>1,clearTimeout(){},window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},require(name){
    if(name==='react')return react;if(name==='react-native')return{View:'View',Text:'Text',TouchableOpacity:'Button',ScrollView:'ScrollView',StyleSheet:{create:s=>s}};
    if(name==='../services/episodePlaybackSources')return playbackSources;
    if(name==='./SeekButton')return{default:'SeekButton',__esModule:true};
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
  return{calls,video,find,cleanups,tree,get closed(){return closed;},get advanced(){return advanced;}};
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


test('direct web video can seek ten seconds backward to zero and persists the selected position', () => {
  const f = fixture({ resumeTimeSeconds: 6 });
  f.find('video').props.onLoadedMetadata();
  f.find('SeekButton').props.onPress();
  assert.equal(f.video.currentTime, 0); assert.equal(f.calls.at(-1).entry.current_time, 0);
  assert.equal(f.calls.at(-1).entry.position_known, true);
});


test('Drive MP4 takes the direct player even when the episode retains provider embeds', () => {
  const f = fixture({ episode: { id: 496, number: 11, url: 'https://pixelnosekai.com/api/stream/fixture.mp4', external_servers: [{ server: 'External', url: 'https://provider.test/embed' }] } });
  assert.ok(f.find('video')); assert.equal(f.find('iframe'), null); assert.ok(f.find('SeekButton'));
});
