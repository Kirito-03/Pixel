import { briefSynopsis, cleanSynopsisText } from '../utils/briefSynopsis';
import React, { useState } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MovieDetail, AnimeDetail } from '../types';
import AnimeArtwork from './AnimeArtwork';
import { getImageUrl } from '../services/api';
import { getAnimeImageUrl, getAnimeTitle, getAnimeYear, getAnimeScore } from '../services/anilistService';
import { colors as staticColors, spacing, typography, gradients, badgeStyles } from '../theme';
import { useProfile } from '../contexts/ProfileContext';
import { useMyList } from '../contexts/MyListContext';
import { useTheme } from '../contexts/ThemeContext';

const stripHtml = (html?: string) => html ? html.replace(/<[^>]*>/g, '') : '';

interface Props {
  movie: MovieDetail | AnimeDetail;
  onWatch: () => void;
  onMoreInfo?: () => void;
  onAddList?: () => void;
}

export default function FeaturedMovie({ movie, onWatch, onMoreInfo, onAddList }: Props) {
  const { theme, colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(width);
  const isSmallScreen = layoutWidth < 768;
  const isWeb = Platform.OS === 'web';
  const androidCompact = Platform.OS === 'android' && isSmallScreen;
  const { currentProfile } = useProfile();
  const { isInMyList, toggleMyList, addToMyList } = useMyList();
  const [isToggling, setIsToggling] = useState(false);
  const [playHover, setPlayHover] = useState(false);
  const [infoHover, setInfoHover] = useState(false);
  const [artRatio, setArtRatio] = useState<number | null>(null);

  const isAnime = !('release_date' in movie);
  const releaseYear = isAnime ? getAnimeYear((movie as AnimeDetail).startDate) : (movie.release_date ? new Date(movie.release_date).getFullYear() : '');
  const genres = isAnime ? ((movie as AnimeDetail).genres || []) : (movie.genres ? movie.genres.map(g => g.name) : []);
  const voteAverage = isAnime ? getAnimeScore((movie as AnimeDetail).averageScore).toFixed(1) : (movie.vote_average ? movie.vote_average.toFixed(1) : '0');
  const inMyList = isInMyList(movie.id, isAnime ? 'anime' : 'movie');

  // Determinar status del anime para badge
  const animeStatus = isAnime ? (movie as any).status : '';
  const getStatusBadge = () => {
    if (!animeStatus) return null;
    const statusLower = animeStatus.toLowerCase();
    if (statusLower.includes('releasing') || statusLower.includes('airing') || statusLower === 'emisión') {
      return badgeStyles.airing;
    }
    if (statusLower.includes('finished') || statusLower.includes('completed') || statusLower === 'finalizado') {
      return badgeStyles.finished;
    }
    if (statusLower.includes('upcoming') || statusLower.includes('not_yet') || statusLower === 'próximo') {
      return badgeStyles.upcoming;
    }
    return null;
  };
  const statusBadge = getStatusBadge();

  const handleMyListPress = async () => {
    // Si el padre provee un handler específico, usarlo (para compatibilidad)
    if (onAddList) {
      return onAddList();
    }
    if (!currentProfile) {
      Alert.alert('Perfil requerido', 'Selecciona un perfil para usar Mi Lista.');
      return;
    }
    if (isToggling) return;
    setIsToggling(true);
    try {
      await toggleMyList(movie.id, isAnime ? 'anime' : 'movie');
    } catch (err) {
      console.error('FeaturedMovie: Error al actualizar Mi Lista', err);
      Alert.alert('Error', 'No se pudo actualizar Mi Lista.');
    } finally {
      setIsToggling(false);
    }
  };

  const title = isAnime ? getAnimeTitle((movie as AnimeDetail).title) : movie.title;
  const description = cleanSynopsisText(isAnime ? (movie as any).description : (movie as any).overview);
  const posterUri = isAnime
    ? getAnimeImageUrl(((movie as AnimeDetail).coverImage as any)?.extraLarge || (movie as AnimeDetail).coverImage?.large || (movie as AnimeDetail).bannerImage || '')
    : getImageUrl(movie.poster_path || movie.backdrop_path, 'original');
  const bannerUri = isSmallScreen ? undefined : isAnime ? (movie as AnimeDetail).bannerImage || undefined : getImageUrl(movie.backdrop_path, 'original');
  const heroArtUri = bannerUri || posterUri;

  React.useEffect(() => {
    let active = true;
    setArtRatio(null);
    if (!heroArtUri) return;
    Image.getSize(
      heroArtUri,
      (w, h) => {
        if (active && w > 0 && h > 0) setArtRatio(w / h);
      },
      () => {}
    );
    return () => { active = false; };
  }, [heroArtUri]);

  const isLight = theme === 'light';
  // Keep the image cinematic without dark bottom bands in light mode.
  const heroTopColors = isLight
    ? ['rgba(255,255,255,0.52)', 'transparent']
    : ['rgba(0,0,0,0.42)', 'transparent'];
  const heroBottomColors = isLight
    ? ['transparent', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.52)', colors.background]
    : ['transparent', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0.68)', colors.background];
  const heroLeftColors = isLight
    ? ['rgba(255,255,255,0.84)', 'rgba(255,255,255,0.36)', 'transparent']
    : ['rgba(0,0,0,0.68)', 'rgba(0,0,0,0.22)', 'transparent'];

  const headerOffset = isSmallScreen ? 0 : (isWeb ? 72 : 64);
  const desktopAdaptedHeight = (() => {
    if (artRatio && artRatio >= 2.6) {
      // Very wide banners (e.g. 1900x400): keep hero crisp without heavy vertical blur or excessive crop
      return Math.min(560, Math.max(440, Math.round(height * 0.64)));
    }
    if (artRatio && artRatio >= 1.15) {
      // Medium-wide banners (~1920x800 or 16:9): adapt height to image proportion
      const proportional = Math.round(layoutWidth / Math.max(1.75, artRatio)) + Math.round(headerOffset * 0.6);
      return Math.min(760, Math.max(540, Math.min(proportional, Math.round(height * 0.82))));
    }
    return Math.min(740, Math.max(560, Math.round(height * 0.78)));
  })();

  const heroHeight = isSmallScreen
    ? Math.min(640, Math.max(480, Math.round(height * 0.72)))
    : desktopAdaptedHeight;

  return (
    <View onLayout={event => setLayoutWidth(event.nativeEvent.layout.width)} style={[styles.container, { width: Platform.OS === 'ios' ? width : '100%', height: heroHeight }]}>
      <AnimeArtwork cover preservePanorama alignTop banner={bannerUri} poster={posterUri} position={isSmallScreen ? undefined : "50% 0%"} />

      {/* Top vignette para navbar */}
      <LinearGradient
        colors={heroTopColors as any}
        style={[StyleSheet.absoluteFillObject, { top: 0, height: '24%' }]}
        pointerEvents="none"
      />

      {/* Bottom gradient — zona nítida más alta, transición corta al final */}
      <LinearGradient
        colors={heroBottomColors as any}
        locations={[0, 0.72, 0.91, 1]}
        style={[StyleSheet.absoluteFillObject, { top: 0 }]}
        pointerEvents="none"
      />

      {/* Left gradient — para texto legible */}
      {!isSmallScreen && (
        <LinearGradient
          colors={heroLeftColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.4, 0.8]}
          style={[StyleSheet.absoluteFillObject, { top: 0 }]}
          pointerEvents="none"
        />
      )}

      {/* Contenido del Hero */}
      <View style={[styles.content, {
        paddingLeft: isSmallScreen ? 20 : 56,
        paddingRight: isSmallScreen ? 20 : 56,
        paddingTop: isSmallScreen ? 0 : headerOffset + 16,
        paddingBottom: isSmallScreen ? 50 : 48,
        maxWidth: isSmallScreen ? '100%' : '62%',
      } as any]}>

        {/* Badge de estado */}
        {statusBadge && (
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.backgroundColor }]}>
            <Text style={styles.statusBadgeText}>{statusBadge.label}</Text>
          </View>
        )}

        {/* Título */}
        <Text
          style={[
            isSmallScreen ? styles.titleMobile : styles.title,
            { color: isLight ? colors.text : '#fff' },
            !isLight && isWeb ? { textShadow: '0px 4px 20px rgba(0,0,0,0.65)' } as any : null,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {/* Meta info: rating, año, géneros */}
        <View style={styles.metaRow}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={13} color="#E50914" />
            <Text style={[styles.ratingText, { color: isLight ? colors.text : '#fff' }]}>{voteAverage}</Text>
          </View>
          <Text style={[styles.metaDot, { color: isLight ? colors.textMuted : 'rgba(255,255,255,0.65)' }]}>•</Text>
          <Text style={[styles.metaText, { color: isLight ? colors.text : '#fff' }]}>{releaseYear}</Text>
          {!isAnime && (movie as MovieDetail).runtime && (
            <>
              <Text style={[styles.metaDot, { color: isLight ? colors.textMuted : 'rgba(255,255,255,0.65)' }]}>•</Text>
              <Text style={[styles.metaText, { color: isLight ? colors.text : '#fff' }]}>{(movie as MovieDetail).runtime} min</Text>
            </>
          )}
        </View>

        {/* Géneros como pills */}
        {genres.length > 0 && (
          <View style={styles.genreRow}>
            {genres.slice(0, 4).map((genre, idx) => (
              <View key={idx} style={[styles.genrePill, { backgroundColor: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.1)' }]}>
                <Text style={[styles.genrePillText, { color: isLight ? colors.text : '#fff' }]}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Descripción corta */}
        <Text style={[styles.description, { color: isLight ? colors.textSecondary : 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>
          {briefSynopsis(description) || 'Sin descripción disponible.'}
        </Text>

        {/* Botones */}
        <View style={[styles.buttonsRow, androidCompact && { gap: 10 }]}>
          <TouchableOpacity
            style={[
              styles.playButton,
              androidCompact && { flexBasis: 0, minWidth: 0, minHeight: 50, paddingHorizontal: 8 },
              !isSmallScreen && { flex: 0, flexBasis: 'auto', flexShrink: 0, paddingHorizontal: 24, minWidth: 170 },
              { backgroundColor: isLight ? '#111111' : '#FFFFFF' },
              isWeb && playHover && {
                backgroundColor: '#E50914',
                transform: [{ scale: 1.04 }],
              } as any,
            ]}
            onPress={onWatch}
            activeOpacity={0.85}
            {...(isWeb ? {
              onMouseEnter: () => setPlayHover(true),
              onMouseLeave: () => setPlayHover(false),
            } : {})}
          >
            <Ionicons name="play" size={18} color={isWeb && playHover ? '#fff' : (isLight ? '#fff' : '#000')} />
            <Text 
              numberOfLines={1}
              style={[
              styles.playButtonText,
              androidCompact && { flexShrink: 1, fontSize: 12, letterSpacing: 0 },
              { color: isLight ? '#fff' : '#000' },
              isWeb && playHover && { color: '#fff' },
            ]}>
              Reproducir
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.infoButton,
              androidCompact && { flexBasis: 0, minWidth: 0, minHeight: 50, paddingHorizontal: 8 },
              !isSmallScreen && { flex: 0, flexBasis: 'auto', flexShrink: 0, paddingHorizontal: 24, minWidth: 210 },
              {
                borderColor: isLight ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.7)',
                backgroundColor: isLight ? 'rgba(255,255,255,0.65)' : undefined,
              },
              isWeb && infoHover && {
                backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
                borderColor: isLight ? '#111111' : '#fff',
                transform: [{ scale: 1.04 }],
              } as any,
            ]}
            onPress={onMoreInfo}
            activeOpacity={0.75}
            {...(isWeb ? {
              onMouseEnter: () => setInfoHover(true),
              onMouseLeave: () => setInfoHover(false),
            } : {})}
          >
            <Ionicons name="information-circle-outline" size={18} color={isLight ? colors.text : '#fff'} />
            <Text numberOfLines={1} style={[styles.infoButtonText, androidCompact && { flexShrink: 1, fontSize: 12, letterSpacing: 0 }, { color: isLight ? colors.text : '#fff' }]}>
              {androidCompact ? 'Más info' : 'Más información'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'flex-end',
  },
  content: {
    zIndex: 2,
    width: '100%',
    minWidth: 0,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 0,
    marginBottom: 14,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.heroTitle,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  titleMobile: {
    ...typography.heroTitleMobile,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: '700',
  },
  metaDot: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  metaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  genrePill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  genrePillText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  playButton: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 0,
    gap: 8,
  },
  playButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoButton: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    gap: 8,
  },
  infoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

