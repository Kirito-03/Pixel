import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './navigation/AppNavigator';

// Prevenir que se auto oculte si es que Expo lo está haciendo a medias
SplashScreen.preventAutoHideAsync().catch(() => {});

import { ProgressSyncProvider } from './contexts/ProgressSyncContext';
import { ProfileProvider } from './contexts/ProfileContext';
import { MyListProvider } from './contexts/MyListContext';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AppUpdateProvider } from './contexts/AppUpdateContext';
import { AdminProvider } from './contexts/AdminContext';

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  useEffect(() => {
    // Forzar el ocultamiento de la pantalla de splash nativa
    setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 1500);
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <ThemeProvider>
        <AppUpdateProvider>
        <AuthProvider>
          <AdminProvider>
            <ProfileProvider>
              <ProgressSyncProvider><MyListProvider>
                <AppNavigator />
                <ThemedStatusBar />
              </MyListProvider></ProgressSyncProvider>
            </ProfileProvider>
          </AdminProvider>
        </AuthProvider>
        </AppUpdateProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
