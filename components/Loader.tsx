import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function Loader({ onDark = false, label = 'Preparando tu espacio…' }: { onDark?: boolean; label?: string }) {
  const { colors } = useTheme();
  const tiles = useRef(Array.from({ length: 9 }, () => new Animated.Value(0.25))).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion) { tiles.forEach(tile => tile.setValue(0.65)); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.stagger(65, tiles.map(tile => Animated.sequence([
        Animated.timing(tile, { toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tile, { toValue: 0.25, duration: 420, useNativeDriver: true }),
      ]))),
      Animated.delay(180),
    ]));
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, tiles]);
  const ink = onDark ? '#edf4f2' : colors.text;
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={styles.container}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.matrix}>
      {tiles.map((tile, index) => <Animated.View key={index} style={[styles.tile, { backgroundColor: index === 4 ? '#83bdb4' : ink, opacity: tile, transform: [{ scale: tile.interpolate({ inputRange: [0.25, 1], outputRange: [0.82, 1] }) }] }]} />)}
    </View>
    <Text style={[styles.label, { color: onDark ? '#b7c4c1' : colors.textMuted }]}>{label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 22, padding: 20 },
  matrix: { width: 54, height: 54, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: 14, height: 14, borderRadius: 2 },
  label: { fontSize: 13, lineHeight: 20, letterSpacing: 0.25, textAlign: 'center' },
});
