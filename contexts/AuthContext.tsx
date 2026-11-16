import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Storage } from '../services/storage';
import { subscribeAuth, logout as firebaseLogout } from '../services/auth';

interface User { uid: string; email: string | null; role: 'user' | 'admin'; }
interface AuthContextType {
  user: User | null; isLoading: boolean; profileSession: number;
  login: (user: User) => Promise<void>; logout: () => Promise<void>; loadSession: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileSession, setProfileSession] = useState(0);
  const subscription = useRef<(() => void) | undefined>(undefined);
  const generation = useRef(0);
  const observedUid = useRef<string | null | undefined>(undefined);
  const loadSession = useCallback(async () => {
    const request = ++generation.current;
    subscription.current?.(); setIsLoading(true);
    try {
      await Storage.ready();
      if (request !== generation.current) return;
      subscription.current = subscribeAuth(firebaseUser => {
        if (request !== generation.current) return;
        if (firebaseUser) {
          // A restored first notification may resume a verified profile. A new sign-in must choose one.
          if (observedUid.current !== undefined && observedUid.current !== firebaseUser.uid) {
            Storage.delete('currentProfile'); Storage.delete(`pixel.selectedProfile:${firebaseUser.uid}`);
            setProfileSession(value => value + 1);
          }
          observedUid.current = firebaseUser.uid;
          const existing = Storage.getObject<User>('userSession');
          const verified: User = { uid: firebaseUser.uid, email: firebaseUser.email, role: existing?.uid === firebaseUser.uid ? existing.role : 'user' };
          Storage.setObject('userSession', verified); setUser(verified);
        } else {
          if (observedUid.current) Storage.delete(`pixel.selectedProfile:${observedUid.current}`);
          observedUid.current = null;
          setUser(null); Storage.delete('userSession'); Storage.delete('currentProfile');
        }
        // Firebase's first notification, rather than subscription registration, finishes boot.
        setIsLoading(false);
      });
    } catch {
      if (request === generation.current) { setUser(null); setIsLoading(false); }
    }
  }, []);
  const login = async (data: User) => {
    Storage.setObject('userSession', data); setUser(data);
  };
  const logout = async () => {
    await firebaseLogout();
    if (user) Storage.delete(`pixel.selectedProfile:${user.uid}`);
    Storage.delete('userSession'); Storage.delete('currentProfile'); Storage.delete('admin_token'); setUser(null);
  };
  useEffect(() => { void loadSession(); return () => { generation.current++; subscription.current?.(); }; }, [loadSession]);
  return <AuthContext.Provider value={{ user, isLoading, profileSession, login, logout, loadSession }}>{children}</AuthContext.Provider>;
};
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within an AuthProvider'); return context;
};
