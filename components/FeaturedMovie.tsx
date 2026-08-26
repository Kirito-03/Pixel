import React, { useState } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MovieDetail, AnimeDetail } from '../types';
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
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const { currentProfile } = useProfile();
  const { isInMyList, toggleMyList, addToMyList } = useMyList();
  const [isToggling, setIsToggling] = useState(false);
  const [playHover, setPlayHover] = useState(false);
  const [infoHover, setInfoHover] = useState(false);

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
  const description = isAnime ? stripHtml((movie as any).description) : stripHtml((movie as any).overview);
  const imageUri = isAnime
    ? getAnimeImageUrl(
        isSmallScreen 
          ? (((movie as AnimeDetail).coverImage as any)?.extraLarge || (movie as AnimeDetail).coverImage?.large || (movie as AnimeDetail).bannerImage)
          : ((movie as AnimeDetail).bannerImage || (movie as AnimeDetail).coverImage?.large)
      )
    : getImageUrl(isSmallScreen ? (movie.poster_path || movie.backdrop_path) : movie.backdrop_path, 'original');

  const heroTopColors = theme === 'dark' 
    ? ['rgba(0,0,0,0.5)', 'transparent'] 
    : ['rgba(255,255,255,0.8)', 'transparent'];
    
  const heroBottomColors = theme === 'dark'
    ? ['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)', '#000']
    : ['transparent', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.8)', '#FFF'];
    
  const heroLeftColors = theme === 'dark'
    ? ['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.3)', 'transparent']
    : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.5)', 'transparent'];

  return (
    <View style={[styles.container, { width, height: isSmallScreen ? height * 0.55 : height * 0.9 }]}>
      <Image
        source={{ uri: imageUri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Top vignette para navbar */}
      <LinearGradient
        colors={heroTopColors as any}
        style={[StyleSheet.absoluteFillObject, { height: '30%' }]}
        pointerEvents="none"
      />

      {/* Bottom gradient — cinematográfico */}
      <LinearGradient
        colors={heroBottomColors as any}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Left gradient — para texto legible */}
      {!isSmallScreen && (
        <LinearGradient
          colors={heroLeftColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.4, 0.8]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}

      {/* Contenido del Hero */}
      <View style={[styles.content, {
        paddingLeft: isSmallScreen ? 20 : 50,
        paddingRight: isSmallScreen ? 20 : 50,
        paddingBottom: isSmallScreen ? 50 : 80,
        maxWidth: isSmallScreen ? '100%' : '55%',
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
            { color: colors.text },
            isWeb ? { textShadow: theme === 'dark' ? '0px 4px 20px rgba(0,0,0,0.8)' : '0px 4px 20px rgba(255,255,255,0.8)' } as any : null,
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {/* Meta info: rating, año, géneros */}
        <View style={styles.metaRow}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={13} color="#E50914" />
            <Text style={[styles.ratingText, { color: colors.text }]}>{voteAverage}</Text>
          </View>
          <Text style={[styles.metaDot, { color: colors.textMuted }]}>•</Text>
          <Text style={[styles.metaText, { color: colors.text }]}>{releaseYear}</Text>
          {!isAnime && (movie as MovieDetail).runtime && (
            <>
              <Text style={[styles.metaDot, { color: colors.textMuted }]}>•</Text>
              <Text style={[styles.metaText, { color: colors.text }]}>{(movie as MovieDetail).runtime} min</Text>
            </>
          )}
        </View>

        {/* Géneros como pills */}
        {genres.length > 0 && (
          <View style={styles.genreRow}>
            {genres.slice(0, 4).map((genre, idx) => (
              <View key={idx} style={[styles.genrePill, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
                <Text style={[styles.genrePillText, { color: colors.text }]}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Descripción corta */}
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={isSmallScreen ? 3 : 4}>
          {description || 'Sin descripción disponible.'}
        </Text>

        {/* Botones */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[
              styles.playButton,
              { backgroundColor: theme === 'dark' ? '#FFFFFF' : '#000000' },
              isWeb && playHover && {
                backgroundColor: theme === 'dark' ? '#E50914' : '#E50914',
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
            <Ionicons name="play" size={18} color={isWeb && playHover ? '#fff' : (theme === 'dark' ? '#000' : '#fff')} />
            <Text style={[
              styles.playButtonText,
              { color: theme === 'dark' ? '#000' : '#fff' },
              isWeb && playHover && { color: '#fff' },
            ]}>
              Reproducir
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.infoButton,
              { borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' },
              isWeb && infoHover && {
                backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                borderColor: theme === 'dark' ? '#fff' : '#000',
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
            <Ionicons name="information-circle-outline" size={18} color={theme === 'dark' ? '#fff' : '#000'} />
            <Text style={[styles.infoButtonText, { color: theme === 'dark' ? '#fff' : '#000' }]}>Más información</Text>
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
    flexWrap: 'wrap',
    gap: 12,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 30,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 13,
    paddingHorizontal: 26,
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

