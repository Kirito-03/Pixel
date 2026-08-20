import React, { useRef, useState, useCallback } from 'react';
import {
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  Animated,
  View,
  Text,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Movie, TVShow, ContentItem } from '../types';
import { getImageUrl } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { shadows, colors, badgeStyles } from '../theme';

interface Props {
  movie: Movie | TVShow | ContentItem;
  onPress: () => void;
}

export default function MovieCard({ movie, onPress }: Props) {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const CARD_WIDTH = isSmallScreen ? width * 0.34 : 155;
  const CARD_HEIGHT = CARD_WIDTH * 1.5;

  // Hover con delay de 2 segundos
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(true), 2000);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHovered(false);
  }, []);

  const getImageSource = () => {
    if ('source' in movie) {
      if (movie.source === 'anilist') return movie.poster_path;
      return getImageUrl(movie.poster_path, 'w500');
    }
    return getImageUrl(movie.poster_path, 'w500');
  };

  const getTitle = (): string => {
    if ('title' in movie && typeof movie.title === 'string') return movie.title;
    if ('name' in movie && typeof (movie as any).name === 'string') return (movie as any).name;
    return '';
  };

  const getRating = (): string => {
    const v = (movie as any).vote_average;
    return typeof v === 'number' && v > 0 ? v.toFixed(1) : '';
  };

  const getYear = (): string => {
    const d = (movie as any).release_date || (movie as any).first_air_date || '';
    if (!d) return '';
    const y = new Date(d).getFullYear();
    return isNaN(y) ? '' : String(y);
  };

  const getGenres = (): string[] => {
    const g = (movie as any).genres;
    if (!g) return [];
    if (Array.isArray(g)) {
      return g.slice(0, 3).map((genre: any) =>
        typeof genre === 'string' ? genre : genre.name || ''
      ).filter(Boolean);
    }
    return [];
  };

  const getDescription = (): string => {
    const d = (movie as any).description || (movie as any).overview || '';
    return d.replace(/<[^>]*>/g, '').slice(0, 100);
  };

  const isAiring = (): boolean => {
    if (!('status' in movie) || !(movie as any).status) return false;
    const status = ((movie as any).status || '').toLowerCase();
    return status.includes('airing') || status.includes('releasing') || status === 'emisión';
  };

  // Scale animation (press)
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 1.03, useNativeDriver: false, friction: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false, friction: 4 }).start();
  };

  const webHoverProps = isWeb ? {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  } : {};

  return (
    <Animated.View
      style={[
        {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          marginRight: isSmallScreen ? 10 : 12,
          borderRadius: 0,
          transform: [{ scale: hovered ? 1.06 : 1 }],
          zIndex: hovered ? 20 : 1,
        },
        isWeb ? {
          cursor: 'pointer',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          boxShadow: hovered ? '0 8px 30px rgba(0,0,0,0.7)' : 'none',
        } as any : null,
      ]}
      {...webHoverProps}
    >
      <TouchableOpacity
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 0,
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
        }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: getImageSource() }}
          style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          resizeMode="cover"
        />

        {/* Badge EN EMISIÓN — solo para animes en emisión */}
        {isAiring() && !hovered && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>EN EMISIÓN</Text>
          </View>
        )}

        {/* Hover overlay con info — aparece tras 2 segundos */}
        {isWeb && hovered && (
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.97)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.hoverContent}>
              {/* Badge en emisión dentro del hover */}
              {isAiring() && (
                <View style={styles.hoverAiringBadge}>
                  <Text style={styles.hoverAiringText}>EN EMISIÓN</Text>
                </View>
              )}

              {/* Título */}
              <Text style={styles.hoverTitle} numberOfLines={2}>{getTitle()}</Text>

              {/* Rating + año */}
              <View style={styles.hoverMeta}>
                {getRating() ? (
                  <View style={styles.hoverRatingRow}>
                    <Ionicons name="star" size={10} color="#E50914" />
                    <Text style={styles.hoverRating}>{getRating()}</Text>
                  </View>
                ) : null}
                {getYear() ? <Text style={styles.hoverYear}>{getYear()}</Text> : null}
              </View>

              {/* Géneros */}
              {getGenres().length > 0 && (
                <View style={styles.hoverGenreRow}>
                  {getGenres().map((g, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <Text style={styles.hoverGenreDot}>•</Text>}
                      <Text style={styles.hoverGenre}>{g}</Text>
                    </React.Fragment>
                  ))}
                </View>
              )}

              {/* Descripción corta */}
              {getDescription() ? (
                <Text style={styles.hoverDesc} numberOfLines={2}>{getDescription()}</Text>
              ) : null}

              {/* Botón Ver */}
              <TouchableOpacity style={styles.hoverPlayBtn} onPress={onPress}>
                <Ionicons name="play" size={12} color="#000" />
                <Text style={styles.hoverPlayText}>VER</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: '#C0392B',
    borderRadius: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* ── HOVER STYLES ── */
  hoverContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    gap: 5,
  },
  hoverAiringBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#C0392B',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 0,
    marginBottom: 2,
  },
  hoverAiringText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hoverTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  hoverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hoverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hoverRating: {
    color: '#E50914',
    fontSize: 11,
    fontWeight: '700',
  },
  hoverYear: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
  },
  hoverGenreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  hoverGenreDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
  hoverGenre: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '500',
  },
  hoverDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    lineHeight: 13,
  },
  hoverPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 0,
    marginTop: 4,
  },
  hoverPlayText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
