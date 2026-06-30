import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Storage } from '../services/storage';
import { subscribeAuth, logout as firebaseLogout } from '../services/auth';

interface User {
  uid: string;
  email: string | null;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = async () => {
    try {
      console.log('AuthContext: Loading session...');
      const stored = Storage.getObject<User>('userSession');
      if (stored) {
        setUser(stored);
      }
      subscribeAuth(async (firebaseUser) => {
        if (firebaseUser) {
          // Preserve existing role if login() was already called (avoids overwriting admin role)
          const existingSession = Storage.getObject<User>('userSession');
          const existingRole = (existingSession && existingSession.uid === firebaseUser.uid)
            ? existingSession.role
            : 'user';
          const u: User = { uid: firebaseUser.uid, email: firebaseUser.email, role: existingRole };
          setUser(u);
          Storage.setObject('userSession', u);
        } else {
          setUser(null);
          Storage.delete('userSession');
          Storage.delete('currentProfile');
        }
      });
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData: User) => {
    setUser(userData);
    Storage.setObject('userSession', userData);
  };

  const logout = async () => {
    console.log('AuthContext: Logging out user');
    try {
      await firebaseLogout();
    } catch (e) { }
    setUser(null);
    Storage.delete('userSession');
    // También limpiar el perfil actual y token de admin
    Storage.delete('currentProfile');
    Storage.delete('admin_token');
    console.log('AuthContext: Session cleared from Storage');
  };

  useEffect(() => {
    loadSession();
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    loadSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
