import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SeekButton({ forward = false, onPress }: { forward?: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={forward ? 'Avanzar 10 segundos' : 'Retroceder 10 segundos'} onPress={onPress} style={s.button}>
    <Ionicons name={forward ? 'play-forward' : 'play-back'} size={22} color="#fff" />
    <Text style={s.text}>10 s</Text>
  </TouchableOpacity>;
}
const s = StyleSheet.create({
  button: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(25,30,32,0.82)', justifyContent: 'center', alignItems: 'center', gap: 1 },
  text: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
