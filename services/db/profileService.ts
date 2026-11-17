/**
 * Servicio de perfiles — Firestore.
 * CRUD de perfiles bajo profiles/{uid}/profiles/{profileId}
 */
import { withProfileDeadline } from '../profileRequest';
import { auth, db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

export interface CreateProfilePayload {
  usuario_id: number;
  name: string;
  avatar_url: string;
}

let verifiedList:{uid:string;at:number;profiles:Map<number,any>}|null=null;
const invalidate=(uid:string)=>{if(verifiedList?.uid===uid)verifiedList=null;};
export const profileService = {
  async getProfile(profileId: number, expectedUid: string) {
    if (!expectedUid || auth.currentUser?.uid !== expectedUid || !Number.isSafeInteger(profileId) || profileId <= 0) return null;
    // The chooser just fetched this exact account's list. Avoid verifying it twice.
    const cached=verifiedList;
    if(cached&&cached.uid===expectedUid&&Date.now()-cached.at<60000)return cached.profiles.get(profileId)||null;
    const snap = await withProfileDeadline(getDoc(doc(db, `profiles/${expectedUid}/profiles/${profileId}`)));
    if (auth.currentUser?.uid !== expectedUid || !snap.exists()) return null;
    return { ...snap.data(), id: profileId } as import('../../contexts/ProfileContext').Profile;
  },
  async getProfiles(_userId: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const cached=verifiedList;
    if(cached&&cached.uid===uid&&Date.now()-cached.at<60000)return Array.from(cached.profiles.values());
    const ref = collection(db, `profiles/${uid}/profiles`);
    const snap = await withProfileDeadline(getDocs(ref));
    if(auth.currentUser?.uid!==uid)throw Error('La cuenta cambió. Vuelve a elegir tu perfil.');
    const profiles=snap.docs.map(d => ({ ...(d.data() as any), id: Number(d.id) }));
    if(!snap.metadata.fromCache)verifiedList={uid,at:Date.now(),profiles:new Map(profiles.map(p=>[p.id,p]))};
    return profiles;
  },

  async createProfile(payload: CreateProfilePayload) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    const profileId = Date.now();
    invalidate(uid);
    const ref = doc(db, `profiles/${uid}/profiles/${profileId}`);
    const body = { name: payload.name, avatar_url: payload.avatar_url, created_at: serverTimestamp() };
    await setDoc(ref, body);
    return { id: profileId, ...body } as any;
  },

  async updateProfile(profileId: number, updates: { name?: string; avatar_url?: string }) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    invalidate(uid);
    const ref = doc(db, `profiles/${uid}/profiles/${profileId}`);
    await setDoc(ref, { ...updates, updated_at: serverTimestamp() }, { merge: true });
    const snap = await getDoc(ref);
    return { id: profileId, ...(snap.data() as any) };
  },

  async deleteProfile(profileId: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    invalidate(uid);
    const ref = doc(db, `profiles/${uid}/profiles/${profileId}`);
    await deleteDoc(ref);
    return { ok: true } as any;
  },
};
