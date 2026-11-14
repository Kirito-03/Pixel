import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { darkColors, lightColors, spacing as baseSpacing } from '../theme';

type ThemeName = 'dark' | 'light';

interface ThemeContextValue {
  theme: ThemeName;
  colors: typeof darkColors;
  spacing: typeof baseSpacing;
  toggleTheme: () => void;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark');

  const revision = useRef(0);
  useEffect(() => {
    const started = revision.current;
    let active = true;
    AsyncStorage.getItem('pixel.theme').then(saved => {
      if (active && revision.current === started && (saved === 'dark' || saved === 'light')) setThemeState(saved);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setTheme = useCallback((t: ThemeName) => {
    if (t !== 'dark' && t !== 'light') return;
    revision.current += 1;
    setThemeState(t);
    void AsyncStorage.setItem('pixel.theme', t).catch(() => {});
  }, []);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = theme;
      document.documentElement.style.backgroundColor = theme === 'dark' ? darkColors.background : lightColors.background;
    }
  }, [theme]);

  const colors = useMemo(() => (theme === 'dark' ? darkColors : lightColors), [theme]);
  const spacing = baseSpacing;

  const value: ThemeContextValue = {
    theme,
    colors,
    spacing,
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}