import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AnimeArtwork from './AnimeArtwork';

export interface CatalogHeroItem {
  key: string;
  title: string;
  poster?: string;
  banner?: string;
  description?: string;
}

export default function CatalogHero({ items, onOpen, eyebrow = 'H ANIME  ·  DESTACADOS' }: { items: CatalogHeroItem[]; onOpen: (key: string) => void; eyebrow?: string }) {
  const { width, height } = useWindowDimensions();
  const compact = width < 768;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interaction, setInteraction] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => { setIndex(0); }, [items]);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (items.length < 2 || paused || reducedMotion || !active) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % items.length), 7000);
    return () => clearInterval(timer);
  }, [items.length, paused, reducedMotion, active, interaction]);
  if (!items.length) return null;
  const selected = Math.min(index, items.length - 1);
  const item = items[selected];
  const gutter = Math.max(compact ? 20 : 40, (width - 1120) / 2 + 20);
  const go = (direction: number) => { setInteraction(value => value + 1); setIndex(current => (current + direction + items.length) % items.length); };
  return <Pressable accessibilityRole="none" onHoverIn={() => { if (Platform.OS === 'web') setPaused(true); }} onHoverOut={() => setPaused(false)} style={[styles.hero, { height: compact ? 460 : Math.max(480, Math.min(height * 0.74, 660)) }]}>
    <AnimeArtwork banner={item.banner} poster={item.poster} />
    <LinearGradient pointerEvents="none" colors={['rgba(8,8,8,0.75)', 'rgba(8,8,8,0.2)', 'transparent']} locations={[0, 0.22, 0.5]} style={StyleSheet.absoluteFill} />
    <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.12)', '#080808']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    <View style={[styles.copy, { left: gutter, right: compact ? 20 : undefined, bottom: compact ? 84 : 94, maxWidth: compact ? undefined : 650 }]}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={[styles.title, { fontSize: compact ? 28 : 44, lineHeight: compact ? 34 : 50 }]} numberOfLines={2}>{item.title}</Text>
      {item.description ? <Text style={styles.description} numberOfLines={compact ? 2 : 3}>{item.description}</Text> : null}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Más información de ${item.title}`} style={styles.action} onPress={() => onOpen(item.key)}>
        <Ionicons name="information-circle-outline" size={22} color="#111" /><Text style={styles.actionText}>Más información</Text>
      </TouchableOpacity>
    </View>
    {items.length > 1 ? <View style={[styles.navigation, { left: gutter, right: gutter }]}>
      <View style={styles.dots}>
        {items.map((entry, i) => <TouchableOpacity key={entry.key} accessibilityRole="button" accessibilityLabel={`Mostrar destacado ${i + 1} de ${items.length}`} accessibilityState={{ selected: i === selected }} onPress={() => { setInteraction(value => value + 1); setIndex(i); }} style={[styles.dotTarget, compact && { minWidth: 24, paddingHorizontal: 3 }]}>
          <View style={[styles.dot, compact && { width: 18 }, { backgroundColor: i === selected ? '#E50914' : 'rgba(255,255,255,0.38)' }]} />
        </TouchableOpacity>)}
      </View>
      <View style={styles.controls}>
        <Text style={styles.counter}>{selected + 1} / {items.length}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Destacado anterior" onPress={() => go(-1)} style={styles.arrow}><Ionicons name="chevron-back" color="#fff" size={24} /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Siguiente destacado" onPress={() => go(1)} style={styles.arrow}><Ionicons name="chevron-forward" color="#fff" size={24} /></TouchableOpacity>
      </View>
    </View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  hero: { width: '100%', position: 'relative', overflow: 'hidden', backgroundColor: '#101016' },
  copy: { position: 'absolute', gap: 16 },
  eyebrow: { color: '#eee', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#fff', fontWeight: '900' },
  description: { color: '#ddd', fontSize: 14, lineHeight: 22 },
  action: { alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionText: { color: '#111', fontSize: 14, fontWeight: '800' },
  navigation: { position: 'absolute', bottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dotTarget: { minWidth: 32, height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  dot: { height: 3, width: 24 },
  controls: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  counter: { color: '#bbb', fontSize: 12, marginRight: 6 },
  arrow: { width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
});
