import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function runtime(file,mocks,extras={}) {
 const hooks=[];let cursor=0;const effects=[],cleanups=[];
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),createContext:()=>({Provider:'Provider'}),useContext:()=>null,
  useState(initial){const n=cursor++;if(!(n in hooks))hooks[n]=initial;return[hooks[n],value=>hooks[n]=typeof value==='function'?value(hooks[n]):value];},
  useRef(initial){const n=cursor++;return hooks[n]??={current:initial};},useCallback(fn){cursor++;return fn;},useMemo(fn){cursor++;return fn();},
  useEffect(fn,deps){const n=cursor++;if(!hooks[n]||deps.some((d,i)=>d!==hooks[n][i])){effects.push(fn);hooks[n]=deps;}}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,console,...extras,require(name){if(name==='react')return react;if(!(name in mocks))throw Error(name);return mocks[name];}});
 return{exports,render(fn){cursor=0;const tree=fn();while(effects.length){const cleanup=effects.shift()();if(cleanup)cleanups.push(cleanup);}return tree.props.value;},cleanup(){cleanups.forEach(fn=>fn());}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('theme restores persisted light mode and preserves a user choice made before hydration',async()=>{
 let resolve;const writes=[];
 const r=runtime('contexts/ThemeContext.tsx',{'@react-native-async-storage/async-storage':{getItem:()=>new Promise(r=>resolve=r),setItem:async(...args)=>writes.push(args)},'react-native':{Platform:{OS:'android'}},'../theme':{darkColors:{background:'#000'},lightColors:{background:'#fff'}}});
 let value=r.render(()=>r.exports.ThemeProvider({children:null}));value.setTheme('dark');resolve('light');await tick();
 value=r.render(()=>r.exports.ThemeProvider({children:null}));assert.equal(value.theme,'dark');assert.deepEqual(writes,[['pixel.theme','dark']]);r.cleanup();
 const restored=runtime('contexts/ThemeContext.tsx',{'@react-native-async-storage/async-storage':{getItem:async()=> 'light'},'react-native':{Platform:{OS:'android'}},'../theme':{darkColors:{background:'#000'},lightColors:{background:'#fff'}}});
 restored.render(()=>restored.exports.ThemeProvider({children:null}));await tick();assert.equal(restored.render(()=>restored.exports.ThemeProvider({children:null})).theme,'light');restored.cleanup();
});
function updater({code=2,latest=3,dismissed=null,fail=false}={}){
 const alerts=[],opened=[];let stateChange,clock=1,releaseCode=latest;
 const r=runtime('contexts/AppUpdateContext.tsx',{
  'react-native':{Platform:{OS:'android'},Alert:{alert:(...args)=>alerts.push(args)},Linking:{openURL:async url=>opened.push(url)},AppState:{addEventListener:(_,fn)=>{stateChange=fn;return{remove(){}};}}},
  'expo-application':{nativeBuildVersion:String(code),nativeApplicationVersion:'1.0.1'},
  '@react-native-async-storage/async-storage':{getItem:async()=>dismissed,setItem:async(_key,value)=>{dismissed=value;}},
  '../services/androidRelease':{fetchAndroidRelease:async()=>{if(fail)throw Error('offline');return{version:'1.0.2',versionCode:releaseCode,downloadUrl:'https://pixelnosekai.com/api/app-release/android/download?build='+releaseCode};}},
 },{Date:{now:()=>clock}});
 return{r,alerts,opened,render:()=>r.render(()=>r.exports.AppUpdateProvider({children:null})),foreground(next){releaseCode=next;clock+=6*60*60*1000;stateChange('active');}};
}
test('new native build prompts once and opens download only on user action',async()=>{
 const f=updater();f.render();await tick();assert.equal(f.alerts.length,1);assert.equal(f.opened.length,0);
 assert.equal(f.render().available,true);await f.alerts[0][2][1].onPress();await tick();assert.match(f.opened[0],/build=3$/);f.r.cleanup();
});
test('dismissal suppresses same release but a newer build prompts after foreground check',async()=>{
 const f=updater({dismissed:'3'});f.render();await tick();assert.equal(f.alerts.length,0);
 f.foreground(4);await tick();assert.equal(f.alerts.length,1);f.r.cleanup();
});
test('same version is not an update and offline failure does not claim up-to-date',async()=>{
 const f=updater({latest:2});f.render();await tick();assert.equal(f.render().available,false);assert.equal(f.alerts.length,0);f.r.cleanup();
 const offline=updater({fail:true});offline.render();await tick();assert.ok(offline.render().error);assert.equal(offline.render().checked,false);offline.r.cleanup();
});
