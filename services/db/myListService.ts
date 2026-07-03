/**
 * Servicio de MyList — Firestore.
 * CRUD de items de "Mi Lista" bajo profiles/{uid}/profiles/{perfilId}/mylist
 */
import { auth, db } from '../firebase';
import { collection, addDoc, deleteDoc, doc, query, orderBy, where, getDocs, serverTimestamp } from 'firebase/firestore';

export const myListService = {
  async getMyList(perfilId: number) {
    console.log(`🔄 myListService: Getting MyList for profile: ${perfilId}`);
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/mylist`);
    const q = query(ref, orderBy('added_at', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => d.data() as { content_id: number; content_type: 'movie' | 'tv' | 'anime' });
    console.log(`✅ myListService: MyList retrieved`, { uid, profileId: perfilId, itemCount: items.length });
    return items;
  },

  async addToMyList(perfilId: number, contentId: number, type: 'movie' | 'tv' | 'anime') {
    console.log(`🔄 myListService: Adding - Profile: ${perfilId}, Content: ${contentId}, Type: ${type}`);
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/mylist`);
    const payload = { content_id: contentId, content_type: type, added_at: serverTimestamp() };
    const res = await addDoc(ref, payload);
    console.log(`✅ myListService: Added`, { id: res.id });
    return { id: res.id, ...payload } as any;
  },

  async removeFromMyList(perfilId: number, contentId: number, type: 'movie' | 'tv' | 'anime') {
    console.log(`🔄 myListService: Removing - Profile: ${perfilId}, Content: ${contentId}, Type: ${type}`);
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user');
    const ref = collection(db, `profiles/${uid}/profiles/${perfilId}/mylist`);
    const q = query(ref, where('content_id', '==', contentId), where('content_type', '==', type));
    const snap = await getDocs(q);
    const batchDeletes = snap.docs.map(d => deleteDoc(doc(db, `profiles/${uid}/profiles/${perfilId}/mylist/${d.id}`)));
    await Promise.all(batchDeletes);
    console.log(`✅ myListService: Removed`, { deleted: snap.size });
    return { ok: true } as any;
  },
};
