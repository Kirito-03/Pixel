import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MangaStatus } from '../services/mangaApi';
import { useTheme } from '../contexts/ThemeContext';

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatMangaDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Act. ${d.getDate()} ${MONTHS_ES[d.getMonth()] || ''}`.trim();
}

const STATUS_COLORS: Record<string, string> = {
  'En emisión': '#00C853',
  'Finalizado': '#E50914',
  Hiatus: '#FFD600',
  Cancelado: '#9E9E9E',
};

export interface MangaItemUI {
  id: string;
  title: string;
  image: string;
  status: MangaStatus;
  chapters: number | string;
  updatedAt: string;
  year?: number | null;
  popular?: boolean;
}

function PremiumCoverFallback({ label, status }: { label?: string; status?: string }) {
  return (
    <View style={styles.fallbackWrap}>
      <LinearGradient
        colors={['#191919', '#111111', '#0A0A0A']}
        locations={[0, 0.62, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(229,9,20,0.18)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Ionicons name="book-outline" size={26} color="rgba(255,255,255,0.28)" style={{ marginBottom: 8 }} />
      <Text style={styles.fallbackBrand}>{label || 'PIXEL NO SEKAI'}</Text>
      {status ? (
        <View style={styles.fallbackBadge}>
          <Text style={styles.fallbackBadgeText}>{String(status).toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
//  MANGA CARD — Grid vertical tipo poster 2:3
// ─────────────────────────────────────────────
interface MangaCardProps {
  item: MangaItemUI;
  onPress: () => void;
}

export function MangaCard({ item, onPress }: MangaCardProps) {
  const { colors, theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const isWeb = Platform.OS === 'web';
  const [imageError, setImageError] = useState(false);

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.03, useNativeDriver: true, friction: 6 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

  const formattedDate = formatMangaDate(item.updatedAt);
  const metaText = formattedDate || (item.year ? String(item.year) : '');
  const chapterLabel = item.chapters ? `Cap. ${item.chapters}` : 'Leer';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={[styles.cardOuter, isWeb ? ({ cursor: 'pointer' } as any) : null]}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View
          style={[
            styles.posterBox,
            {
              borderColor: theme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)',
            },
          ]}
        >
          {!item.image || imageError ? (
            <PremiumCoverFallback label="MANGA" status={item.status} />
          ) : (
            <Image
              source={{ uri: item.image }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.88)']}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />

          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#E50914' }]}>
            <Text style={styles.statusText} numberOfLines={1}>
              {String(item.status).toUpperCase()}
            </Text>
          </View>

          <View style={styles.chapterPill}>
            <Ionicons name="book-outline" size={11} color="#FFF" />
            <Text style={styles.chapterPillText} numberOfLines={1}>
              {chapterLabel}
            </Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          {metaText ? (
            <View style={styles.cardMeta}>
              <Ionicons name="time-outline" size={11} color={colors.textMuted} />
              <Text style={[styles.cardMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                {metaText}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
//  MANGA RANKING ITEM — Populares
// ─────────────────────────────────────────────
interface MangaRankingItemProps {
  item: MangaItemUI & { rank: number };
  onPress: () => void;
  isTop?: boolean;
}

export function MangaRankingItem({ item, onPress, isTop: propIsTop }: MangaRankingItemProps) {
  const { colors, theme } = useTheme();
  const isTop = propIsTop ?? item.rank === 1;
  const scale = useRef(new Animated.Value(1)).current;
  const [imageError, setImageError] = useState(false);

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, friction: 6 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

  const statusColor = STATUS_COLORS[item.status] || '#E50914';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
      accessibilityRole="button"
      accessibilityLabel={`${item.rank}. ${item.title}`}
      style={styles.rankOuter}
    >
      <Animated.View
        style={[
          styles.rankCard,
          {
            backgroundColor: colors.card,
            borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
          isTop && styles.rankCardTop,
          isTop && { backgroundColor: theme === 'dark' ? '#1a0a0a' : '#ffe5e5' },
          { transform: [{ scale }] },
        ]}
      >
        <View style={styles.rankThumbBox}>
          {!item.image || imageError ? (
            <PremiumCoverFallback label="MANGA" status={item.status} />
          ) : (
            <Image
              source={{ uri: item.image }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}
        </View>

        <View style={styles.rankInfo}>
          <Text style={[styles.rankTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.chapters ? (
            <Text style={[styles.rankChapters, { color: colors.textMuted }]} numberOfLines={1}>
              Cap. {item.chapters}
            </Text>
          ) : null}
          <View style={[styles.rankStatusPill, { backgroundColor: statusColor + '26' }]}>
            <Text style={[styles.rankStatusText, { color: statusColor }]} numberOfLines={1}>
              {item.status}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.rankNumber,
            { color: theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)' },
            isTop && styles.rankNumberTop,
          ]}
        >
          #{item.rank}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
//  FILTER CHIPS
// ─────────────────────────────────────────────
export type MangaFilter = 'Todos' | MangaStatus;

interface FilterChipsProps {
  active: MangaFilter;
  onChange: (f: MangaFilter) => void;
}

const FILTERS: MangaFilter[] = ['Todos', 'En emisión', 'Finalizado', 'Hiatus', 'Cancelado'];

export function MangaFilterChips({ active, onChange }: FilterChipsProps) {
  const { colors, theme } = useTheme();
  return (
    <View style={styles.chipsRow}>
      {FILTERS.map((f) => {
        const isActive = active === f;
        return (
          <TouchableOpacity
            key={f}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={[
              styles.chip,
              {
                backgroundColor: colors.card,
                borderColor: theme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)',
              },
              isActive && styles.chipActive,
            ]}
            onPress={() => onChange(f)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.chipText,
                { color: theme === 'dark' ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.72)' },
                isActive && styles.chipTextActive,
              ]}
            >
              {f}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  /* CARD */
  cardOuter: { width: '100%' },
  card: {
    backgroundColor: 'transparent',
  },
  posterBox: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#121216',
    position: 'relative',
  },
  chapterPill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    maxWidth: '85%',
  },
  chapterPillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 84,
  },
  fallbackWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  fallbackBrand: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  fallbackBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fallbackBadgeText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    maxWidth: '85%',
  },
  statusText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardInfo: {
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '500',
  },

  /* RANKING */
  rankOuter: { width: '100%' },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    minHeight: 96,
  },
  rankCardTop: {
    borderColor: 'rgba(229,9,20,0.45)',
    backgroundColor: '#1a0a0a',
  },
  rankThumbBox: {
    width: 64,
    height: 96,
    backgroundColor: '#1a1a1a',
    flexShrink: 0,
  },
  rankInfo: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    justifyContent: 'center',
  },
  rankTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  rankChapters: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
  },
  rankStatusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  rankStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rankNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.16)',
    paddingRight: 14,
    paddingLeft: 4,
  },
  rankNumberTop: {
    color: '#E50914',
  },

  /* FILTER CHIPS */
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  chipText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
