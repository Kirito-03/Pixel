import React, { useRef, useState, useCallback } from 'react';
import {
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  Text,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Movie, TVShow, ContentItem } from '../types';
import { getImageUrl } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { colors, badgeStyles } from '../theme';

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

  // Popup dimensions — 1.75x más grande que la card
  const POPUP_WIDTH = CARD_WIDTH * 1.75;
  const POPUP_IMG_HEIGHT = CARD_HEIGHT * 0.65;

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
      if ((movie as any).source === 'anilist') return (movie as any).poster_path;
      return getImageUrl((movie as any).poster_path, 'w500');
    }
    return getImageUrl((movie as any).poster_path, 'w500');
  };

  const getTitle = (): string => {
    if ('title' in movie && typeof (movie as any).title === 'string') return (movie as any).title;
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
    return d.replace(/<[^>]*>/g, '').slice(0, 120);
  };

  const isAiring = (): boolean => {
    if (!('status' in movie) || !(movie as any).status) return false;
    const status = ((movie as any).status || '').toLowerCase();
    return status.includes('airing') || status.includes('releasing') || status === 'emisión';
  };

  const webHoverProps = isWeb ? {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  } : {};

  return (
    <View
      style={[
        {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          marginRight: isSmallScreen ? 10 : 12,
          // overflow visible para que el popup salga fuera
          zIndex: hovered ? 999 : 1,
        },
        isWeb ? { overflow: 'visible' } as any : null,
      ]}
      {...webHoverProps}
    >
      {/* Card base */}
      <TouchableOpacity
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 0,
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
        }}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: getImageSource() }}
          style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          resizeMode="cover"
        />

        {/* Badge EN EMISIÓN — solo para animes en emisión */}
        {isAiring() && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>EN EMISIÓN</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Popup flotante (fuera de la card) ── */}
      {isWeb && hovered && (
        <View
          style={[
            styles.popup,
            {
              width: POPUP_WIDTH,
              // Centrar popup horizontalmente sobre la card
              left: -(POPUP_WIDTH - CARD_WIDTH) / 2,
              // Situar popup encima de la card
              bottom: CARD_HEIGHT + 8,
            },
          ]}
          // Mantener el hover activo cuando el mouse está en el popup
          {...(isWeb ? {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
          } : {})}
        >
          {/* Imagen del anime en grande */}
          <View style={{ width: '100%', height: POPUP_IMG_HEIGHT, overflow: 'hidden' as any }}>
            <Image
              source={{ uri: getImageSource() }}
              style={{ width: '100%', height: '100%' } as any}
              resizeMode="cover"
            />
            {/* Gradient sobre la imagen */}
            <LinearGradient
              colors={['transparent', 'rgba(20,20,20,0.7)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Badge EN EMISIÓN dentro del popup */}
            {isAiring() && (
              <View style={styles.popupBadge}>
                <Text style={styles.popupBadgeText}>EN EMISIÓN</Text>
              </View>
            )}
          </View>

          {/* Info debajo de la imagen */}
          <View style={styles.popupInfo}>
            {/* Título */}
            <Text style={styles.popupTitle} numberOfLines={2}>{getTitle()}</Text>

            {/* Rating + Año */}
            <View style={styles.popupMeta}>
              {getRating() ? (
                <View style={styles.popupRatingRow}>
                  <Ionicons name="star" size={12} color="#E50914" />
                  <Text style={styles.popupRating}>{getRating()}</Text>
                </View>
              ) : null}
              {getYear() ? <Text style={styles.popupYear}>{getYear()}</Text> : null}
            </View>

            {/* Géneros separados por puntos */}
            {getGenres().length > 0 && (
              <View style={styles.popupGenreRow}>
                {getGenres().map((g, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <Text style={styles.popupGenreDot}>•</Text>}
                    <Text style={styles.popupGenre}>{g}</Text>
                  </React.Fragment>
                ))}
              </View>
            )}

            {/* Descripción */}
            {getDescription() ? (
              <Text style={styles.popupDesc} numberOfLines={3}>{getDescription()}</Text>
            ) : null}

            {/* Botón VER */}
            <TouchableOpacity style={styles.popupPlayBtn} onPress={onPress}>
              <Ionicons name="play" size={16} color="#000" />
              <Text style={styles.popupPlayText}>REPRODUCIR</Text>
            </TouchableOpacity>
          </View>

          {/* Flecha apuntando hacia abajo */}
          <View style={styles.popupArrow} />
        </View>
      )}
    </View>
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

  /* ── POPUP FLOTANTE ── */
  popup: {
    position: 'absolute',
    backgroundColor: '#141414',
    borderRadius: 4,
    overflow: 'hidden' as any,
    // Sombra profunda
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 30,
    zIndex: 9999,
  } as any,
  popupBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#C0392B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
  },
  popupBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  popupInfo: {
    padding: 14,
    gap: 8,
  },
  popupTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
    marginBottom: 2,
  },
  popupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  popupRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  popupRating: {
    color: '#E50914',
    fontSize: 13,
    fontWeight: '700',
  },
  popupYear: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  popupGenreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  popupGenreDot: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  popupGenre: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  popupDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
  popupPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 0,
    marginTop: 4,
  },
  popupPlayText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Triangulito indicador debajo del popup
  popupArrow: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#141414',
  },
});
