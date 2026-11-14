import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  Text,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Movie, TVShow, ContentItem } from '../types';
import { getImageUrl } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { colors, badgeStyles } from '../theme';
import HoverLayer from './HoverLayer';
import TrailerPreview from './TrailerPreview';
import { catalogService } from '../services/catalogService';
import { useMyList } from '../contexts/MyListContext';
import { useProfile } from '../contexts/ProfileContext';
import { Alert } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  movie: Movie | TVShow | ContentItem;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  onHoverChange?: (isHovered: boolean) => void;
  cardWidth?: number;
}

export default function MovieCard({ movie, onPress, isFirst = false, isLast = false, onHoverChange, cardWidth }: Props) {
  const { colors, theme } = useTheme();
  const { isInMyList, toggleMyList, isUpdatingMyList, loading: listLoading } = useMyList();
  const { currentProfile } = useProfile();
  const [localSaving, setSaving] = useState(false);
  const listType = ('source' in movie && movie.source === 'anilist') ? 'anime' : ('type' in movie ? movie.type : 'movie') as 'movie' | 'tv' | 'anime';
  const saved = isInMyList(movie.id, listType);
  const saving = localSaving || listLoading || isUpdatingMyList(movie.id, listType);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewClosed, setPreviewClosed] = useState(false);
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const CARD_WIDTH = cardWidth || (isSmallScreen ? width * 0.31 : 155);
  const CARD_HEIGHT = CARD_WIDTH * 1.5;

  // Popup dimensions — más ancho como Netflix (aprox 2.2x)
  const POPUP_WIDTH = CARD_WIDTH * 2.2;
  const POPUP_IMG_HEIGHT = Math.max(200, CARD_HEIGHT * 0.75);

  // Open after 500ms; background cards must not preview over an open dialog.
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<View>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [retryKey, setRetryKey] = useState(0);
  const imageRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleImageError = () => {
    // Avoid repeatedly downloading broken posters or duplicating retries for the popup.
    if (retryKey < 2 && !imageRetryTimer.current) {
      imageRetryTimer.current = setTimeout(() => {
        imageRetryTimer.current = null;
        setRetryKey(prev => prev + 1);
      }, 2000);
    }
  };

  const handleMouseEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (!isWeb || isSmallScreen || hovered) return;
    hoverTimer.current = setTimeout(() => {
      if (typeof document !== 'undefined') {
        const element = cardRef.current as unknown as HTMLElement | null;
        const dialog = document.querySelector('[aria-modal="true"]');
        if (element?.closest('[aria-hidden="true"]') || (dialog && element && !dialog.contains(element))) return;
      }
      cardRef.current?.measureInWindow((x, y) => {
        const popupHeight = POPUP_IMG_HEIGHT + 160;
        setAnchor({
          left: Math.max(56, Math.min(x - (POPUP_WIDTH - CARD_WIDTH) / 2, width - POPUP_WIDTH - 56)),
          top: Math.max(8, Math.min(y - 60, (typeof window !== 'undefined' ? window.innerHeight : y + popupHeight) - popupHeight - 8)),
        });
        setHovered(true);
        onHoverChange?.(true);
      });
    }, 500);
  }, [isWeb, isSmallScreen, hovered, width, CARD_WIDTH, POPUP_WIDTH, POPUP_IMG_HEIGHT, onHoverChange]);

  const closeHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(false);
    onHoverChange?.(false);
  }, [onHoverChange]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(closeHover, 120);
  }, [closeHover]);

  useEffect(() => () => {
    if (imageRetryTimer.current) clearTimeout(imageRetryTimer.current);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!isWeb || !hovered || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeHover(); };
    window.addEventListener('scroll', closeHover, true);
    window.addEventListener('resize', closeHover);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pixel:close-previews', closeHover);
    return () => {
      window.removeEventListener('scroll', closeHover, true);
      window.removeEventListener('resize', closeHover);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pixel:close-previews', closeHover);
    };
  }, [isWeb, hovered, closeHover]);

  useEffect(() => {
    setPreviewId(null);
    setPreviewClosed(false);
    if (!hovered || listType !== 'anime') return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const hasTrailerMetadata = 'trailer_checked_at' in movie && movie.trailer_checked_at;
        const detail = hasTrailerMetadata ? movie as ContentItem : await catalogService.getAnimeById(movie.id);
        if (active && detail.trailer_site?.toLowerCase() === 'youtube' && detail.trailer_id && /^[A-Za-z0-9_-]{11}$/.test(detail.trailer_id)) setPreviewId(detail.trailer_id);
      } catch { /* Poster remains if trailer metadata is unavailable. */ }
    }, 4500); // Card opens after 500ms: trailer starts at >=5s total hover.
    return () => { active = false; clearTimeout(timer); };
  }, [hovered, movie.id, listType]);

  const saveToList = async () => {
    if (!currentProfile) { Alert.alert('Perfil requerido', 'Selecciona un perfil para guardar títulos.'); return; }
    if (saving) return;
    setSaving(true);
    try { await toggleMyList(movie.id, listType); }
    catch { Alert.alert('No se pudo guardar', 'Comprueba la conexión y los permisos de tu perfil.'); }
    finally { setSaving(false); }
  };

  const getImageSource = () => {
    let url = '';
    if ('source' in movie) {
      if ((movie as any).source === 'anilist') {
        url = (movie as any).poster_path || (movie as any).coverImage?.extraLarge || (movie as any).coverImage?.large || '';
      } else {
        url = getImageUrl((movie as any).poster_path, 'w500');
      }
    } else {
      url = getImageUrl((movie as any).poster_path, 'w500');
    }

    if (url && retryKey > 0) {
      return `${url}${url.includes('?') ? '&' : '?'}retry=${retryKey}`;
    }
    return url;
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
      ref={cardRef}
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
          backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f0f0f0',
        }}
        accessibilityRole="button"
        accessibilityLabel={`Ver ${getTitle()}`}
        onPress={() => { closeHover(); onPress(); }}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: getImageSource() }}
          style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          resizeMode="cover"
          onError={handleImageError}
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
        <HoverLayer><View
          style={[
            styles.popup,
            {
              width: POPUP_WIDTH,
              position: 'fixed' as any,
              left: anchor.left,
              top: anchor.top,
              backgroundColor: theme === 'dark' ? '#141414' : '#ffffff',
            },
          ]}
          {...(isWeb ? {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
          } : {})}
        >
          {/* Imagen del anime en grande */}
          <View style={{ width: '100%', height: POPUP_IMG_HEIGHT, overflow: 'hidden' as any }}>
            {previewId && !previewClosed ? <TrailerPreview id={previewId} /> : <><Image
              source={{ uri: getImageSource() }}
              style={{ width: '100%', height: '100%' } as any}
              resizeMode="cover"
              onError={handleImageError}
            />
            <LinearGradient
              colors={['transparent', theme === 'dark' ? 'rgba(20,20,20,0.85)' : 'rgba(255,255,255,0.85)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* El título superpuesto en la imagen (al no tener logo) */}
            <View style={styles.popupTitleOverlay}>
               <Text style={[styles.popupTitleText, { color: theme === 'dark' ? '#fff' : '#000', textShadowColor: theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>{getTitle()}</Text>
            </View>
          </>}</View>
          {previewId && !previewClosed && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar vista previa" onPress={() => setPreviewClosed(true)} style={{ padding: 8 }}><Text style={{ color: colors.text }}>Cerrar tráiler</Text></TouchableOpacity>}

          {/* Info debajo de la imagen (estilo Netflix) */}
          <View style={styles.popupInfo}>

            {/* Fila de controles circulares */}
            <View style={styles.popupActionsRow}>
              <View style={styles.popupActionsLeft}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ver capítulos de ${getTitle()}`} style={[styles.actionBtnPlay, { backgroundColor: theme === 'dark' ? '#fff' : '#000' }]} onPress={() => { closeHover(); onPress(); }}>
                  <Ionicons name="play" size={20} color={theme === 'dark' ? '#000' : '#fff'} style={{ marginLeft: 3 }} />
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={saved ? "Quitar de Mi Lista" : "Añadir a Mi Lista"} accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={saveToList} style={[styles.actionBtnRound, { borderColor: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                  {saving ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name={saved ? "checkmark" : "add"} size={22} color={colors.text} />}
                </TouchableOpacity>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ver detalles de ${getTitle()}`} style={[styles.actionBtnRound, { borderColor: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]} onPress={() => { closeHover(); onPress(); }}>
                <Ionicons name="chevron-down" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Fila de Meta: 13+ | 4 temporadas | HD */}
            <View style={styles.popupMetaNetflix}>
              <View style={[styles.netflixBadgeBorder, { borderColor: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                <Text style={[styles.netflixBadgeText, { color: colors.text }]}>{listType === 'anime' ? 'Anime' : 'Título'}</Text>
              </View>
              <Text style={[styles.netflixSeasonsText, { color: colors.text }]}>
                {getEpisodesCount() || (getYear() ? `Año ${getYear()}` : 'Anime')}
              </Text>
              <View style={[styles.netflixBadgeBorder, { borderColor: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]}>
                <Text style={[styles.netflixBadgeText, { color: colors.text }]}>Info</Text>
              </View>
            </View>

            {/* Fila de Géneros: Imaginativo • Disparatado • Fantasía */}
            {getGenres().length > 0 && (
              <View style={styles.popupGenreRow}>
                {getGenres().map((g, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <Text style={[styles.popupGenreDot, { color: colors.textMuted || 'rgba(150,150,150,0.6)' }]}>•</Text>}
                    <Text style={[styles.popupGenre, { color: colors.text }]}>{g}</Text>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>
        </View></HoverLayer>
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
