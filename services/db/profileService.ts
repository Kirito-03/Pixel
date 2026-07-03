/**
 * Servicio de perfiles — Firestore.
 * CRUD de perfiles bajo profiles/{uid}/profiles/{profileId}
 */
import { auth, db } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

export interface CreateProfilePayload {
  usuario_id: number;
  name: string;
  avatar_url: string;
}

export const profileService = {
  async getProfiles(_userId: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const ref = collection(db, `profiles/${uid}/profiles`);
    const snap = await getDocs(ref);
    return snap.docs.map(d => ({ id: Number(d.id), ...(d.data() as any) }));
  },

  async createProfile(payload: CreateProfilePayload) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    const profileId = Date.now();
    const ref = doc(db, `profiles/${uid}/profiles/${profileId}`);
    const body = { name: payload.name, avatar_url: payload.avatar_url, created_at: serverTimestamp() };
    await setDoc(ref, body);
    return { id: profileId, ...body } as any;
  },

  async updateProfile(profileId: number, updates: { name?: string; avatar_url?: string }) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    const ref = doc(db, `profiles/${uid}/profiles/${profileId}`);
    await setDoc(ref, { ...updates, updated_at: serverTimestamp() }, { merge: true });
    const snap = await getDoc(ref);
    return { id: profileId, ...(snap.data() as any) };
  },

  async deleteProfile(profileId: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No auth user');
    const ref = doc(db, `profiles/${uid}/profiles/${profileId}`);
    await deleteDoc(ref);
    return { ok: true } as any;
  },
};
