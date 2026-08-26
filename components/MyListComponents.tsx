import React, { useRef } from 'react';
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

function resolveImageUrl(path: string | undefined, tmdbSize: 'w92' | 'w500') {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
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
  item: ContentItem;
  currentEpisode?: number;
  totalEpisodes?: number;
  progress?: number; // 0–1
  onPress: () => void;
  onRemove: () => void;
}

export function ContinueWatchingCard({ item, currentEpisode = 1, totalEpisodes, progress, onPress, onRemove }: ContinueCardProps) {
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
          {totalEpisodes ? (
            <Text style={[cwStyles.episode, { color: colors.textMuted }]}>
              Episodio {currentEpisode} de {totalEpisodes}
            </Text>
          ) : null}
          <ProgressBar progress={progressValue} height={3} />
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
interface WatchListItemProps {
  item: ContentItem;
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
  const computedProgress = totalEpisodes && currentEpisode ? currentEpisode / totalEpisodes : 0;
  const progressValue = typeof progress === 'number' ? progress : computedProgress;
  const percent = Math.round(progressValue * 100);

  const poster = resolveImageUrl(item.poster_path, 'w92');

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.01, useNativeDriver: true, friction: 7 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }).start();

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
    >
      <Animated.View style={[wlStyles.card, { backgroundColor: colors.card, borderColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, { transform: [{ scale }] }]}>
        {/* Thumbnail */}
        <View style={wlStyles.thumb}>
          {poster ? (
            <Image source={{ uri: poster }} style={wlStyles.thumbImg} resizeMode="cover" />
          ) : (
            <View style={wlStyles.noThumb}>
              <Ionicons name="film-outline" size={20} color="rgba(255,255,255,0.2)" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={wlStyles.info}>
          <Text style={[wlStyles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>

          <View style={wlStyles.metaRow}>
            {item.vote_average ? (
              <>
                <Ionicons name="star" size={11} color="#FFD700" />
                <Text style={[wlStyles.metaText, { color: colors.textMuted }]}>{item.vote_average.toFixed(1)}</Text>
              </>
            ) : null}
            {totalEpisodes ? (
              <>
                <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                <Text style={[wlStyles.metaText, { color: colors.textMuted }]}>
                  {currentEpisode ?? 0}/{totalEpisodes} episodios
                </Text>
              </>
            ) : null}
          </View>

          {/* Progress bar + % */}
          <View style={wlStyles.progressRow}>
            <View style={{ flex: 1 }}>
              <ProgressBar progress={progressValue} height={4} />
            </View>
            <Text style={[wlStyles.percent, { color: colors.textMuted }]}>{percent}%</Text>
          </View>
        </View>

        {/* Botón eliminar */}
        <TouchableOpacity
          style={wlStyles.removeBtn}
          onPress={(e) => {
            (e as any)?.stopPropagation?.();
            onRemove();
          }}
          disabled={removing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {removing ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.45)" />
          )}
        </TouchableOpacity>
      </Animated.View>
    </TouchableOpacity>
  );
}

const wlStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  thumb: {
    width: 72,
    height: 88,
    backgroundColor: '#1a1a1a',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  noThumb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  percent: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    minWidth: 32,
    textAlign: 'right',
  },
  removeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
