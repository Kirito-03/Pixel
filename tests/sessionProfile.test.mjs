import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getStateFromPath } from '../node_modules/@react-navigation/core/lib/module/getStateFromPath.js';
const tick = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
function load(file, mocks) {
 const hooks=[],effects=[],cleanups=new Map();let cursor=0;
 const react={createContext:()=>({Provider:'provider'}),createElement:(_,props)=>props.value,
 useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},
 useRef(value){return hooks[cursor++]??={current:value};},
 useMemo(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,j)=>d!==hooks[i].deps[j]))hooks[i]={value:fn(),deps};return hooks[i].value;},
 useCallback(fn,deps){return this.useMemo(fn,deps);},
 useEffect(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((d,j)=>d!==hooks[i][j]))effects.push({i,fn});hooks[i]=deps;}};
 // Hooks are imported as free functions by TypeScript.
 react.useCallback=(fn,deps)=>react.useMemo(()=>fn,deps);
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,console,require(n){if(n==='react')return react;if(n in mocks)return mocks[n];throw Error(n);}});
 return{exports,render(name){cursor=0;const result=exports[name]({children:null});for(const {i,fn}of effects.splice(0)){cleanups.get(i)?.();cleanups.set(i,fn());}return result;},unmount(){for(const f of cleanups.values())f?.();}};
}
function memory(seed={}) {const map=new Map(Object.entries(seed));return {map,ready:async()=>{},getObject:k=>map.get(k),getString:k=>map.get(k),setObject:(k,v)=>map.set(k,v),setString:(k,v)=>map.set(k,v),delete:k=>map.delete(k)};}
function utility(file){return load(file,{}).exports;}
const {restoreProfileSelection}=utility('services/profileSelection.ts');

test('auth never exposes a cached account or the login page before Firebase finishes session hydration',async()=>{
 const storage=memory({userSession:{uid:'cached-user',role:'user'}}),ready=deferred();storage.ready=()=>ready.promise;
 let notify,subscriptions=0,stopped=0;
 const h=load('contexts/AuthContext.tsx',{'../services/storage':{Storage:storage},'../services/auth':{subscribeAuth:callback=>{notify=callback;subscriptions++;return()=>stopped++;},logout:async()=>{}}});
 assert.equal(h.render('AuthProvider').isLoading,true);await tick();assert.equal(subscriptions,0);
 ready.resolve();await tick();let state=h.render('AuthProvider');assert.equal(state.user,null);assert.equal(state.isLoading,true);
 notify({uid:'verified-user',email:'fixture@example.test'});state=h.render('AuthProvider');assert.equal(state.user.uid,'verified-user');assert.equal(state.isLoading,false);
 h.unmount();assert.equal(stopped,1);
});
test('refresh restores only a profile verified under the signed-in account; switching account hides it immediately',async()=>{
 const verified=deferred(),auth={user:{uid:'owner-a'},isLoading:false,profileSession:0};
 const storage=memory({'pixel.selectedProfile:owner-a':{uid:'owner-a',profileId:12}});let calls=0;
 const h=load('contexts/ProfileContext.tsx',{'../services/storage':{Storage:storage},'./AuthContext':{useAuth:()=>auth},'../services/db/profileService':{profileService:{getProfile:async(id,uid)=>{calls++;assert.equal(uid,'owner-a');return verified.promise;}}},'../services/profileSelection':{restoreProfileSelection}});
 let state=h.render('ProfileProvider');assert.equal(state.profileLoading,true);assert.equal(state.currentProfile,null);await tick();assert.equal(calls,1);
 verified.resolve({id:12,name:'My profile',avatar_url:'',usuario_id:0});await tick();state=h.render('ProfileProvider');assert.equal(state.currentProfile.id,12);assert.equal(state.profileLoading,false);
 auth.user={uid:'owner-b'};state=h.render('ProfileProvider');assert.equal(state.currentProfile,null);assert.equal(state.profileLoading,true);await tick();assert.equal(h.render('ProfileProvider').currentProfile,null);
 h.unmount();
});
test('deleted, malformed and foreign profile selections cannot authorize content',async()=>{
 let reads=0;const lookup=async()=>{reads++;return null;};
 assert.equal(await restoreProfileSelection('a',{uid:'b',profileId:12},lookup),null);
 assert.equal(await restoreProfileSelection('a',{uid:'a',profileId:NaN},lookup),null);assert.equal(reads,0);
 assert.equal(await restoreProfileSelection('a',{uid:'a',profileId:12},lookup),null);assert.equal(reads,1);
});
test('deep URLs to content, settings and downloads do not bypass profile selection',()=>{
 const {profileNavigationScreens}=utility('utils/profileNavigation.ts');
 const screens={Ingreso:'login',Registro:'register',SeleccionPerfil:'profiles',Principal:{screens:{Perfil:'profile',Inicio:'home',MiLista:'mylist'}},Descargas:'downloads',Admin:'admin',LegalScreen:'legal/:type'};
 const choose=profileNavigationScreens(screens,true,false,true);
 for(const url of ['/profile','/home','/mylist','/downloads','/admin'])assert.equal(getStateFromPath(url,{screens:choose}),undefined,url);
 assert.equal(getStateFromPath('/profiles',{screens:choose}).routes[0].name,'SeleccionPerfil');
 const selected=profileNavigationScreens(screens,true,true,false);assert.equal(getStateFromPath('/profile',{screens:selected}).routes[0].name,'Principal');assert.equal(getStateFromPath('/admin',{screens:selected}),undefined);
});

test('a fresh Firebase sign-in clears the old selection before exposing the account, while role enrichment cannot reset a newly chosen profile',async()=>{
 const storage=memory();let notify;
 const h=load('contexts/AuthContext.tsx',{'../services/storage':{Storage:storage},'../services/auth':{subscribeAuth:callback=>{notify=callback;return()=>{};},logout:async()=>{}}});
 h.render('AuthProvider');await tick();notify(null);h.render('AuthProvider');
 storage.setObject('pixel.selectedProfile:owner',{uid:'owner',profileId:12});
 notify({uid:'owner',email:'fixture@example.test'});let state=h.render('AuthProvider');
 assert.equal(state.profileSession,1);assert.equal(storage.getObject('pixel.selectedProfile:owner'),undefined);
 storage.setObject('pixel.selectedProfile:owner',{uid:'owner',profileId:15});
 await state.login({uid:'owner',email:'fixture@example.test',role:'user'});state=h.render('AuthProvider');
 assert.equal(state.profileSession,1);assert.equal(storage.getObject('pixel.selectedProfile:owner').profileId,15);
 h.unmount();
});
