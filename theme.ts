// Paletas de color para soportar modo oscuro y claro
export const darkColors = {
  primary: '#E50914',      // Rojo Netflix
  secondary: '#B20710',    // Rojo oscuro
  background: '#000000',    // Negro
  card: '#141414',         // Gris oscuro
  cardLight: '#1a1a1a',    // Gris oscuro claro
  text: '#FFFFFF',         // Blanco
  textGray: '#808080',     // Gris
  textLight: '#b3b3b3',    // Gris claro
  overlay: 'rgba(0, 0, 0, 0.7)', // Overlay oscuro
  // Nuevos colores premium
  surfaceElevated: '#1c1c1e',
  glassBg: 'rgba(20, 20, 20, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  accentGold: '#FFD700',
  accentGreen: '#00E676',
  accentBlue: '#448AFF',
  textMuted: 'rgba(255, 255, 255, 0.5)',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  divider: 'rgba(255, 255, 255, 0.06)',
};

export const lightColors = {
  primary: '#E50914',
  secondary: '#B20710',
  background: '#FFFFFF',
  card: '#F4F4F4',
  cardLight: '#FAFAFA',
  text: '#000000',
  textGray: '#666666',
  textLight: '#999999',
  overlay: 'rgba(255, 255, 255, 0.7)',
  surfaceElevated: '#F0F0F0',
  glassBg: 'rgba(255, 255, 255, 0.75)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  accentGold: '#FFD700',
  accentGreen: '#00C853',
  accentBlue: '#2962FF',
  textMuted: 'rgba(0, 0, 0, 0.5)',
  textSecondary: 'rgba(0, 0, 0, 0.7)',
  divider: 'rgba(0, 0, 0, 0.06)',
};

export const adminColors = {
  ink: '#19171b',
  primary: '#75020f',
  secondary: '#51080d',
  deep: '#2b0307',
  background: '#f7f7f8',
  surface: '#ffffff',
  text: '#19171b',
  textSecondary: 'rgba(25, 23, 27, 0.68)',
  border: 'rgba(25, 23, 27, 0.12)',
  focus: 'rgba(117, 2, 15, 0.22)',
  sidebarBg: '#19171b',
  sidebarBorder: 'rgba(255, 255, 255, 0.10)',
  sidebarText: 'rgba(255, 255, 255, 0.85)',
  sidebarTextMuted: 'rgba(255, 255, 255, 0.55)',
  sidebarHover: 'rgba(255, 255, 255, 0.08)',
};

// Compatibilidad: exportar 'colors' por defecto usando paleta oscura.
// Esto evita romper componentes que aún no usan ThemeContext.
export const colors = darkColors;

// Gradientes predefinidos para efectos premium
export const gradients = {
  primary: ['#E50914', '#B20710'],
  primaryVertical: ['#E50914', '#B20710'],
  dark: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)'],
  darkReverse: ['rgba(0,0,0,0.9)', 'rgba(0,0,0,0)'],
  shimmer: ['#1a1a1a', '#2a2a2a', '#1a1a1a'],
  overlay: ['transparent', 'rgba(0,0,0,0.8)'],
  overlayTop: ['rgba(0,0,0,0.6)', 'transparent'],
  // Gradientes premium para hero
  heroBottom: ['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)', '#000'],
  heroLeft: ['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.6)', 'transparent'],
  heroTop: ['rgba(0,0,0,0.5)', 'transparent'],
  // Gradientes para cards
  cardOverlay: ['transparent', 'rgba(0,0,0,0.85)'],
};

// Tipografía premium
export const typography = {
  heroTitle: {
    fontSize: 48,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  heroTitleMobile: {
    fontSize: 30,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  sectionTitleMobile: {
    fontSize: 18,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  navLink: {
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
};

// Badge styles por status
export const badgeStyles = {
  airing: {
    backgroundColor: '#E50914',
    label: 'EN EMISIÓN',
  },
  finished: {
    backgroundColor: '#00C853',
    label: 'FINALIZADO',
  },
  upcoming: {
    backgroundColor: '#448AFF',
    label: 'PRÓXIMO',
  },
};

// Sombras predefinidas para consistencia
export const shadows = {
  none: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: {
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  glowSoft: {
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
};

// Border radius escalable
export const borderRadius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};
