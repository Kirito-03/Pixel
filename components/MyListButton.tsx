import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMyList } from '../contexts/MyListContext';
import { useTheme } from '../contexts/ThemeContext';
import { MyListContentType } from '../services/myListApi';

export default function MyListButton({ id, type, compact = false }: { id: string | number; type: MyListContentType; compact?: boolean }) {
  const { colors } = useTheme();
  const { isInMyList, isUpdatingMyList, toggleMyList, loading } = useMyList();
  const saved = isInMyList(id, type);
  const saving = isUpdatingMyList(id, type);
  const [error, setError] = useState('');
  return <View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={saving ? 'Guardando en Mi Lista' : saved ? 'Quitar de Mi Lista' : 'Añadir a Mi Lista'}
      accessibilityState={{ busy: saving || loading, disabled: saving || loading }} disabled={saving || loading}
      style={[styles.button, { backgroundColor: compact ? 'rgba(0,0,0,.85)' : colors.card }, compact && styles.compact]}
      onPress={async event => {
        event.stopPropagation();
        setError('');
        try { await toggleMyList(id, type); }
        catch { setError('No se pudo guardar. Revisa tu conexión y tu sesión.'); }
      }}>
      {saving || loading ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name={saved ? 'checkmark' : 'add'} size={22} color={colors.text} />}
      {!compact ? <Text style={{ color: colors.text, fontWeight: '700' }}>{saving ? 'Guardando…' : saved ? 'En mi lista' : 'Mi lista'}</Text> : null}
    </TouchableOpacity>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 18, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  compact: { width: 44, paddingHorizontal: 0 },
  error: { color: '#ff9090', fontSize: 12, marginTop: 6, maxWidth: 240 },
});
