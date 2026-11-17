import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDocFromServer, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ContentProgress, ProgressScope, createContentProgressEngine, newerProgress, progressKey, validContentProgress } from './contentProgressEngine';
export type { ContentProgress, ProgressScope, ProgressSnapshot } from './contentProgressEngine';
export function currentProgressScope(profileId: number): ProgressScope {
  const uid=auth.currentUser?.uid;
  if (!uid || !Number.isSafeInteger(profileId) || profileId<=0) throw Error('Inicia sesión y selecciona tu perfil.');
  return { uid, profileId };
}
function assertScope(scope: ProgressScope) { if (auth.currentUser?.uid!==scope.uid) throw Error('La cuenta cambió. Selecciona tu perfil.'); }
function ref(scope: ProgressScope) { assertScope(scope); return doc(db,'profiles',scope.uid); }
function rows(data: any, scope: ProgressScope) { return (data?.content_progress_v1?.[String(scope.profileId)] || {}) as Record<string,ContentProgress>; }
// The account settings document is already owner-only, as used by search history.
// Per-profile maps stay separate; video files are never part of this document.
export const contentProgressSync=createContentProgressEngine({ storage: AsyncStorage, assertScope,
  remote: {
    async read(scope) { const snap=await getDocFromServer(ref(scope)); assertScope(scope); return rows(snap.data(),scope); },
    async write(scope, changes) {
      const account=ref(scope), profile=doc(db,'profiles',scope.uid,'profiles',String(scope.profileId));
      return runTransaction(db,async tx => {
        assertScope(scope);
        const selected=await tx.get(profile); if (!selected.exists()) throw Error('Este perfil ya no existe.');
        const snapshot=await tx.get(account), existing=rows(snapshot.data(),scope);
        const updates: Record<string,ContentProgress>={}, confirmed: Record<string,ContentProgress>={};
        for (const row of changes) {
          if (!validContentProgress(row)) throw Error('Avance inválido.');
          const key=progressKey(row.kind,row.id), previous=existing[key];
          confirmed[key]=newerProgress(row,validContentProgress(previous)?previous:undefined)?row:previous;
          if (confirmed[key]===row) updates[key]=row;
        }
        assertScope(scope);
        if (Object.keys(updates).length) tx.set(account,{content_progress_v1:{[String(scope.profileId)]:updates}},{merge:true});
        return confirmed;
      });
    },
  },
});
export function watchContentProgress(scope: ProgressScope, onError: () => void, onConfirmed:()=>void=()=>{}) {
  return onSnapshot(ref(scope),{includeMetadataChanges:true},snapshot => {
    if (auth.currentUser?.uid!==scope.uid) return;
    const confirmed=!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites;
    if(confirmed)onConfirmed();
    void contentProgressSync.acceptRemote(scope,rows(snapshot.data(),scope),confirmed).catch(onError);
  },onError);
}
async function legacyClaims(): Promise<Record<string,unknown>> {
  const raw=await AsyncStorage.getItem('pixel_legacy_manga_claims_v1');
  const value=JSON.parse(raw || '{}');
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('No se pudo leer el registro de importación.');
  return value;
}
export async function legacyMangaRows() {
  const claims=await legacyClaims();
  const keys=(await AsyncStorage.getAllKeys()).filter(key=>key.startsWith('pixel_manga_progress_')&&!claims[key]);
  const pairs=await AsyncStorage.multiGet(keys), result:{key:string;row:ContentProgress}[]=[];
  for (const [key,text] of pairs) { try {
    const value=JSON.parse(text || '{}');
    const row:ContentProgress={kind:'manga',id:key.slice('pixel_manga_progress_'.length),chapterId:value.chapterId,chapterNumber:String(value.chapterNumber || ''),updatedAt:Number(value.updatedAt)||0,revision:'legacy'};
    if (validContentProgress(row)) result.push({key,row});
  } catch {} }
  return result;
}
export async function importLegacyManga(scope: ProgressScope) {
  const legacy=await legacyMangaRows();
  await contentProgressSync.importRows(scope,legacy.map(item=>item.row));
  assertScope(scope);
  const state=await contentProgressSync.read(scope);
  const confirmed=legacy.filter(item=>!state.pendingKeys.includes(progressKey(item.row.kind,item.row.id)));
  if(confirmed.length!==legacy.length)throw Error('Todavía hay lecturas pendientes. Reintenta con conexión.');
  const claims=await legacyClaims();
  for (const item of confirmed) claims[item.key]={uid:scope.uid,profileId:scope.profileId};
  await AsyncStorage.setItem('pixel_legacy_manga_claims_v1',JSON.stringify(claims));
  // Keep original legacy files as an additional recovery copy; no unconfirmed deletion.
}
