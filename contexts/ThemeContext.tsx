import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
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

  const setTheme = (t: ThemeName) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));

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