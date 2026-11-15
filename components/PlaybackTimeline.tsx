import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';

export function playbackTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
export default function PlaybackTimeline({ currentTime, duration, onSeek, onScrubbingChange }: {
  currentTime: number; duration: number; onSeek: (time: number) => void; onScrubbingChange: (active: boolean) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const width = useRef(0), origin = useRef(0), target = useRef<number | null>(null);
  const callbacks = useRef({ duration, onSeek, onScrubbingChange });
  callbacks.current = { duration, onSeek, onScrubbingChange };
  const responder = useMemo(() => {
    const update = (x: number) => {
      const total = callbacks.current.duration;
      if (!(width.current > 0) || !(total > 0)) return;
      target.current = Math.max(0, Math.min(1, x / width.current)) * total;
      setPreview(target.current);
    };
    const finish = (commit: boolean) => {
      if (commit && target.current !== null) callbacks.current.onSeek(target.current);
      target.current = null; setPreview(null); callbacks.current.onScrubbingChange(false);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => callbacks.current.duration > 0,
      onMoveShouldSetPanResponder: () => callbacks.current.duration > 0,
      onPanResponderGrant: event => { origin.current = event.nativeEvent.locationX; callbacks.current.onScrubbingChange(true); update(origin.current); },
      onPanResponderMove: (_, gesture) => update(origin.current + gesture.dx),
      onPanResponderRelease: () => finish(true), onPanResponderTerminate: () => finish(false),
      onPanResponderTerminationRequest: () => false,
    });
  }, []);
  const shown = preview ?? currentTime;
  const percent = duration > 0 ? Math.max(0, Math.min(100, shown / duration * 100)) : 0;
  return <View style={s.row}>
    <Text style={s.time}>{playbackTime(shown)}</Text>
    <View {...responder.panHandlers} style={s.touch} onLayout={event => { width.current = event.nativeEvent.layout.width; }}
      accessible accessibilityRole="adjustable" accessibilityLabel="Posición de reproducción"
      accessibilityValue={{ min: 0, max: Math.max(0, duration), now: Math.max(0, Math.min(currentTime, duration)), text: `${playbackTime(shown)} de ${playbackTime(duration)}` }}
      accessibilityActions={[{ name: 'increment', label: 'Avanzar diez segundos' }, { name: 'decrement', label: 'Retroceder diez segundos' }]}
      onAccessibilityAction={event => { if (duration > 0) onSeek(Math.max(0, Math.min(duration, currentTime + (event.nativeEvent.actionName === 'increment' ? 10 : -10)))); }}>
      <View pointerEvents="none" style={s.track}><View style={[s.fill, { width: `${percent}%` }]} /></View>
      <View pointerEvents="none" style={[s.thumb, { left: `${percent}%` }]} />
    </View>
    <Text style={[s.time, { textAlign: 'right' }]}>{playbackTime(duration)}</Text>
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, time: { color: '#eee', fontSize: 12, minWidth: 44, fontVariant: ['tabular-nums'] },
  touch: { flex: 1, height: 44, justifyContent: 'center' }, track: { height: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden', borderRadius: 2 },
  fill: { height: 4, backgroundColor: '#e2eeeb' }, thumb: { position: 'absolute', width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: '#e2eeeb', top: 16 },
});
