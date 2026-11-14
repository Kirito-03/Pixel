import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AndroidRelease, fetchAndroidRelease } from '../services/androidRelease';

const installedCode = Number(Application.nativeBuildVersion || 0);
const installedVersion = Application.nativeApplicationVersion || 'Web';
interface UpdateState {
  installedVersion: string; installedCode: number; release: AndroidRelease | null;
  checking: boolean; checked: boolean; error: string; available: boolean;
  check: () => Promise<void>; download: () => Promise<void>;
}
const Context = createContext<UpdateState | null>(null);
export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false), lastCheck = useRef(0), active = useRef(true), prompted = useRef(0);
  const open = useCallback(async (candidate: AndroidRelease) => {
    try { await Linking.openURL(candidate.downloadUrl); }
    catch { if (active.current) setError('No pudimos abrir la descarga. Inténtalo de nuevo.'); }
  }, []);
  const perform = useCallback(async (automatic: boolean) => {
    if (Platform.OS !== 'android' || busy.current) return;
    busy.current = true; lastCheck.current = Date.now(); setChecking(true); setError('');
    try {
      const next = await fetchAndroidRelease();
      if (!active.current) return;
      setRelease(next); setChecked(true);
      if (automatic && next && installedCode > 0 && next.versionCode > installedCode && prompted.current !== next.versionCode) {
        const dismissed = await AsyncStorage.getItem('pixel.update.dismissed');
        if (!active.current || dismissed === String(next.versionCode)) return;
        prompted.current = next.versionCode;
        Alert.alert('Nueva versión disponible', `Pixel ${next.version} está lista. Descarga la APK y confirma la actualización en Android.`, [
          { text: 'Más tarde', style: 'cancel', onPress: () => { void AsyncStorage.setItem('pixel.update.dismissed', String(next.versionCode)).catch(() => {}); } },
          { text: 'Descargar', onPress: () => { void open(next); } },
        ]);
      }
    } catch { if (active.current) setError('No pudimos comprobar la versión. Revisa tu conexión y reintenta.'); }
    finally { busy.current = false; if (active.current) setChecking(false); }
  }, [open]);
  useEffect(() => {
    active.current = true;
    if (Platform.OS !== 'android') return () => { active.current = false; };
    void perform(true);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastCheck.current >= 6 * 60 * 60 * 1000) void perform(true);
    });
    return () => { active.current = false; sub.remove(); };
  }, [perform]);
  const check = useCallback(() => perform(false), [perform]);
  const download = useCallback(async () => { if (release && release.versionCode > installedCode) await open(release); }, [release, open]);
  return <Context.Provider value={{ installedVersion, installedCode, release, checking, checked, error,
    available: !!release && installedCode > 0 && release.versionCode > installedCode, check, download }}>{children}</Context.Provider>;
}
export function useAppUpdate() {
  const context = useContext(Context);
  if (!context) throw new Error('AppUpdateProvider no está disponible');
  return context;
}
