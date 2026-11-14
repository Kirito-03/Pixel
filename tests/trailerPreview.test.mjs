import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('trailer requests sound, falls back on blocked autoplay, and user can restore it',async()=>{
 const hooks=[],effects=[],commands=[];let cursor=0,events,muted=false;
 const player={unMute(){commands.push('sound');muted=false;},mute(){commands.push('mute');muted=true;},setVolume(){},playVideo(){commands.push('play');},isMuted:()=>muted,destroy(){}};
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState(initial){const n=cursor++;if(!(n in hooks))hooks[n]=initial;return[hooks[n],value=>hooks[n]=value];},useRef(initial){const n=cursor++;return hooks[n]??={current:initial};},useEffect(fn,deps){const n=cursor++;if(!hooks[n]){hooks[n]=deps;effects.push(fn);}}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/TrailerPreview.web.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,window:{location:{origin:'https://example.test'},YT:{Player:function(_,options){events=options.events;return player;},PlayerState:{ENDED:0,PLAYING:1}}},document:{createElement:()=>({})},require(name){if(name==='react')return react;if(name==='react-native')return{View:'View',Text:'Text',TouchableOpacity:'Button',StyleSheet:{create:s=>s,absoluteFillObject:{}}};return{Ionicons:'Icon'};}});
 function find(type,node){if(node?.type===type)return node;for(const child of(node?.props?.children||[]).flat(Infinity)){if(child&&typeof child==='object'){const result=find(type,child);if(result)return result;}}}
 function render(){cursor=0;return exports.default({id:'abcdef12345'});}
 let tree=render();find('div',tree).props.ref.current={replaceChildren(){}};effects.forEach(fn=>fn());await Promise.resolve();
 events.onReady({target:player});assert.deepEqual(commands,['sound','play']);
 events.onAutoplayBlocked({target:player});tree=render();assert.equal(muted,true);assert.equal(find('Button',tree).props.accessibilityLabel,'Reproducir tráiler con sonido');
 find('Button',tree).props.onPress({stopPropagation(){}});assert.equal(muted,false);assert.equal(commands.at(-1),'play');
});
