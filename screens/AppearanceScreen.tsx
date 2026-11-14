import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';

export default function AppearanceScreen() {
  const { theme, colors, spacing, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const navigation = useNavigation();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Botón de cierre (X) en la esquina superior derecha */}
      <TouchableOpacity
        style={[
          styles.closeButton,
          {
            backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.12)',
            top: 12 + (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0),
          },
        ]}
        onPress={() => {
          const nav = navigation as any;
          if (nav?.canGoBack?.()) {
            nav.goBack();
          } else {
            nav?.navigate?.('Profile');
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Cerrar apariencia"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={isDark ? '#FFFFFF' : '#000000'} />
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.text }]}>Apariencia</Text>
      <View style={[styles.item, { backgroundColor: colors.card }]}>
        <View style={styles.itemTextWrapper}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>Modo oscuro</Text>
          <Text style={[styles.itemSubtitle, { color: colors.textGray }]}>Tema actual: {isDark ? 'Oscuro' : 'Claro'}</Text>
        </View>
        <Switch value={isDark} onValueChange={toggleTheme} />
      </View>
      <Text style={[styles.note, { color: colors.textGray }]}>Nota: el tema se aplica gradualmente en la app. Los elementos principales ya responden al cambio.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  itemTextWrapper: {
    flexDirection: 'column',
    gap: 4,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 14,
  },
  note: {
    marginTop: 12,
    fontSize: 12,
  },
});