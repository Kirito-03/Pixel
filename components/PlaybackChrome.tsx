import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  title: string; subtitle: string; onClose: () => void;
  servers?: Array<{ server?: string; label?: string }>; selectedIndex?: number; onSelectServer?: (index: number) => void;
  menuOpen?: boolean; onMenuChange?: (open: boolean) => void;
  onPrevious?: () => void; onNext?: () => void;
};
/** Shared app controls. The media/provider keeps its own playback controls. */
export default function PlaybackChrome({ title, subtitle, onClose, servers = [], selectedIndex = 0, onSelectServer, menuOpen = false, onMenuChange, onPrevious, onNext }: Props) {
  const { width, height } = useWindowDimensions();
  const compact = width < 700;
  const selector = servers.length > 0 && onSelectServer && <View style={{ position: 'relative' }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cambiar servidor de video" accessibilityState={{ expanded: menuOpen }} onPress={() => onMenuChange?.(!menuOpen)} style={[s.button, menuOpen && s.selected]}>
      <Ionicons name="server-outline" size={16} color="#ddd" />
      <Text numberOfLines={1} style={s.buttonText}>{servers[selectedIndex]?.server || servers[selectedIndex]?.label || 'Servidor'}</Text>
      <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#bbb" />
    </TouchableOpacity>
  </View>;
  const actions = <View style={s.actions}>
    {onPrevious && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Capítulo anterior" onPress={onPrevious} style={s.button}><Ionicons name="play-skip-back-outline" size={16} color="#eee" /><Text style={s.buttonText}>Anterior</Text></TouchableOpacity>}
    {onNext && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Siguiente capítulo" onPress={onNext} style={[s.button, s.next]}><Text style={[s.buttonText, { color: '#151515' }]}>Siguiente</Text><Ionicons name="play-skip-forward" size={15} color="#151515" /></TouchableOpacity>}
    {selector}
  </View>;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <LinearGradient colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.5)', 'transparent']} style={[s.gradient, { height: compact ? 160 : 116 }]} pointerEvents="none" />
    <View style={[s.header, compact && { paddingHorizontal: 14, paddingTop: 12 }]} pointerEvents="box-none">
      <View style={s.top}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a detalles de la serie" onPress={onClose} style={s.back}><Ionicons name="arrow-back" size={23} color="#fff" /></TouchableOpacity>
        <View style={s.titleCopy}><Text numberOfLines={1} style={s.title}>{title}</Text><Text numberOfLines={1} style={s.subtitle}>{subtitle}</Text></View>
        {!compact && actions}
      </View>
      {compact && <View style={s.compactActions}>{actions}</View>}
    </View>
    {menuOpen && <View style={[s.menu, { top: compact ? 114 : 76, right: compact ? 14 : 24, maxHeight: Math.max(90, height - (compact ? 136 : 100)) }]}>
      <Text style={s.menuTitle}>SERVIDOR DE VIDEO</Text>
      <ScrollView showsVerticalScrollIndicator={false}>{servers.map((server, index) => <TouchableOpacity key={`${server.server || server.label}-${index}`} accessibilityRole="button" accessibilityState={{ selected: index === selectedIndex }} onPress={() => { onSelectServer?.(index); onMenuChange?.(false); }} style={[s.option, index === selectedIndex && s.selected]}>
        <Text style={s.buttonText}>{server.server || server.label || `Servidor ${index + 1}`}</Text>
        {index === selectedIndex && <Ionicons name="checkmark" size={17} color="#c9ddda" />}
      </TouchableOpacity>)}</ScrollView>
    </View>}
  </View>;
}
const s = StyleSheet.create({
  gradient: { position: 'absolute', top: 0, left: 0, right: 0 }, header: { paddingHorizontal: 24, paddingTop: 18, gap: 8 }, top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(26,29,31,0.88)', borderRadius: 6 },
  titleCopy: { flex: 1, minWidth: 0, gap: 5 }, title: { color: '#f5f5f5', fontSize: 16, fontWeight: '600' }, subtitle: { color: '#bbb', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }, compactActions: { alignItems: 'flex-end' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 42, paddingHorizontal: 12, backgroundColor: 'rgba(31,35,38,0.95)', borderRadius: 6, flexShrink: 1 }, buttonText: { color: '#eee', fontSize: 12, fontWeight: '600', flexShrink: 1 }, next: { backgroundColor: '#e4e9e8' },
  selected: { backgroundColor: '#344544' }, menu: { position: 'absolute', width: 224, backgroundColor: '#191d20', padding: 8, borderRadius: 8 }, menuTitle: { color: '#97a3a6', fontSize: 9, letterSpacing: 1.2, padding: 10 }, option: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 4, marginTop: 2 },
});
