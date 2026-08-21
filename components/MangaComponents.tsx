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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `Act. ${d.getDate()} abr`;
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
  rating: number;
  chapters: number | string;
  updatedAt: string;
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
        colors={['rgba(229,9,20,0.16)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
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
//  MANGA CARD — Grid vertical tipo poster
// ─────────────────────────────────────────────
interface MangaCardProps {
  item: MangaItemUI;
  onPress: () => void;
}

export function MangaCard({ item, onPress }: MangaCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const isWeb = Platform.OS === 'web';
  const [imageError, setImageError] = useState(false);

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.05, useNativeDriver: true, friction: 5 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
      style={[styles.cardOuter, isWeb ? ({ cursor: 'pointer' } as any) : null]}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {/* Imagen poster */}
        <View style={styles.posterBox}>
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

          {/* Overlay bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />

          {/* Badge estado */}
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>

          {/* Rating */}
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#FFF" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.cardMeta}>
            <Ionicons name="document-text-outline" size={10} color="rgba(255,255,255,0.45)" />
            <Text style={styles.cardMetaText}>{item.chapters} caps.</Text>
            {item.updatedAt && (
              <>
                <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.45)" style={{ marginLeft: 4 }} />
                <Text style={styles.cardMetaText}>{formatDate(item.updatedAt)}</Text>
              </>
            )}
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
//  MANGA RANKING ITEM — Popular esta semana
// ─────────────────────────────────────────────
interface MangaRankingItemProps {
  item: MangaItemUI & { rank: number };
  onPress: () => void;
}

export function MangaRankingItem({ item, onPress }: MangaRankingItemProps) {
  const isTop = item.rank === 1;
  const scale = useRef(new Animated.Value(1)).current;
  const [imageError, setImageError] = useState(false);

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, friction: 6 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
      style={styles.rankOuter}
    >
      <Animated.View style={[styles.rankCard, isTop && styles.rankCardTop, { transform: [{ scale }] }]}>
        {/* Thumbnail */}
        <View style={styles.rankThumbBox}>
          {!item.image || imageError ? (
            <PremiumCoverFallback label="MANGA" status={item.status} />
          ) : (
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={() => setImageError(true)} />
          )}
        </View>

        {/* Info */}
        <View style={styles.rankInfo}>
          <Text style={styles.rankTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.rankRow}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.rankRating}>{item.rating.toFixed(1)}</Text>
          </View>
          <Text style={styles.rankChapters}>{item.chapters} capítulos disponibles</Text>
          <View style={[styles.rankStatusPill, { backgroundColor: STATUS_COLORS[item.status] + '33' }]}>
            <Text style={[styles.rankStatusText, { color: STATUS_COLORS[item.status] }]}>
              {item.status}
            </Text>
          </View>
        </View>

        {/* Número ranking */}
        <Text style={[styles.rankNumber, isTop && styles.rankNumberTop]}>
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
  return (
    <View style={styles.chipsRow}>
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f}
          style={[styles.chip, active === f && styles.chipActive]}
          onPress={() => onChange(f)}
          activeOpacity={0.8}
        >
          <Text style={[styles.chipText, active === f && styles.chipTextActive]}>{f}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────
//  STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  /* CARD */
  cardOuter: { flex: 1, minWidth: 140 },
  card: {
    backgroundColor: 'transparent',
  },
  posterBox: {
    height: 240,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  fallbackWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  fallbackBrand: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.1,
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
    top: 0,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ratingBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  ratingText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  cardInfo: {
    paddingVertical: 8,
    gap: 2,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardMetaText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
  },

  /* RANKING */
  rankOuter: { flex: 1, minWidth: 260 },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  rankCardTop: {
    borderColor: 'rgba(229,9,20,0.3)',
    backgroundColor: '#1a0a0a',
  },
  rankThumbBox: {
    width: 72,
    height: 90,
    backgroundColor: '#1a1a1a',
  },
  rankInfo: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  rankTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rankRating: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
  },
  rankChapters: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  rankStatusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    marginTop: 2,
  },
  rankStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rankNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
  },
  rankNumberTop: {
    color: '#E50914',
  },

  /* FILTER CHIPS */
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipActive: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  chipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
