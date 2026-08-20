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

  // Popup dimensions — más ancho como Netflix (aprox 2.2x)
  const POPUP_WIDTH = CARD_WIDTH * 2.2;
  const POPUP_IMG_HEIGHT = CARD_HEIGHT * 0.75;

  // Hover con delay de 1.5 segundos
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(true), 1500);
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
      if ((movie as any).source === 'anilist') return (movie as any).poster_path || (movie as any).coverImage?.extraLarge || (movie as any).coverImage?.large;
      return getImageUrl((movie as any).poster_path, 'w500');
    }
    return getImageUrl((movie as any).poster_path, 'w500');
  };

  const getTitle = (): string => {
    if ('title' in movie && typeof (movie as any).title === 'string') return (movie as any).title;
    if ('name' in movie && typeof (movie as any).name === 'string') return (movie as any).name;
    return '';
  };

  const getEpisodesCount = (): string => {
    const eps = (movie as any).episodes;
    if (eps) return `${eps} episodios`;
    const format = (movie as any).format;
    if (format === 'MOVIE') return 'Película';
    return '';
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
          position: 'relative', // Importante para que el zIndex funcione y no se esconda
          zIndex: hovered ? 9999 : 1,
          elevation: hovered ? 9999 : 1, // Para Android
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
            <Text style={styles.badgeText}>NUEVO EPISODIO</Text>
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
              // Empezar 60px arriba de la card para que quede centrado verticalmente
              top: -60,
            },
          ]}
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
            <LinearGradient
              colors={['transparent', 'rgba(20,20,20,0.85)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* El título superpuesto en la imagen (al no tener logo) */}
            <View style={styles.popupTitleOverlay}>
               <Text style={styles.popupTitleText} numberOfLines={2}>{getTitle()}</Text>
            </View>
          </View>

          {/* Info debajo de la imagen (estilo Netflix) */}
          <View style={styles.popupInfo}>
            
            {/* Fila de controles circulares */}
            <View style={styles.popupActionsRow}>
              <View style={styles.popupActionsLeft}>
                <TouchableOpacity style={styles.actionBtnPlay} onPress={onPress}>
                  <Ionicons name="play" size={20} color="#000" style={{ marginLeft: 3 }} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnRound}>
                  <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.actionBtnRound} onPress={onPress}>
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Fila de Meta: 13+ | 4 temporadas | HD */}
            <View style={styles.popupMetaNetflix}>
              <View style={styles.netflixBadgeBorder}>
                <Text style={styles.netflixBadgeText}>13+</Text>
              </View>
              <Text style={styles.netflixSeasonsText}>
                {getEpisodesCount() || (getYear() ? `Año ${getYear()}` : 'Anime')}
              </Text>
              <View style={styles.netflixBadgeBorder}>
                <Text style={styles.netflixBadgeText}>HD</Text>
              </View>
            </View>

            {/* Fila de Géneros: Imaginativo • Disparatado • Fantasía */}
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
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    backgroundColor: '#E50914',
    borderRadius: 0,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* ── POPUP FLOTANTE NETFLIX STYLE ── */
  popup: {
    position: 'absolute',
    backgroundColor: '#141414',
    borderRadius: 6,
    overflow: 'hidden' as any,
    // Sombra profunda para que se vea por encima
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.9,
    shadowRadius: 30,
    elevation: 30,
    zIndex: 9999,
  } as any,
  popupTitleOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
  },
  popupTitleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  popupInfo: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  
  // Controles
  popupActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popupActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnPlay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnRound: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(42,42,42,0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Metadata
  popupMetaNetflix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  netflixBadgeBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  netflixBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  netflixSeasonsText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  // Géneros
  popupGenreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  popupGenreDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  popupGenre: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '400',
  },
});
