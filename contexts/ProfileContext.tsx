import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Storage } from '../services/storage';

export interface Profile {
  id: number;
  name: string;
  avatar_url: string;
  usuario_id: number;
}

interface ProfileContextType {
  currentProfile: Profile | null;
  setCurrentProfile: (profile: Profile | null) => void;
  loadCurrentProfile: () => Promise<Profile | null>;
  clearCurrentProfile: () => Promise<void>;
  // Preferencias por perfil
  adultContentEnabled: boolean;
  setAdultContentEnabled: (enabled: boolean) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

interface ProfileProviderProps {
  children: ReactNode;
}

export const ProfileProvider: React.FC<ProfileProviderProps> = ({ children }) => {
  const [currentProfile, setCurrentProfileState] = useState<Profile | null>(() => {
    try { return Storage.getObject<Profile>('currentProfile') || null; } catch { return null; }
  });
  const [adultContentEnabled, setAdultContentEnabledState] = useState<boolean>(() => {
    try {
      const profile = Storage.getObject<Profile>('currentProfile');
      const saved = profile ? Storage.getString(`adultContentEnabled:${profile.id}`) : undefined;
      return saved !== undefined && JSON.parse(saved) === true;
    } catch { return false; }
  });

  const setCurrentProfile = async (profile: Profile | null) => {
    console.log('ProfileContext: Setting current profile:', profile?.id, profile?.name);
    setCurrentProfileState(profile);
    if (profile) {
      Storage.setObject('currentProfile', profile);
      console.log('ProfileContext: Profile saved to Storage');
      // Cargar preferencia de +18 asociada al perfil
      try {
        const raw = Storage.getString(`adultContentEnabled:${profile.id}`);
        if (raw !== undefined) {
          setAdultContentEnabledState(Boolean(JSON.parse(raw)));
        } else {
          setAdultContentEnabledState(false);
        }
      } catch (err) {
        console.warn('ProfileContext: No se pudo cargar preferencia +18, usando false por defecto');
        setAdultContentEnabledState(false);
      }
    } else {
      Storage.delete('currentProfile');
      console.log('ProfileContext: Profile removed from Storage');
      setAdultContentEnabledState(false);
    }
  };

  const loadCurrentProfile = async (): Promise<Profile | null> => {
    try {
      console.log('ProfileContext: Loading current profile...');
      const profile = Storage.getObject<Profile>('currentProfile');
      if (profile) {
        console.log('ProfileContext: Parsed profile ID:', profile?.id, 'Name:', profile?.name);
        setCurrentProfileState(profile);
        // Cargar preferencia de +18 para el perfil
        try {
          const raw = Storage.getString(`adultContentEnabled:${profile.id}`);
          if (raw !== undefined) {
            setAdultContentEnabledState(Boolean(JSON.parse(raw)));
          } else {
            setAdultContentEnabledState(false);
          }
        } catch (err) {
          setAdultContentEnabledState(false);
        }
        return profile;
      } else {
        console.log('ProfileContext: No profile found in storage');
        return null;
      }
    } catch (error) {
      console.error('Error loading current profile:', error);
      return null;
    }
  };

  const clearCurrentProfile = async () => {
    setCurrentProfileState(null);
    Storage.delete('currentProfile');
    setAdultContentEnabledState(false);
  };

  const setAdultContentEnabled = async (enabled: boolean) => {
    setAdultContentEnabledState(enabled);
    const profileId = currentProfile?.id;
    if (profileId) {
      try {
        Storage.setString(`adultContentEnabled:${profileId}`, JSON.stringify(enabled));
      } catch (err) {
        console.warn('ProfileContext: No se pudo guardar preferencia +18');
      }
    }
    // This is a per-profile device preference, never a shared account-wide flag.

  };

  useEffect(() => {
    loadCurrentProfile();
  }, []);


  const value: ProfileContextType = {
    currentProfile,
    setCurrentProfile,
    loadCurrentProfile,
    clearCurrentProfile,
    adultContentEnabled,
    setAdultContentEnabled,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};