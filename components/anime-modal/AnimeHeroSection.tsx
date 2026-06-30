import React from 'react';
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
import { WebView } from 'react-native-webview';
import { getImageUrl } from '../../services/api';
import { getAnimeImageUrl } from '../../services/anilistService';
import type { AnimeHeroSectionProps } from './types';

export default function AnimeHeroSection({ hook }: AnimeHeroSectionProps) {
  const {
    currentContent,
    detailData,
    trailerKey,
    loading,
    trailerDelay,
    trailerFinished,
    isSmallScreen,
    height,
    isTogglingMyList,
    currentInMyList,
    descSlideAnim,
    handleCloseTrailer,
    handleWatchNow,
    handleToggleList,
    handlePlayTrailer,
    openExternalTrailer,
    setTrailerDelay,
    setTrailerFinished,
    getTitle,
    getReleaseDate,
    isRealAnime,
    isAnimeMovie,
    cleanDescription,
  } = hook;

  return (
    <View style={[heroStyles.heroSection, { height: isSmallScreen ? height * 0.72 : height * 0.75 }]}>
      {/* Backdrop + gradiente cinematográfico */}
      {trailerDelay && trailerKey && !trailerFinished ? (
        <View style={styles.trailerBackground}>
          <TouchableOpacity style={styles.trailerCloseButton} onPress={handleCloseTrailer}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
            <Text style={styles.trailerCloseText}>Cerrar</Text>
          </TouchableOpacity>
          {Platform.OS === 'web' ? (
            <iframe
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&controls=0&modestbranding=1&loop=0&playlist=${trailerKey}&rel=0&showinfo=0&mute=1&playsinline=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onError={() => {
                setTrailerDelay(false);
                setTrailerFinished(true);
                openExternalTrailer(trailerKey);
              }}
              onLoad={() => {
                setTimeout(() => {
                  setTrailerDelay(false);
                  setTrailerFinished(true);
                }, 8000);
              }}
            />
          ) : (
            <WebView
              style={styles.trailerBackgroundVideo}
              source={{
                uri: `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&controls=0&modestbranding=1&loop=0&playlist=${trailerKey}&rel=0&showinfo=0&mute=1&playsinline=1`,
              }}
              allowsFullscreenVideo
              javaScriptEnabled
              domStorageEnabled
              mediaPlaybackRequiresUserAction={false}
              scalesPageToFit={true}
              onError={() => {
                setTrailerDelay(false);
                setTrailerFinished(true);
                openExternalTrailer(trailerKey);
              }}
              onLoadEnd={() => {
                setTimeout(() => {
                  setTrailerDelay(false);
                  setTrailerFinished(true);
                }, 120000);
              }}
            />
          )}
        </View>
      ) : (
        <>
          {/* Imagen backdrop — posición dinámica por contenido */}
          <Image
            source={{
              uri: currentContent?.backdrop_path
                ? (currentContent.type === 'anime'
                    ? getAnimeImageUrl(currentContent.backdrop_path)
                    : getImageUrl(currentContent.backdrop_path, 'original'))
                : (currentContent?.poster_path
                    ? (currentContent.type === 'anime'
                        ? getAnimeImageUrl(currentContent.poster_path)
                        : getImageUrl(currentContent.poster_path, 'w500'))
                    : '')
            }}
            style={[
              heroStyles.backdropImage,
              Platform.OS === 'web' && {
                // @ts-ignore
                objectPosition: (currentContent as any)?.banner_position ?? '52% 40%',
                transform: [{ scale: 1.05 }],
              },
              Platform.OS !== 'web' && {
                transform: [{ scale: 1.05 }, { translateY: 10 }],
              },
            ]}
            resizeMode="cover"
          />
          {/* Gradiente multi-stop — más agresivo en la mitad inferior para legibilidad */}
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.0)',
              'rgba(0,0,0,0.10)',
              'rgba(0,0,0,0.32)',
              'rgba(0,0,0,0.62)',
              'rgba(0,0,0,0.86)',
              'rgba(0,0,0,1.0)',
            ]}
            locations={[0, 0.18, 0.42, 0.62, 0.82, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}

      {/* Contenido sobre el backdrop */}
      {!trailerDelay && (
        <View style={heroStyles.heroContent}>
          {/* Rating + año + estado */}
          <View style={heroStyles.metaRow}>
            {currentContent?.vote_average != null && currentContent.vote_average > 0 && (
              <View style={heroStyles.ratingPill}>
                <Ionicons name="star" size={11} color="#FFD700" />
                <Text style={heroStyles.ratingText}>{currentContent.vote_average.toFixed(1)}</Text>
              </View>
            )}
            {getReleaseDate() && (
              <Text style={heroStyles.metaText}>{new Date(getReleaseDate()).getFullYear()}</Text>
            )}
            {detailData && 'status' in detailData && (
              <View style={[
                heroStyles.statusPill,
                (detailData as any).status === 'RELEASING' && { backgroundColor: 'rgba(229,9,20,0.8)' },
                (detailData as any).status === 'FINISHED' && { backgroundColor: 'rgba(0,200,83,0.7)' },
              ]}>
                <Text style={heroStyles.statusPillText}>
                  {(detailData as any).status === 'RELEASING' ? 'En emisión' :
                   (detailData as any).status === 'FINISHED' ? 'Completado' :
                   (detailData as any).status === 'NOT_YET_RELEASED' ? 'Próximamente' :
                   (detailData as any).status || ''}
                </Text>
              </View>
            )}
            {detailData && 'episodes' in detailData && isRealAnime() && (
              <Text style={heroStyles.metaText}>{(detailData as any).episodes} ep.</Text>
            )}
          </View>

          {/* Título */}
          <Text style={[heroStyles.title, { fontSize: isSmallScreen ? 24 : 34 }]} numberOfLines={2}>
            {String(getTitle())}
          </Text>

          {/* Géneros en chips */}
          {detailData?.genres && detailData.genres.length > 0 && (
            <View style={heroStyles.genreRow}>
              {detailData.genres.slice(0, 4).map((g: any, i: number) => (
                <View key={i} style={heroStyles.genreChip}>
                  <Text style={heroStyles.genreChipText}>{typeof g === 'string' ? g : g.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Descripción */}
          <Animated.View style={{ transform: [{ translateY: descSlideAnim }] }}>
            {currentContent?.type === 'anime' && (loading || !detailData) ? (
              <View style={styles.skeletonContainer}>
                <View style={styles.skeletonLine} />
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: '60%' }]} />
              </View>
            ) : (
              <Text style={heroStyles.overview} numberOfLines={3}>
                {cleanDescription(
                  currentContent?.type === 'anime' && detailData && 'description' in detailData
                    ? (detailData as any).description || currentContent?.overview || ''
                    : currentContent?.overview || ''
                )}
              </Text>
            )}
          </Animated.View>

          {/* Botones de acción */}
          {currentContent?.type === 'anime' && (isRealAnime() || isAnimeMovie()) && (
            <View style={heroStyles.actionRow}>
              <TouchableOpacity style={heroStyles.btnPlay} onPress={handleWatchNow}>
                <Ionicons name="play" size={18} color="#000" />
                <Text style={heroStyles.btnPlayText}>Reproducir</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[heroStyles.btnSecondary, isTogglingMyList && { opacity: 0.6 }]}
                onPress={handleToggleList}
                disabled={isTogglingMyList}
              >
                {isTogglingMyList
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={currentInMyList ? 'checkmark' : 'add'} size={18} color="#fff" />}
                <Text style={heroStyles.btnSecondaryText}>
                  {currentInMyList ? 'En mi lista' : 'Mi lista'}
                </Text>
              </TouchableOpacity>

              {trailerKey && (
                <TouchableOpacity style={heroStyles.btnIcon} onPress={handlePlayTrailer}>
                  <Ionicons name="play-circle-outline" size={22} color="#fff" />
                  <Text style={heroStyles.btnIconText}>Trailer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── LOCAL STYLES ────────────────────────────────────────────────
const styles = StyleSheet.create({
  trailerBackground: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  trailerBackgroundVideo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  trailerCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 2,
  },
  trailerCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  skeletonContainer: {
    marginTop: 0,
    marginBottom: 16,
    gap: 8,
  },
  skeletonLine: {
    height: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    width: '90%',
  },
});

const heroStyles = StyleSheet.create({
  heroSection: {
    height: 500,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#0a0a0a',
  },
  backdropImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingVertical: 72,
    justifyContent: 'center',
    transform: [{ translateY: 56 }],
    maxWidth: 740,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  ratingText: { color: '#FFD700', fontSize: 11, fontWeight: '800' },
  metaText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '500' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statusPillText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  title: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: -0.7,
    marginBottom: 18,
    lineHeight: 40,
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 18,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  genreChipText: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600' },
  overview: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 500,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  btnPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 6,
  },
  btnPlayText: { color: '#000', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(60,60,60,0.85)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  btnSecondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  btnIconText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
});
