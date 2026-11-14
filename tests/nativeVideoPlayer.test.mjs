import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('Android pause reflects player events, stays visible while paused and advances only on real end',()=>{
  const hooks=[];let cursor=0;let effects=[];const events={};const timers=new Map();let clock=0;let advanced=0;
  const player={playing:true,currentTime:96,duration:100,
    play(){this.playing=true;events.playingChange?.({isPlaying:true});},pause(){this.playing=false;events.playingChange?.({isPlaying:false});},
    addListener(name,fn){events[name]=fn;return{remove(){delete events[name];}};}};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},
    useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useCallback(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,j)=>d!==hooks[i].deps[j]))hooks[i]={fn,deps};return hooks[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,j)=>d!==hooks[i][j]))effects.push(fn);hooks[i]=deps;}};
  const native={Platform:{OS:'android'},StyleSheet:{create:s=>s,absoluteFill:{}},View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity'};
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../components/EpisodePlayer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{exports,setTimeout:fn=>{timers.set(++clock,fn);return clock;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},require(name){
    if(name==='react')return react;if(name==='react-native')return native;
    if(name==='expo-video')return{useVideoPlayer:()=>player,VideoView:'VideoView'};
    if(name==='expo-status-bar')return{StatusBar:'StatusBar'};
    if(name==='expo-linear-gradient')return{LinearGradient:'LinearGradient'};
    if(name==='@expo/vector-icons')return{Ionicons:'Ionicons'};
    return{};
  }});
  const props={videoUrl:'https://example.test/video.mp4',episode:{id:'1',number:1,title:'Prueba'},animeTitle:'Prueba',hasNextEpisode:true,hasPreviousEpisode:false,onClose(){},onNextEpisode:()=>advanced++,onProgress(){}};
  function render(){cursor=0;const tree=exports.NativeVideoPlayer(props);const tasks=effects;effects=[];tasks.forEach(fn=>fn());return tree;}
  function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label)return node;for(const child of (node.props?.children||[]).flat(Infinity)){const result=find(child,label);if(result)return result;}return null;}
  let tree=render();const pause=find(tree,'Pausar capítulo');assert.ok(pause);pause.props.onPress();tree=render();
  assert.equal(player.playing,false);assert.ok(find(tree,'Reproducir capítulo'));assert.equal(advanced,0);assert.equal(timers.size,0);
  find(tree,'Reproducir capítulo').props.onPress();tree=render();assert.equal(player.playing,true);assert.ok(find(tree,'Pausar capítulo'));
  events.playToEnd();assert.equal(advanced,1);
});
