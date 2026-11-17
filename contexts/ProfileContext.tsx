import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Storage } from '../services/storage';
import { useAuth } from './AuthContext';
import { profileService } from '../services/db/profileService';
import { restoreProfileSelection, type SavedProfileSelection } from '../services/profileSelection';
export interface Profile { id: number; name: string; avatar_url: string; usuario_id: number; }
interface ProfileContextType {
  currentProfile: Profile | null; profileLoading: boolean;
  setCurrentProfile: (profile: Profile | null) => Promise<void>;
  loadCurrentProfile: () => Promise<Profile | null>; clearCurrentProfile: () => Promise<void>;
  adultContentEnabled: boolean; setAdultContentEnabled: (enabled: boolean) => Promise<void>;
}
const ProfileContext = createContext<ProfileContextType | undefined>(undefined);
export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isLoading, profileSession } = useAuth();
  const uid = user?.uid || '';
  const scope = `${uid}:${profileSession}`;
  const liveScope = useRef(scope); liveScope.current = scope;
  const generation = useRef(0);
  const selectionGeneration=useRef(0);
  const [state, setState] = useState<{ scope: string; profile: Profile | null; loading: boolean }>({ scope: '', profile: null, loading: true });
  const [adult, setAdult] = useState(false);
  const profileLoading = isLoading || state.scope !== scope || state.loading;
  const currentProfile = !profileLoading ? state.profile : null;
  const preference = (profile: Profile | null) => {
    try { return !!profile && Storage.getString(`adultContentEnabled:${profile.id}`) === 'true'; } catch { return false; }
  };
  const persist = (profile: Profile | null) => {
    if (profile) {
      Storage.setObject(`pixel.selectedProfile:${uid}`, { uid, profileId: profile.id });
      Storage.setObject('currentProfile', profile);
    } else { if (uid) Storage.delete(`pixel.selectedProfile:${uid}`); Storage.delete('currentProfile'); }
    setAdult(preference(profile)); setState({ scope, profile, loading: false });
  };
  const loadCurrentProfile = async () => {
    if (!uid) return null;
    const requestScope = scope;
    await Storage.ready();
    let saved = Storage.getObject<SavedProfileSelection>(`pixel.selectedProfile:${uid}`);
    // Upgrade an old selection only after checking that exact profile under the signed-in user's Firestore path.
    const legacy = Storage.getObject<Profile>('currentProfile');
    if (!saved && legacy?.id && !profileSession) saved = { uid, profileId: Number(legacy.id) };
    const profile = await restoreProfileSelection(uid, saved, profileService.getProfile);
    if (liveScope.current === requestScope) persist(profile);
    return liveScope.current === requestScope ? profile : null;
  };
  useEffect(() => {
    if (isLoading) return;
    const request = ++generation.current;
    setState({ scope, profile: null, loading: true }); setAdult(false);
    if (!uid || profileSession > 0) { persist(null); return; }
    void loadCurrentProfile().catch(() => {
      if (request === generation.current && liveScope.current === scope) persist(null);
    });
    return () => { generation.current++; };
  }, [uid, profileSession, isLoading]);
  const setCurrentProfile = async (profile: Profile | null) => {
    const selection=++selectionGeneration.current;
    const requestScope = scope;
    if (!profile) { persist(null); return; }
    if (!uid) throw new Error('Inicia sesión y elige un perfil.');
    const verified = await profileService.getProfile(Number(profile.id), uid);
    if (liveScope.current !== requestScope || selection!==selectionGeneration.current) return;
    if (!verified) throw new Error('Este perfil ya no está disponible. Elige o crea otro.');
    persist(verified);
  };
  const clearCurrentProfile = async () => { selectionGeneration.current++; persist(null); };
  const setAdultContentEnabled = async (enabled: boolean) => {
    if (!currentProfile) return;
    Storage.setString(`adultContentEnabled:${currentProfile.id}`, JSON.stringify(enabled)); setAdult(enabled);
  };
  return <ProfileContext.Provider value={{ currentProfile, profileLoading, setCurrentProfile, loadCurrentProfile, clearCurrentProfile, adultContentEnabled: !!currentProfile && adult, setAdultContentEnabled }}>{children}</ProfileContext.Provider>;
};
export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext); if (!context) throw new Error('useProfile must be used within a ProfileProvider'); return context;
};
