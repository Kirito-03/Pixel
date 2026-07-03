import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, typography } from '../theme';
import CategoriesMenu from './CategoriesMenu';
import PressableScale from './PressableScale';
import { useProfile } from '../contexts/ProfileContext';

interface HeaderProps {
  black?: boolean;
  activeSection?: string;   // qué tab está activo (ej: 'Noticias', 'Manga')
  onProfilePress?: () => void;
  onSearchPress?: () => void;
  onFilterChange?: (filter: 'series' | 'movies' | 'all' | 'anime') => void;
  onCategorySelect?: (categoryId: string, categoryName: string) => void;
  currentCategoryId?: string;
  onNavPress?: (label: string) => void;
}

export default function Header({ black = false, activeSection = 'Inicio', onProfilePress, onSearchPress, onFilterChange, onCategorySelect, currentCategoryId, onNavPress }: HeaderProps) {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const [showCategoriesMenu, setShowCategoriesMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const { currentProfile } = useProfile();
  const avatarUrl = currentProfile?.avatar_url || null;
  // activeNav es controlado por el prop activeSection — sin estado interno
  // para evitar que React Navigation cache un valor incorrecto entre navegaciones

  const backgroundOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(1)).current;
  const searchIconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(backgroundOpacity, {
      toValue: black ? 1 : 0,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [black]);

  const backgroundColor = backgroundOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 0, 0, 0)', 'rgba(8, 8, 8, 0.92)'],
  });

  const handleCategorySelect = (categoryId: string, categoryName: string) => {
    onCategorySelect?.(categoryId, categoryName);
  };

  const handleCloseMenu = () => {
    setShowCategoriesMenu(false);
  };

  const animateIcon = (iconAnim: Animated.Value) => {
    Animated.sequence([
      Animated.spring(iconAnim, {
        toValue: 1.15,
        useNativeDriver: true,
        friction: 3,
      }),
      Animated.spring(iconAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 3,
      }),
    ]).start();
  };

  // Links de navegación central (web/tablet)
  const navLinks = [
    { label: 'Inicio', icon: 'home' },
    { label: 'Noticias', icon: 'newspaper' },
    { label: 'Emisión', icon: 'radio' },
    { label: 'Manga', icon: 'book' },
    { label: 'Mi Lista', icon: 'bookmark' },
  ];

  const dynamicStyles = {
    container: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999,
    },
    header: {
      height: isSmallScreen ? (isWeb ? 64 : 56) : (isWeb ? 72 : 64),
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: isSmallScreen ? 16 : 40,
    },
    logoContainer: {
      height: isSmallScreen ? 25 : 30,
      justifyContent: 'center' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    rightContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: isSmallScreen ? 12 : 18,
    },
    searchButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    profileButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      overflow: 'hidden' as const,
    },
  };

  return (
    <Animated.View
      style={[
        dynamicStyles.container,
        { backgroundColor },
        isWeb && black ? {
          // @ts-ignore — web-only property
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        } as any : null,
      ]}
    >
      {/* Fallback for missing BlurView */}
      {black && Platform.OS !== 'web' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 8, 8, 0.92)' }]} />
        // <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <SafeAreaView>
        <View style={dynamicStyles.header}>
          {/* Logo: PIXEL NO SEKAI */}
          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
            <TouchableOpacity
              style={dynamicStyles.logoContainer}
              onPressIn={() => {
                Animated.spring(logoScale, {
                  toValue: 0.95,
                  useNativeDriver: true,
                  friction: 3,
                }).start();
              }}
              onPressOut={() => {
                Animated.spring(logoScale, {
                  toValue: 1,
                  useNativeDriver: true,
                  friction: 3,
                }).start();
              }}
            >
              {/* View con row: única forma fiable en RN Web de tener dos colores distintos en la misma línea */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.logoPrimary}>PIXEL </Text>
                <Text style={styles.logoPrimary}>NO SEKAI</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Navegación Central (solo web/tablet) */}
          {!isSmallScreen && (
            <View style={styles.navContainer}>
              {navLinks.map((link) => (
                <TouchableOpacity
                  key={link.label}
                  style={styles.navLink}
                  onPress={() => {
                    // NO actualizamos estado local — el prop activeSection es la fuente de verdad
                    onNavPress?.(link.label);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={link.icon as any}
                    size={15}
                    color={activeSection === link.label ? colors.text : colors.textLight}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[
                    styles.navLinkText,
                    activeSection === link.label && styles.navLinkTextActive,
                  ]}>
                    {link.label}
                  </Text>
                  {activeSection === link.label && (
                    <View style={styles.navActiveIndicator} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Derecha: Búsqueda + Perfil */}
          <View style={dynamicStyles.rightContainer}>
            {/* Botón buscar */}
            <Animated.View style={{ transform: [{ scale: searchIconScale }] }}>
              <TouchableOpacity
                style={dynamicStyles.searchButton}
                onPress={() => {
                  animateIcon(searchIconScale);
                  onSearchPress?.();
                }}
              >
                <Ionicons name="search" size={isSmallScreen ? 18 : 20} color={colors.text} />
              </TouchableOpacity>
            </Animated.View>

            {/* Avatar/Perfil */}
            <TouchableOpacity
              style={dynamicStyles.profileButton}
              onPress={onProfilePress}
              activeOpacity={0.7}
            >
              {avatarUrl && !avatarError ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.headerAvatar}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <Ionicons name="person" size={isSmallScreen ? 16 : 18} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>

      {/* Menú de Categorías */}
      <CategoriesMenu
        visible={showCategoriesMenu}
        onClose={handleCloseMenu}
        onSelectCategory={handleCategorySelect}
        currentCategoryId={currentCategoryId}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  logoPrimary: {
    fontSize: 20,
    fontWeight: '900',
    color: '#E50914',   // rojo — explícito para evitar herencia
    letterSpacing: 2,
  },
  logoSecondary: {
    fontSize: 20,
    fontWeight: '300',
    color: '#FFFFFF',   // blanco puro — explícito para evitar herencia
    letterSpacing: 2,
  },
  navContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: 'relative',
  },
  navLinkText: {
    ...typography.navLink,
    color: colors.textLight,   // #b3b3b3 — más visible que textGray en fondo oscuro
  },
  navLinkTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  navActiveIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
  },
});
