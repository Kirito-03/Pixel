import React from 'react';
import { Platform, requireNativeComponent, StyleSheet, UIManager, ViewProps } from 'react-native';

// A view inside the player Modal controls that window, rather than the
// underlying Activity. Older development clients can still render safely.
const Surface = Platform.OS === 'android' && UIManager.getViewManagerConfig('PixelPlayerSystemBars')
  ? requireNativeComponent<ViewProps>('PixelPlayerSystemBars') : null;

export default function PlayerSystemBars() {
  return Surface ? <Surface pointerEvents="none" accessible={false} style={styles.surface} /> : null;
}
const styles = StyleSheet.create({ surface: { position: 'absolute', width: 1, height: 1 } });
