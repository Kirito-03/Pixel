import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ContentItem } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrentBaseURL } from '../services/db/networkClient';

function resolveImageUrl(path: string | undefined, tmdbSize: 'w92' | 'w500') {
  if (!path) return undefined;
  if (/^(https?:|data:image\/)/i.test(path)) return path;
  if (path.startsWith('/api/')) return `${getCurrentBaseURL().replace(/\/$/, '')}${path}`;
  return `https://image.tmdb.org/t/p/${tmdbSize}${path}`;
}

// ─────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────
interface ProgressBarProps {
  progress: number; // 0–1
  height?: number;
}
export function ProgressBar({ progress, height = 3 }: ProgressBarProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={[pbStyles.track, { height }]}>
      <View style={[pbStyles.fill, { width: `${clamped * 100}%` as any }]} />
    </View>
  );
}
const pbStyles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
});

// ─────────────────────────────────────────────
// CONTINUE WATCHING CARD
// ─────────────────────────────────────────────
interface ContinueCardProps {
  positionKnown?: boolean;
  item: ContentItem;
  currentEpisode?: number;
  totalEpisodes?: number;
  progress?: number; // 0–1
  onPress: () => void;
  onRemove: () => void;
}

export function ContinueWatchingCard({ positionKnown = true, item, currentEpisode = 1, totalEpisodes, progress, onPress, onRemove }: ContinueCardProps) {
  const { colors, theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const isWeb = Platform.OS === 'web';
  const computedProgress = totalEpisodes ? currentEpisode / totalEpisodes : 0;
  const progressValue = typeof progress === 'number' ? progress : computedProgress;
  const image = resolveImageUrl(item.backdrop_path, 'w500') ?? resolveImageUrl(item.poster_path, 'w500');

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.04, useNativeDriver: true, friction: 5 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();

  return (
    <TouchableOpacity
      accessibilityRole="button" accessibilityLabel={`Continuar ${item.title}`}
      activeOpacity={0.9}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
      style={[cwStyles.outer, isWeb ? ({ cursor: 'pointer' } as any) : null]}
    >
      <Animated.View style={[cwStyles.card, { backgroundColor: colors.card, borderColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, { transform: [{ scale }] }]}>
        {/* Imagen */}
        <View style={cwStyles.imageBox}>
          {image ? (
            <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <View style={cwStyles.noImage}>
              <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.2)" />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Play button centrado */}
          <View style={cwStyles.playOverlay}>
            <View style={cwStyles.playButton}>
              <Ionicons name="play" size={22} color="#fff" />
            </View>
          </View>

          {/* Botón eliminar */}
          <TouchableOpacity
            accessibilityRole="button" accessibilityLabel={`Quitar ${item.title} de Continuar viendo`}
            style={cwStyles.removeBtn}
            onPress={(e) => {
              (e as any)?.stopPropagation?.();
              onRemove();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Info + progreso */}
        <View style={cwStyles.info}>
          <View style={cwStyles.infoRow}>
            <Text style={[cwStyles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          </View>
          <Text style={[cwStyles.episode, { color: colors.textMuted }]}>
            Episodio {currentEpisode}{totalEpisodes ? ` de ${totalEpisodes}` : ''}{!positionKnown ? ' · Abrir capítulo' : ''}
          </Text>
          {positionKnown ? <ProgressBar progress={progressValue} height={3} /> :
            <Text style={[cwStyles.episode, { color: colors.textMuted }]}>Este servidor no permite guardar el minuto.</Text>}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const cwStyles = StyleSheet.create({
  outer: { width: 240 },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  imageBox: {
    height: 140,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  noImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(229,9,20,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 3,
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    padding: 12,
    gap: 5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  episode: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },
});

// ─────────────────────────────────────────────
// WATCH LIST ITEM (fila horizontal)
// ─────────────────────────────────────────────
export type SavedListItem = Omit<ContentItem, 'id' | 'type'> & { id: string | number; type: 'anime' | 'manga' | 'h_anime' | 'movie' | 'tv' };

interface WatchListItemProps {
  item: SavedListItem;
  currentEpisode?: number;
  totalEpisodes?: number;
  progress?: number; // 0–1
  removing?: boolean;
  onPress: () => void;
  onRemove: () => void;
}

export function WatchListItem({ item, currentEpisode, totalEpisodes, progress, removing, onPress, onRemove }: WatchListItemProps) {
  const { colors, theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const [imageFailed, setImageFailed] = useState(false);
  const poster = resolveImageUrl(item.poster_path, 'w500');
  useEffect(() => { setImageFailed(false); }, [poster]);
  const progressValue = Math.max(0, Math.min(1, progress ?? 0));
  const percent = Math.round(progressValue * 100);
  const label = item.type === 'manga' ? 'MANGA' : item.type === 'h_anime' ? 'H ANIME · 18+' : item.type === 'anime' ? 'ANIME' : item.type === 'movie' ? 'PELÍCULA' : 'SERIE';
  const accent = item.type === 'manga' ? colors.accentBlue : colors.primary;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ver detalles de ${item.title}`} activeOpacity={0.9} onPress={onPress}
    onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start()}
    onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}>
    <Animated.View style={[wlStyles.card, { backgroundColor: colors.card, borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', transform: [{ scale }] }]}>
      <View style={wlStyles.thumb}>
        {poster && !imageFailed ? <Image source={{ uri: poster }} resizeMode="cover" style={StyleSheet.absoluteFillObject} onError={() => setImageFailed(true)} />
          : <View style={wlStyles.fallbackBox}>
              <Ionicons name={item.type === 'manga' ? 'book-outline' : 'film-outline'} size={34} color={colors.textMuted} />
            </View>}
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        <View style={[wlStyles.badge, { backgroundColor: accent }]}>
          <Text style={wlStyles.type}>{label}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Eliminar ${item.title} de Mi Lista`} accessibilityState={{ busy: removing, disabled: removing }}
          disabled={removing} style={wlStyles.remove} onPress={event => { event.stopPropagation(); onRemove(); }}>
          {removing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="close" size={16} color="#fff" />}
        </TouchableOpacity>
        {progressValue > 0 ? (
          <View style={wlStyles.progressOverlay}>
            <ProgressBar progress={progressValue} height={4} />
          </View>
        ) : null}
      </View>
      <View style={wlStyles.info}>
        <Text style={[wlStyles.title, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
        {item.type !== 'manga' && currentEpisode !== undefined ? (
          <Text style={[wlStyles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            Ep. {currentEpisode}{totalEpisodes ? ` / ${totalEpisodes}` : ''}{progressValue > 0 ? ` · ${percent}%` : ''}
          </Text>
        ) : progressValue > 0 ? (
          <Text style={[wlStyles.meta, { color: colors.textMuted }]}>{percent}% visto</Text>
        ) : (
          <Text style={[wlStyles.meta, { color: colors.textMuted }]}>{item.type === 'manga' ? 'Leer manga →' : 'Ver detalles →'}</Text>
        )}
      </View>
    </Animated.View>
  </TouchableOpacity>;
}
const wlStyles = StyleSheet.create({
  card: { width: '100%', borderRadius: 2, overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 2 / 3, backgroundColor: '#18181f', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  fallbackBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', bottom: 10, left: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  info: { padding: 12, gap: 6, minHeight: 96, justifyContent: 'space-between' },
  type: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: '#fff' },
  title: { fontSize: 14, lineHeight: 19, minHeight: 38, fontWeight: '700' },
  meta: { fontSize: 11, fontWeight: '600' },
  progressOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  remove: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center' },
});
