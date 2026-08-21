import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NewsItem } from '../data/mockNews';

const BADGE_COLORS: Record<string, string> = {
  Estreno: '#E50914',
  Actualización: '#2979FF',
  Evento: '#7B1FA2',
  Exclusiva: '#E65100',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

function PremiumImageFallback({ label, category }: { label?: string; category?: string }) {
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
      {category ? (
        <View style={styles.fallbackBadge}>
          <Text style={styles.fallbackBadgeText}>{String(category).toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// HERO — Noticia destacada
// ─────────────────────────────────────────────
interface NewsHeroProps {
  item: NewsItem;
  onPress: () => void;
}

export function NewsHero({ item, onPress }: NewsHeroProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imageError, setImageError] = useState(false);

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.015, useNativeDriver: true, friction: 6 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      onPressIn={onIn}
      onPressOut={onOut}
      style={styles.heroWrapper}
    >
      <Animated.View style={[styles.heroCard, { transform: [{ scale }] }]}>
        {!item.image || imageError ? (
          <PremiumImageFallback label="NEWS" category={item.badge} />
        ) : (
          <Image
            source={{ uri: item.image }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        )}

        {/* Gradiente top → bottom */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {/* Gradiente lateral izquierdo */}
        <LinearGradient
          colors={['rgba(229,9,20,0.18)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.heroContent}>
          {/* Badge + Fecha */}
          <View style={styles.heroMeta}>
            <View style={[styles.badge, { backgroundColor: BADGE_COLORS[item.badge] }]}>
              <Text style={styles.badgeText}>{item.badge.toUpperCase()}</Text>
            </View>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.6)" />
              <Text style={styles.heroDate}>{formatDate(item.date)}</Text>
            </View>
          </View>

          {/* Título */}
          <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>

          {/* Descripción */}
          <Text style={styles.heroDesc} numberOfLines={2}>{item.description}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// NEWS CARD — Grid
// ─────────────────────────────────────────────
interface NewsCardProps {
  item: NewsItem;
  onPress: () => void;
}

export function NewsCard({ item, onPress }: NewsCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const isWeb = Platform.OS === 'web';
  const [imageError, setImageError] = useState(false);

  const [isHovered, setIsHovered] = useState(false);

  const onIn = () =>
    Animated.spring(scale, { toValue: 1.02, useNativeDriver: false, friction: 6 }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }).start();

  return (
    <View style={[styles.cardWrapper, isWeb ? ({ cursor: 'pointer' } as any) : null]}>
      <Pressable
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
      >
        <Animated.View style={[styles.card, { transform: [{ scale }] }, isHovered && styles.cardHovered]}>
        {/* Imagen */}
        <View style={styles.cardImageBox}>
          {!item.image || imageError ? (
            <PremiumImageFallback label="NEWS" category={item.badge} />
          ) : (
            <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" onError={() => setImageError(true)} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          {/* Badge sobre imagen */}
          <View style={[styles.badge, styles.cardBadge, { backgroundColor: BADGE_COLORS[item.badge] || '#E50914' }]}>
            <Text style={styles.badgeText}>{item.badge.toUpperCase()}</Text>
          </View>
          
          {/* Pequeño cuadrado rojo superior derecho */}
          <View style={styles.topRightSquare} />
        </View>

        {/* Contenido */}
        <View style={styles.cardBody}>
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.45)" />
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
          </View>
          <Text style={[styles.cardTitle, isHovered && styles.cardTitleHovered]} numberOfLines={2}>{item.title}</Text>
          {isHovered ? (
            <Text style={styles.readMoreText}>LEER MÁS {'>'}</Text>
          ) : (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  </View>
  );
}

// ─────────────────────────────────────────────
// TRENDING ITEM — Ranking
// ─────────────────────────────────────────────
interface TrendingItemProps {
  rank: number;
  title: string;
  description: string;
}

export function TrendingItem({ rank, title, description }: TrendingItemProps) {
  const isTop = rank === 1;
  const rankStr = `#${rank}`;

  return (
    <View style={[styles.trendingCard, isTop && styles.trendingCardTop]}>
      {/* Número */}
      <Text style={[styles.trendingRank, isTop && styles.trendingRankTop]}>{rankStr}</Text>

      {/* Separador vertical */}
      <View style={[styles.trendingDivider, isTop && { backgroundColor: '#E50914' }]} />

      {/* Info */}
      <View style={styles.trendingInfo}>
        <Text style={styles.trendingTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.trendingDesc} numberOfLines={1}>{description}</Text>
      </View>

      {isTop && <Ionicons name="flame" size={18} color="#E50914" style={{ marginLeft: 'auto' as any }} />}
    </View>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  /* HERO */
  heroWrapper: {
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 0,
    overflow: 'hidden',
  },
  heroCard: {
    height: 340,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroDate: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  heroDesc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
  },

  /* BADGE */
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* NEWS CARD */
  cardWrapper: {
    flex: 1,
  },
  card: {
    borderRadius: 0,
    backgroundColor: '#000000',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardHovered: {
    borderColor: '#E50914',
  },
  cardImageBox: {
    height: 160,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
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
  cardBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  topRightSquare: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    backgroundColor: '#E50914',
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  cardDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  cardTitleHovered: {
    color: '#E50914',
  },
  cardDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
  readMoreText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1.2,
  },

  /* TRENDING */
  trendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
  },
  trendingCardTop: {
    borderColor: 'rgba(229, 9, 20, 0.35)',
    backgroundColor: '#1a0a0a',
  },
  trendingRank: {
    fontSize: 22,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.18)',
    width: 44,
  },
  trendingRankTop: {
    color: '#E50914',
  },
  trendingDivider: {
    width: 2,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 14,
    borderRadius: 1,
  },
  trendingInfo: {
    flex: 1,
  },
  trendingTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  trendingDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
});
