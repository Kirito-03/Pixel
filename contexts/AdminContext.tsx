import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminAuthService } from '../services/adminAuthService';
import { auth as firebaseAuth } from '../services/firebase';

interface AdminUser {
    id: number;
    email: string;
    name: string;
    picture?: string;
    role?: string;
}

interface AdminContextType {
    isAdmin: boolean;
    adminUser: AdminUser | null;
    isLoading: boolean;
    loginAsAdmin: () => Promise<void>;
    logoutAdmin: () => Promise<void>;
    checkAdminStatus: () => Promise<boolean>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

interface AdminProviderProps {
    children: ReactNode;
}

export const ADMIN_EMAILS = [
    'leojuniorss.8lj@gmail.com',
    'pixel@dragonfluxstudios.com',
];

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const parseEmailList = (raw?: string) =>
    (raw || '')
        .split(',')
        .map((e) => normalizeEmail(e))
        .filter(Boolean);

export const ADMIN_EMAILS_NORMALIZED = (() => {
    const fromEnv = parseEmailList(process.env.EXPO_PUBLIC_ADMIN_EMAILS);
    if (fromEnv.length) return fromEnv;
    return ADMIN_EMAILS.map(normalizeEmail);
})();

const isAllowedAdminEmail = (email?: string) => {
    if (!email) return false;
    return ADMIN_EMAILS_NORMALIZED.includes(normalizeEmail(email));
};

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = firebaseAuth.onAuthStateChanged((user: any) => {
            console.log('AdminContext: Auth state changed, re-checking admin status', user?.email);
            checkAdminStatus();
        });
        return unsubscribe;
    }, []);

    const checkAdminStatus = async (): Promise<boolean> => {
        try {
            console.log('[AdminContext] checkAdminStatus starting');
            setIsLoading(true);

            // 1. Check if we have a firebase user and sync with backend
            const currentUser = firebaseAuth.currentUser;
            console.log('[AdminContext] currentUser exists:', !!currentUser);
            if (currentUser) {
                const currentEmail = currentUser.email as string | undefined;
                console.log('[AdminContext] currentEmail:', currentEmail);
                if (!isAllowedAdminEmail(currentEmail)) {
                    console.log('[AdminContext] Email is not allowed admin');
                    setIsAdmin(false);
                    setAdminUser(null);
                    return false;
                }

                // Obtener ID Token de Firebase
                console.log('[AdminContext] Getting Firebase ID Token...');
                const idToken = await currentUser.getIdToken(true); // force refresh
                console.log('[AdminContext] Got ID Token');

                // Intentar login silencioso con backend
                console.log('[AdminContext] Calling adminAuthService.loginWithFirebaseToken...');
                const result = await adminAuthService.loginWithFirebaseToken(idToken);
                console.log('[AdminContext] Result from backend:', result);

                if (result.success && result.token && result.user) {
                    if (!isAllowedAdminEmail(result.user.email) && result.user.role !== 'admin') {
                        await AsyncStorage.removeItem('admin_token');
                        setIsAdmin(false);
                        setAdminUser(null);
                        return false;
                    }
                    await AsyncStorage.setItem('admin_token', result.token);
                    setIsAdmin(true);
                    setAdminUser(result.user);
                    return true;
                }
            }

            // 2. Fallback to stored token (if user not logged in via firebase but has token?)
            // Esto es raro si queremos single login, pero mantenemos por si acaso.
            console.log('[AdminContext] Fallback to stored token...');
            const token = await AsyncStorage.getItem('admin_token');
            console.log('[AdminContext] Stored token exists:', !!token);
            if (!token) {
                setIsAdmin(false);
                setAdminUser(null);
                return false;
            }

            // Verify token with backend
            console.log('[AdminContext] Verifying stored token with backend...');
            const user = await adminAuthService.verifyToken(token);
            console.log('[AdminContext] Verified user:', !!user);

            if (user && isAllowedAdminEmail(user.email)) {
                setIsAdmin(true);
                setAdminUser(user);
                return true;
            } else {
                await AsyncStorage.removeItem('admin_token');
                setIsAdmin(false);
                setAdminUser(null);
                return false;
            }
        } catch (error) {
            console.error('Error checking admin status:', error);
            setIsAdmin(false);
            setAdminUser(null);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const loginAsAdmin = async () => {
        try {
            setIsLoading(true);
            const result = await adminAuthService.authenticateWithGoogle();

            if (result.success && result.user && result.token) {
                // Verify email is authorized
                if (!isAllowedAdminEmail(result.user.email)) {
                    throw new Error('Email no autorizado para acceso de administrador');
                }

                // Store token
                await AsyncStorage.setItem('admin_token', result.token);

                setIsAdmin(true);
                setAdminUser(result.user);
            } else {
                throw new Error(result.error || 'Autenticación fallida');
            }
        } catch (error: any) {
            console.error('Error logging in as admin:', error);
            setIsAdmin(false);
            setAdminUser(null);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logoutAdmin = async () => {
        try {
            await AsyncStorage.removeItem('admin_token');
            setIsAdmin(false);
            setAdminUser(null);
        } catch (error) {
            console.error('Error logging out admin:', error);
        }
    };

    const value: AdminContextType = {
        isAdmin,
        adminUser,
        isLoading,
        loginAsAdmin,
        logoutAdmin,
        checkAdminStatus,
    };

    return (
        <AdminContext.Provider value={value}>
            {children}
        </AdminContext.Provider>
    );
};

export const useAdmin = (): AdminContextType => {
    const context = useContext(AdminContext);
    if (context === undefined) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
};
