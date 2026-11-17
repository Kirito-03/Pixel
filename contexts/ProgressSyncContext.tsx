import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useProfile } from './ProfileContext';
import { ProgressScope, ProgressSnapshot, contentProgressSync, importLegacyManga, legacyMangaRows, watchContentProgress } from '../services/contentProgressSync';
const empty:ProgressSnapshot={records:{},pendingCount:0,pendingKeys:[],lastSyncedAt:0,syncing:false,failed:false};
const Context=createContext({ ...empty, scope:null as ProgressScope|null, legacyCount:0, syncNow:async()=>{}, importLegacy:async()=>{} });
export function ProgressSyncProvider({children}:{children:React.ReactNode}) {
  const {user}=useAuth(), {currentProfile}=useProfile();
  const uid=user?.uid || '', profileId=currentProfile?.id || 0, key=`${uid}:${profileId}`;
  const initial={key:'',snapshot:empty,legacyCount:0,legacyFailed:false,watchFailed:false};
  const [state,setState]=useState(initial);
  const scope=uid&&profileId?{uid,profileId}:null;
  useEffect(()=>{
    if (!uid||!profileId) {setState({...initial,key});return;}
    let active=true,watchFailed=false;
    const scope={uid,profileId};
    setState({...initial,key});
    const unlisten=contentProgressSync.subscribe(scope,snapshot=>{if(active)setState(value=>({...value,key,snapshot}));});
    void legacyMangaRows().then(rows=>{if(active)setState(value=>({...value,legacyCount:rows.length,legacyFailed:false}));}).catch(()=>{if(active)setState(value=>({...value,legacyFailed:true}));});
    const reportError=()=>{watchFailed=true;if(active)setState(value=>({...value,watchFailed:true}));};
    let unwatch=()=>{};
    const startWatch=()=>{unwatch();try{unwatch=watchContentProgress(scope,reportError,()=>{watchFailed=false;if(active)setState(value=>({...value,watchFailed:false}));});}catch{reportError();}};
    startWatch();
    const sync=()=>{if(watchFailed)startWatch();void contentProgressSync.sync(scope).catch(()=>{});};
    sync();
    const timer=setInterval(()=>{if(watchFailed)startWatch();void contentProgressSync.read(scope).then(snapshot=>{if(active&&(snapshot.pendingCount||snapshot.failed))sync();}).catch(()=>{});},15000);
    const listener=AppState.addEventListener('change',status=>{if(status==='active')sync();});
    const focus=()=>sync();
    if(typeof window!=='undefined')window.addEventListener?.('focus',focus);
    return()=>{active=false;unlisten();unwatch();clearInterval(timer);listener.remove();if(typeof window!=='undefined')window.removeEventListener?.('focus',focus);};
  },[uid,profileId]);
  const live=state.key===key?state:{...initial,key};
  const scanLegacy=async()=>{try{const rows=await legacyMangaRows();setState(value=>value.key===key?{...value,legacyCount:rows.length,legacyFailed:false}:value);}catch(error){setState(value=>value.key===key?{...value,legacyFailed:true}:value);throw error;}};
  return <Context.Provider value={{...live.snapshot,failed:live.snapshot.failed||live.watchFailed||live.legacyFailed,scope,legacyCount:live.legacyCount,
    syncNow:async()=>{if(scope)await Promise.all([contentProgressSync.sync(scope),scanLegacy()]);},
    importLegacy:async()=>{if(!scope)return;await importLegacyManga(scope);await scanLegacy();},
  }}>{children}</Context.Provider>;
}
export const useProgressSync=()=>useContext(Context);
