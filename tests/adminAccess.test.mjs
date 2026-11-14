import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,mocks,extra={}){
 const exports={};const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),createContext:()=>({Provider:'Provider'}),useState:x=>[x,()=>{}],useRef:x=>({current:x}),useEffect(){},useContext(){}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,setTimeout:fn=>fn(),console:{log(){},error(){}},...extra,require(name){if(name==='react')return react;if(!(name in mocks))throw Error(name);return mocks[name];}});return exports;
}
test('opening admin reuses verified session; an unverified profile cannot enter',async()=>{
 for(const allowed of [true,false]){
  const navigated=[];let checks=0;
  const api=load('hooks/useProfileScreenLogic.ts',{
   'react-native':{Platform:{OS:'web'},useWindowDimensions:()=>({width:1200})},'expo-image-picker':{},
   '@react-navigation/native':{useNavigation:()=>({navigate:name=>navigated.push(name)})},
   '../contexts/ThemeContext':{useTheme:()=>({})},'../contexts/ProfileContext':{useProfile:()=>({})},'../contexts/AuthContext':{useAuth:()=>({})},
   '../contexts/AdminContext':{useAdmin:()=>({isAdmin:allowed,checkAdminStatus:async()=>{checks++;return false;}})},
   '../services/databaseService':{},'../services/auth':{},'../services/firebase':{auth:{}},
  });
  await api.useProfileScreenLogic().handleAdminAccess();
  assert.equal(checks,allowed?0:1);assert.equal(navigated.length,allowed?1:0);if(allowed)assert.equal(navigated[0],'Admin');
 }
});
test('admin authentication uses SDK token cache and does not log credentials',async()=>{
 let tokenArgs;const logs=[];
 const api=load('contexts/AdminContext.tsx',{
  '@react-native-async-storage/async-storage':{setItem:async()=>{},getItem:async()=>null,removeItem:async()=>{}},
  '../services/firebase':{auth:{currentUser:{email:'admin@example.test',getIdToken:async(...args)=>{tokenArgs=args;return 'firebase-token-test';}}}},
  '../services/adminAuthService':{adminAuthService:{loginWithFirebaseToken:async()=>({success:true,token:'admin-token-test',user:{email:'admin@example.test',role:'admin'}})}},
 },{process:{env:{EXPO_PUBLIC_ADMIN_EMAILS:'admin@example.test'}},console:{log:(...args)=>logs.push(args),error:(...args)=>logs.push(args)}});
 const context=api.AdminProvider({children:null}).props.value;
 assert.equal(await context.checkAdminStatus(),true);assert.equal(tokenArgs.length,0);
 assert.doesNotMatch(JSON.stringify(logs),/firebase-token-test|admin-token-test/);
});
