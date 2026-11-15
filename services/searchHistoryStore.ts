import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export function cleanSearchHistory(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.filter((value): value is string => typeof value === 'string').map(value => value.trim().slice(0, 160))
    .filter(value => { const key = value.toLocaleLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 5);
}
async function reference(profileId: number, expectedUid?: string) {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) throw new Error('Selecciona un perfil válido.');
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid || (expectedUid && uid !== expectedUid)) throw new Error('La cuenta cambió; vuelve a intentarlo en el perfil actual.');
  // The account settings document is already restricted to this uid by the deployed rules.
  return { ref: doc(db, 'profiles', uid), key: String(profileId) };
}
export const searchHistoryStore = {
  async watch(profileId: number, onChange: (queries: string[]) => void, onError: (error: unknown) => void, expectedUid?: string) {
    const { ref, key } = await reference(profileId, expectedUid);
    return onSnapshot(ref, snapshot => onChange(cleanSearchHistory(snapshot.data()?.search_history?.[key]?.queries)), onError);
  },
  async migrate(profileId: number, local: string[], expectedUid?: string) {
    const { ref, key } = await reference(profileId, expectedUid);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      // A clear creates an empty entry too; another device cannot resurrect its old local history.
      if (snapshot.data()?.search_history?.[key] !== undefined) return;
      transaction.set(ref, { search_history: { [key]: { queries: cleanSearchHistory(local), updated_at: serverTimestamp() } } }, { merge: true });
    });
  },
  async add(profileId: number, text: string, expectedUid?: string) {
    const query = cleanSearchHistory([text])[0];
    if (!query) return;
    const { ref, key } = await reference(profileId, expectedUid);
    return runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      const previous = cleanSearchHistory(snapshot.data()?.search_history?.[key]?.queries);
      const queries = cleanSearchHistory([query, ...previous]);
      transaction.set(ref, { search_history: { [key]: { queries, updated_at: serverTimestamp() } } }, { merge: true });
      return queries;
    });
  },
  async clear(profileId: number, expectedUid?: string) {
    const { ref, key } = await reference(profileId, expectedUid);
    await runTransaction(db, async transaction => {
      await transaction.get(ref);
      transaction.set(ref, { search_history: { [key]: { queries: [], updated_at: serverTimestamp() } } }, { merge: true });
    });
  },
};
