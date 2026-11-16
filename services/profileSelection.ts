export interface SelectedProfile { id: number; name: string; avatar_url: string; usuario_id: number; }
export interface SavedProfileSelection { uid: string; profileId: number; }
export async function restoreProfileSelection(
  uid: string, saved: SavedProfileSelection | null | undefined,
  lookup: (id: number, uid: string) => Promise<SelectedProfile | null>,
): Promise<SelectedProfile | null> {
  if (!uid || saved?.uid !== uid || !Number.isSafeInteger(saved.profileId) || saved.profileId <= 0) return null;
  const verified = await lookup(saved.profileId, uid);
  return verified && Number(verified.id) === saved.profileId && verified.name?.trim() ? verified : null;
}
