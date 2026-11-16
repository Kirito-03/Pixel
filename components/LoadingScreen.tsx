import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import Loader from './Loader';

export default function LoadingScreen() {
  const { colors } = useTheme();
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <Text style={[styles.brand, { color: colors.text }]}>PIXEL <Text style={{ color: '#83bdb4' }}>NO SEKAI</Text></Text>
    <Loader />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, padding: 24 },
  brand: { fontSize: 20, fontWeight: '700', letterSpacing: 2 },
});
