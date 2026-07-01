import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';
import { getCurrentBaseURL } from './databaseService';

// Complete WebBrowser session on redirect
WebBrowser.maybeCompleteAuthSession();

interface AdminUser {
    id: number;
    email: string;
    name: string;
    picture?: string;
    role?: string;
}

interface AuthResult {
    success: boolean;
    user?: AdminUser;
    token?: string;
    error?: string;
}

class AdminAuthService {
    /**
     * Authenticate using Firebase ID Token (Single Login)
     */
    async loginWithFirebaseToken(idToken: string): Promise<AuthResult> {
        try {
            const baseUrl = getCurrentBaseURL();
            const response = await axios.post(`${baseUrl}/auth/admin/firebase-login`, {
                idToken
            }, { timeout: 5000 });

            const { token, user } = response.data;
            if (token && user) {
                return { success: true, token, user };
            }
            return { success: false, error: 'Respuesta inválida del servidor' };
        } catch (error: any) {
            console.error('Firebase Admin Login Error:', error);
            const msg = error.response?.data?.message || error.message || 'Error de autenticación';
            return { success: false, error: msg };
        }
    }

    /**
     * Authenticate with Google OAuth using WebBrowser
     * This will redirect to backend OAuth endpoint
     */
    async authenticateWithGoogle(): Promise<AuthResult> {
        try {
            const baseUrl = getCurrentBaseURL();

            // Open backend OAuth endpoint in browser
            const redirectUrl = AuthSession.makeRedirectUri({
                scheme: 'pixelnosekai',
                path: 'auth/admin'
            });

            const authUrl = `${baseUrl}/auth/google?redirect_uri=${encodeURIComponent(redirectUrl)}&platform=mobile`;

            console.log('Opening auth URL:', authUrl);
            console.log('Redirect URI:', redirectUrl);

            const result = await WebBrowser.openAuthSessionAsync(
                authUrl,
                redirectUrl
            );

            if (result.type === 'success' && result.url) {
                // Extract token from redirect URL
                const url = new URL(result.url);
                const token = url.searchParams.get('token');
                const error = url.searchParams.get('error');

                if (error) {
                    return { success: false, error: this.getErrorMessage(error) };
                }

                if (!token) {
                    return { success: false, error: 'No token received from authentication' };
                }

                // Verify token and get user info
                const user = await this.verifyToken(token);

                if (!user) {
                    return { success: false, error: 'Failed to verify authentication token' };
                }

                return {
                    success: true,
                    token,
                    user
                };
            } else if (result.type === 'cancel') {
                return { success: false, error: 'Authentication cancelled' };
            } else {
                return { success: false, error: 'Authentication failed' };
            }
        } catch (error: any) {
            console.error('Google OAuth error:', error);
            return { success: false, error: error.message || 'Authentication failed' };
        }
    }

    /**
     * Get user-friendly error message
     */
    private getErrorMessage(error: string): string {
        const errorMessages: { [key: string]: string } = {
            'auth_failed': 'Autenticación fallida. Por favor, intenta de nuevo.',
            'token_generation_failed': 'Error al generar token de sesión.',
            'unauthorized': 'Tu email no está autorizado para acceder al panel de administración.',
            'invalid_token': 'Token inválido o expirado.'
        };

        return errorMessages[error] || 'Error desconocido durante la autenticación.';
    }

    /**
     * Verify JWT token with backend
     */
    async verifyToken(token: string): Promise<AdminUser | null> {
        try {
            const baseUrl = getCurrentBaseURL();
            const response = await axios.get(`${baseUrl}/auth/admin/me`, {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                timeout: 5000
            });

            return response.data;
        } catch (error) {
            console.error('Token verification error:', error);
            return null;
        }
    }

    /**
     * Get stored admin token
     */
    async getAdminToken(): Promise<string | null> {
        try {
            return await AsyncStorage.getItem('admin_token');
        } catch (error) {
            console.error('Error getting admin token:', error);
            return null;
        }
    }

    /**
     * Check if current user is admin
     */
    async isAdmin(): Promise<boolean> {
        try {
            const token = await this.getAdminToken();
            if (!token) return false;

            const user = await this.verifyToken(token);
            return user !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Logout admin
     */
    async logoutAdmin(): Promise<void> {
        try {
            await AsyncStorage.removeItem('admin_token');
        } catch (error) {
            console.error('Error logging out admin:', error);
        }
    }
}

export const adminAuthService = new AdminAuthService();
