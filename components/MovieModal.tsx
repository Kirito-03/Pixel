import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Animated,
  ActivityIndicator,
  ScrollView,
  Platform,
  FlatList,
  Alert,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { MovieDetail, Movie, TVShow, TVShowDetail, ContentItem } from '../types';
import { 
  getTrailerUrl, 
  getSimilarMovies, 
  getSimilarTVShows,
  getRecommendedMovies,
  getRecommendedTVShows,
  getMovieDetails,
  getTVShowDetails,
  getImageUrl,
  getMoviesByGenre,
  getTVShowsByGenre,
  getAllPopularContent,
  tmdbToContentItem
} from '../services/api';
import { colors, spacing } from '../theme';
import { useProfile } from '../contexts/ProfileContext';
import { useMyList } from '../contexts/MyListContext';
import AnimeSeriesModalWrapper from './AnimeSeriesModalWrapper';
import databaseService from '../services/databaseService';

interface MovieModalProps {
  content: ContentItem | null;
  visible: boolean;
  onClose: () => void;
  startFromEpisodeId?: number | null;
  startFromTimeSeconds?: number | null;
  movie?: MovieDetail | null;
  onAddToList?: (content: ContentItem) => void;
  onRemoveFromList?: (contentId: number) => void;
  isInList?: boolean;
}

export default function MovieModal({ 
  content, 
  movie, 
  visible, 
  onClose,
  startFromEpisodeId = null,
  startFromTimeSeconds = null,
  onAddToList,
  onRemoveFromList,
  isInList = false 
}: MovieModalProps) {
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const [detailData, setDetailData] = useState<MovieDetail | TVShowDetail | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedContent, setRelatedContent] = useState<ContentItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerDelay, setTrailerDelay] = useState(false);
  const [trailerFinished, setTrailerFinished] = useState(false);
  const [isTogglingMyList, setIsTogglingMyList] = useState(false);
  const [isTogglingDownloads, setIsTogglingDownloads] = useState(false);
  const [currentInDownloads, setCurrentInDownloads] = useState(false);
  
  const { currentProfile } = useProfile();
  const { isInMyList, toggleMyList } = useMyList();
  
  const { width, height } = useWindowDimensions();
  const isSmallScreen = width < 768;
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  // Verificar si el contenido actual está en Mi Lista
  // Normalizar el tipo basado en la fuente para la verificación de Mi Lista
  const normalizedTypeForCurrentContent: 'movie' | 'tv' | 'anime' = currentContent
    ? (currentContent.source === 'anilist'
        ? 'anime'
        : currentContent.source === 'tmdb'
          ? (currentContent.type === 'tv' ? 'tv' : 'movie')
          : currentContent.type)
    : 'movie';
  const currentInMyList = currentContent ? isInMyList(currentContent.id, normalizedTypeForCurrentContent) : false;

  // Normalizar tipo para Descargas (mismo criterio que Mi Lista)
  const normalizedTypeForDownloads: 'movie' | 'tv' | 'anime' = currentContent
    ? (currentContent.source === 'anilist'
        ? 'anime'
        : currentContent.source === 'tmdb'
          ? (currentContent.type === 'tv' ? 'tv' : 'movie')
          : currentContent.type)
    : 'movie';

  // Actualizar contenido cuando cambie el prop
  useEffect(() => {
    if (content) {
      setCurrentContent(content);
    }
  }, [content]);

  useEffect(() => {
    if (visible && currentContent) {
      // Si es anime o serie, no ejecutar la lógica de MovieModal
      if (currentContent.type === 'anime' || currentContent.type === 'tv') {
        return;
      }
      
      // Animación de entrada estilo Pixel
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Cargar detalles del contenido
      loadContentDetails();
      loadRelatedContent();

      // Comprobar estado de Descargas
      (async () => {
        try {
          if (currentProfile && currentContent) {
            const inDownloads = await databaseService.isInDownloads(
              currentProfile.id,
              currentContent.id,
              normalizedTypeForDownloads
            );
            setCurrentInDownloads(inDownloads);
          } else {
            setCurrentInDownloads(false);
          }
        } catch (error) {
          console.error('MovieModal: error comprobando Descargas', error);
          setCurrentInDownloads(false);
        }
      })();
      
      // Delay de 3 segundos para mostrar el trailer en el fondo
      const trailerTimer = setTimeout(() => {
        if (trailerKey && !trailerFinished) {
          setTrailerDelay(true);
          // El trailer se reproducirá hasta el final natural del video
          // No limitamos artificialmente el tiempo
        }
      }, 3000);
      
      return () => {
        clearTimeout(trailerTimer);
        // Solo resetear si el modal se cierra completamente
        if (!visible) {
          setTrailerDelay(false);
          setTrailerFinished(false);
        }
      };
    } else {
      // Reset animaciones y estado
      fadeAnim.setValue(0);
      slideAnim.setValue(height);
      setShowTrailer(false);
      setTrailerDelay(false);
    }
  }, [visible, currentContent, trailerKey]);

  const handleRemoveFromDownloads = async () => {
    if (!currentContent) return;
    if (!currentProfile) {
      Alert.alert('Perfil requerido', 'Selecciona un perfil para gestionar Descargas.');
      return;
    }

    if (isTogglingDownloads) return;
    setIsTogglingDownloads(true);
    try {
      await databaseService.removeFromDownloads(
        currentProfile.id,
        currentContent.id,
        normalizedTypeForDownloads
      );
      setCurrentInDownloads(false);
    } catch (error) {
      console.error('MovieModal: error al eliminar de Descargas', error);
      Alert.alert('Error', 'No se pudo eliminar de Descargas.');
    } finally {
      setIsTogglingDownloads(false);
    }
  };

  const handleDownloadOptions = async () => {
    if (!currentContent) return;
    if (!currentProfile) {
      Alert.alert('Perfil requerido', 'Selecciona un perfil para gestionar Descargas.');
      return;
    }

    if (isTogglingDownloads) return;
    setIsTogglingDownloads(true);
    try {
      if (currentInDownloads) {
        // Si ya está en descargas, actuar como toggle y eliminar
        await databaseService.removeFromDownloads(
          currentProfile.id,
          currentContent.id,
          normalizedTypeForDownloads
        );
        setCurrentInDownloads(false);
      } else {
        await databaseService.addToDownloads(
          currentProfile.id,
          currentContent.id,
          normalizedTypeForDownloads,
          {
            status: 'PENDING',
            progress: 0,
            file_path: JSON.stringify({
              type: 'movie',
              estimated_size_mb: estimateMovieSizeMB(),
            }),
          }
        );
        setCurrentInDownloads(true);
      }
    } catch (error) {
      console.error('MovieModal: error gestionando Descargas', error);
      Alert.alert('Error', 'No se pudo actualizar Descargas.');
    } finally {
      setIsTogglingDownloads(false);
    }
  };

  const loadContentDetails = async () => {
    if (!currentContent) return;
    
    setLoading(true);
    try {
      let details;
      if (currentContent.type === 'movie') {
        details = await getMovieDetails(currentContent.id);
      } else if (currentContent.type === 'tv') {
        details = await getTVShowDetails(currentContent.id);
      } else if (currentContent.type === 'anime') {
        // Para anime, usar getMovieDetails ya que muchos animes están en TMDB como películas
        details = await getMovieDetails(currentContent.id);
      } else {
        // Fallback
        details = await getMovieDetails(currentContent.id);
      }
      
      setDetailData(details);
      
      // Extraer trailer
      const trailer = details.videos?.results.find(
        (video: any) => video.type === 'Trailer' && video.site === 'YouTube'
      );
      
      const anyVideo = details.videos?.results.find(
        (video: any) => video.site === 'YouTube'
      );
      
      if (trailer) {
        setTrailerKey(trailer.key);
      } else if (anyVideo) {
        setTrailerKey(anyVideo.key);
      } else {
        setTrailerKey(null);
      }
    } catch (error) {
      console.error('Error loading content details:', error);
      setTrailerKey(null);
    } finally {
      setLoading(false);
    }
  };

  const loadRelatedContent = async () => {
    if (!currentContent) return;
    
    setLoadingRelated(true);
    try {
      let similar: ContentItem[] = [];
      let recommended: ContentItem[] = [];
      
      if (currentContent.type === 'movie') {
        try {
          const [similarMovies, recommendedMovies] = await Promise.all([
            getSimilarMovies(currentContent.id),
            getRecommendedMovies(currentContent.id),
          ]);
          similar = similarMovies.map(m => tmdbToContentItem(m, 'movie'));
          recommended = recommendedMovies.map(m => tmdbToContentItem(m, 'movie'));
        } catch (error) {
          console.log('Error loading movie related content, using fallback');
          const fallbackMovies = await getMoviesByGenre(detailData?.genres?.[0]?.id || 28);
          similar = fallbackMovies.map(m => tmdbToContentItem(m, 'movie'));
        }
      } else if (currentContent.type === 'tv') {
        try {
          const [similarTV, recommendedTV] = await Promise.all([
            getSimilarTVShows(currentContent.id),
            getRecommendedTVShows(currentContent.id),
          ]);
          similar = similarTV.map(s => tmdbToContentItem(s, 'tv'));
          recommended = recommendedTV.map(s => tmdbToContentItem(s, 'tv'));
        } catch (error) {
          console.log('Error loading TV related content, using fallback');
          const fallbackTV = await getTVShowsByGenre(detailData?.genres?.[0]?.id || 10759);
          similar = fallbackTV.map(s => tmdbToContentItem(s, 'tv'));
        }
      } else if (currentContent.type === 'anime') {
        // Para anime, usar películas de animación como similares
        const simAnim = await getMoviesByGenre(16); // Género animación
        const recAnim = await getMoviesByGenre(16); // Más animación
        similar = simAnim.map(m => tmdbToContentItem(m, 'movie'));
        recommended = recAnim.map(m => tmdbToContentItem(m, 'movie'));
      } else {
        // Fallback
        similar = await getAllPopularContent();
        recommended = [];
      }
      
      // Combinar y eliminar duplicados
      const combined: ContentItem[] = [...similar, ...recommended];
      const uniqueContent = combined.filter((item, index, self) =>
        index === self.findIndex((t) => t.id === item.id)
      );
      
      setRelatedContent(uniqueContent.slice(0, 20));
    } catch (error) {
      console.error('Error loading related content:', error);
      // Fallback: cargar contenido popular
      try {
        const fallbackContent = await getAllPopularContent();
        const filteredFallback = fallbackContent
          .filter((item: ContentItem) => item.id !== currentContent.id)
          .slice(0, 10);
        setRelatedContent(filteredFallback);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setRelatedContent([]);
      }
    } finally {
      setLoadingRelated(false);
    }
  };

  const handleRelatedContentPress = (item: ContentItem) => {
    // Actualizar el contenido actual - esto recargará el modal con el nuevo contenido
    setCurrentContent(item);
  };

  const handleToggleList = async () => {
    if (!currentContent) return;
    if (!currentProfile) {
      Alert.alert('Perfil requerido', 'Selecciona un perfil para usar Mi Lista.');
      return;
    }

    if (isTogglingMyList) return;
    setIsTogglingMyList(true);
    try {
      // Normalizar el tipo basado en la fuente para evitar desajustes de ID/tipo
      const normalizedType: 'movie' | 'tv' | 'anime' =
        currentContent.source === 'anilist' ? 'anime' :
        currentContent.source === 'tmdb' ? (currentContent.type === 'tv' ? 'tv' : 'movie') :
        currentContent.type;
      console.log('MovieModal: toggleMyList with', { id: currentContent.id, type: currentContent.type, source: currentContent.source, normalizedType });
      await toggleMyList(currentContent.id, normalizedType);
    } catch (error) {
      console.error('handleToggleList: Error', error);
      Alert.alert('Error', 'No se pudo actualizar Mi Lista');
    } finally {
      setIsTogglingMyList(false);
    }
  };

  const getAgeRating = (): string => {
    if (!detailData) return 'No clasificado';
    
    if (currentContent?.type === 'movie' && 'release_dates' in detailData) {
      const movieDetail = detailData as MovieDetail;
      if (!movieDetail.release_dates?.results) return 'No clasificado';
      
      const usRelease = movieDetail.release_dates.results.find(r => r.iso_3166_1 === 'US');
      const esRelease = movieDetail.release_dates.results.find(r => r.iso_3166_1 === 'ES');
      
      const release = usRelease || esRelease || movieDetail.release_dates.results[0];
      const certification = release?.release_dates?.[0]?.certification;
      
      return certification || 'No clasificado';
    } else if (currentContent?.type === 'tv' && 'content_ratings' in detailData) {
      const tvDetail = detailData as TVShowDetail;
      if (!tvDetail.content_ratings?.results) return 'No clasificado';
      
      const usRating = tvDetail.content_ratings.results.find(r => r.iso_3166_1 === 'US');
      const esRating = tvDetail.content_ratings.results.find(r => r.iso_3166_1 === 'ES');
      
      const rating = usRating || esRating || tvDetail.content_ratings.results[0];
      return rating?.rating || 'No clasificado';
    }
    
    return 'No clasificado';
  };

  const formatRuntime = (minutes: number | number[]): string => {
    if (Array.isArray(minutes)) {
      if (minutes.length === 0) return 'N/A';
      const avgMinutes = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
      const hours = Math.floor(avgMinutes / 60);
      const mins = avgMinutes % 60;
      return `${hours}h ${mins}min por episodio`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'Fecha desconocida';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getTitle = (): string => {
    if (!currentContent) return '';
    return currentContent.title;
  };

  const getReleaseDate = (): string => {
    if (!currentContent) return '';
    return currentContent.release_date;
  };

  const getRuntime = (): number | number[] => {
    if (!detailData) return 0;
    if (currentContent?.type === 'movie' && 'runtime' in detailData) {
      return (detailData as MovieDetail).runtime;
    } else if (currentContent?.type === 'tv' && 'episode_run_time' in detailData) {
      return (detailData as TVShowDetail).episode_run_time;
    }
    return 0;
  };

  // Estimar tamaño aproximado para mostrar en Descargas (no descarga real)
  const estimateMovieSizeMB = (): number => {
    const minutes = getRuntime();
    let runtimeMinutes = 90;
    if (typeof minutes === 'number' && minutes > 0) {
      runtimeMinutes = minutes;
    } else if (Array.isArray(minutes) && minutes.length > 0 && minutes[0] > 0) {
      runtimeMinutes = minutes[0];
    }
    // Aproximación de 7 MB/min para 1080p
    const estimated = Math.round(runtimeMinutes * 7);
    return Math.min(Math.max(estimated, 300), 3500);
  };

  const handleClose = () => {
    // Animación de salida estilo Pixel
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
      // Reset estado al cerrar
      setCurrentContent(null);
      setDetailData(null);
      setTrailerKey(null);
      setRelatedContent([]);
      setShowTrailer(false);
    });
  };

  // Fallback para Web: abrir el trailer directamente en YouTube si el iframe falla
  const openExternalTrailer = (key?: string | null) => {
    if (!key) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.open(`https://www.youtube.com/watch?v=${key}`, '_blank');
      } catch (e) {
        // Ignorar errores de apertura
      }
    }
  };

  if (!currentContent && !movie) return null;

  // Si es anime o serie, usar el componente específico
  if (currentContent && (currentContent.type === 'anime' || currentContent.type === 'tv')) {
    return (
      <AnimeSeriesModalWrapper
        content={currentContent}
        visible={visible}
        onClose={onClose}
        startFromEpisodeId={currentContent.type === 'anime' ? startFromEpisodeId : null}
        startFromTimeSeconds={currentContent.type === 'anime' ? startFromTimeSeconds : null}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
      <Animated.View style={[styles.background, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.backgroundTouchable}
          activeOpacity={1}
          onPress={handleClose}
        >
          <Animated.View
            style={[
              styles.content,
              {
                transform: [{ translateY: slideAnim }],
                opacity: fadeAnim,
              },
            ]}
          >
            {/* Botón cerrar estilo Pixel */}
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
              contentContainerStyle={{ paddingBottom: 32 }}
              nestedScrollEnabled
              scrollEventThrottle={16}
            >
              {/* Hero Section con backdrop */}
              <View style={[styles.heroSection, { height: isSmallScreen ? height * 0.55 : height * 0.65 }]}>
                {/* Imagen de fondo o trailer */}
                {trailerDelay && trailerKey && !trailerFinished ? (
                  <View style={styles.trailerBackground} pointerEvents="none">
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
                          // Cuando el iframe carga, configuramos un listener para el final del video
                          setTimeout(() => {
                            setTrailerDelay(false);
                            setTrailerFinished(true);
                            // Mostrar imagen de fondo cuando termine el trailer
                          }, 8000); // ~8s: fallback corto si el trailer no reproduce
                        }}
                    />
                  ) : (
                    <WebView
                        pointerEvents="none"
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
                          // Si el trailer falla, ocultarlo y volver al backdrop
                          setTrailerDelay(false);
                          setTrailerFinished(true);
                        }}
                        onLoadEnd={() => {
                          // Fallback para móvil: después de 2 minutos vuelve a imagen
                          setTimeout(() => {
                            setTrailerDelay(false);
                            setTrailerFinished(true);
                            // Mostrar imagen de fondo cuando termine el trailer
                          }, 120000);
                        }}
                      />
                    )}
                  </View>
                ) : (
                  <>
                    {currentContent?.backdrop_path && (
                      <Image
                        source={{ uri: getImageUrl(currentContent.backdrop_path, 'original') }}
                        style={styles.backdropImage}
                        resizeMode="cover"
                      />
                    )}
                    <View style={styles.backdropOverlay} />
                  </>
                )}
                
                {/* Contenido sobre el backdrop - se oculta durante el trailer */}
                {!trailerDelay && (
                  <View style={styles.heroContent}>
                    <View style={[styles.heroInfo, { maxWidth: isSmallScreen ? '90%' : '85%' }]}>
                      <Text style={[styles.heroTitle, { fontSize: isSmallScreen ? 20 : 24 }]}>{getTitle()}</Text>
                      
                      {/* Metadata en línea horizontal */}
                      <View style={styles.heroMetadata}>
                        <Text style={styles.heroYear}>
                          {getReleaseDate() ? new Date(getReleaseDate()).getFullYear() : ''}
                        </Text>
                        <Text style={styles.heroSeparator}>•</Text>
                        <Text style={styles.heroRuntime}>
                          {getRuntime() !== 0 ? formatRuntime(getRuntime()) : ''}
                        </Text>
                        <Text style={styles.heroSeparator}>•</Text>
                        <Text style={styles.heroAgeRating}>{getAgeRating()}</Text>
                        <Text style={styles.heroSeparator}>•</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="star" size={16} color="#FFD700" />
                          <Text style={[styles.heroRating, { marginLeft: 4 }]}> {currentContent?.vote_average.toFixed(1)}</Text>
                        </View>
              </View>

                      {/* Botón "Ver ahora" reubicado nuevamente en el hero (posición original) */}
                      <View style={styles.actionButtons}>
                        <TouchableOpacity style={styles.playButton}>
                          <Ionicons name="play" size={20} color="#000" />
                          <Text style={styles.playButtonText}>Ver ahora</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Descripción después de los botones */}
                      <Text style={styles.heroOverview} numberOfLines={6}>
                        {currentContent?.overview || 'Sin descripción disponible'}
                      </Text>
                    </View>
                    </View>
                  )}
                </View>

              {/* Información detallada */}
              <View style={styles.detailsSection}>
                {/* Géneros */}
                {detailData?.genres && detailData.genres.length > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Géneros:</Text>
                    <Text style={styles.detailValue}>
                      {detailData.genres.map(g => g.name).join(', ')}
                    </Text>
                  </View>
                )}

                {/* Información específica según el tipo */}
                {currentContent?.type === 'tv' && detailData && 'number_of_seasons' in detailData && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Temporadas:</Text>
                    <Text style={styles.detailValue}>
                      {(detailData as TVShowDetail).number_of_seasons} temporada{(detailData as TVShowDetail).number_of_seasons !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}

                {/* Información de anime */}
                {currentContent?.type === 'anime' && detailData && 'episodes' in detailData && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Episodios:</Text>
                    <Text style={styles.detailValue}>
                      {(detailData as any).episodes || 'En emisión'}
                    </Text>
                  </View>
                )}

                {/* Fecha de estreno */}
                {getReleaseDate() && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {currentContent?.type === 'movie' ? 'Estreno:' : 
                       currentContent?.type === 'tv' ? 'Primera emisión:' : 
                       currentContent?.type === 'anime' ? 'Estreno:' : 'Estreno:'}
                    </Text>
                    <Text style={styles.detailValue}>{formatDate(getReleaseDate())}</Text>
                  </View>
                )}
                </View>

                {/* Botones de acción reubicados: arriba de 'Similar' (solo Mi Lista y Descargas) */}
                <View style={styles.bottomActionContainer}>
                  <View style={styles.bottomActionButtons}>
                  <TouchableOpacity 
                    style={[styles.myListButton, isTogglingMyList && { opacity: 0.6 }]}
                    onPress={handleToggleList}
                    disabled={isTogglingMyList}
                  >
                    {isTogglingMyList ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons 
                        name={currentInMyList ? "checkmark" : "add"} 
                        size={20} 
                        color="#FFFFFF" 
                      />
                    )}
                    <Text style={styles.myListButtonText}>
                      {isTogglingMyList ? "Procesando..." : (currentInMyList ? "En mi lista" : "Mi lista")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.downloadButton, isTogglingDownloads && { opacity: 0.6 }]}
                    onPress={handleDownloadOptions}
                    disabled={isTogglingDownloads}
                  >
                    {isTogglingDownloads ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons
                        name={currentInDownloads ? "checkmark" : "download"}
                        size={20}
                        color="#FFFFFF"
                      />
                    )}
                    <Text style={styles.downloadButtonText}>
                      {isTogglingDownloads ? 'Procesando...' : (currentInDownloads ? 'En descargas' : 'Descargar')}
                    </Text>
                  </TouchableOpacity>
                  </View>
                </View>

                {/* Contenido relacionado */}
              <View style={styles.relatedSection}>
                <Text style={styles.relatedTitle}>
                  {currentContent?.type === 'movie' ? 'Más películas similares' :
                   currentContent?.type === 'tv' ? 'Más series similares' :
                   currentContent?.type === 'anime' ? 'Más anime similar' :
                   'Más títulos similares'}
                </Text>
                  
                  {loadingRelated ? (
                  <View style={styles.relatedLoading}>
                    <ActivityIndicator size="small" color="#E50914" />
                    </View>
                  ) : relatedContent.length > 0 ? (
                  <FlatList
                    data={relatedContent}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => {
                      return (
                        <TouchableOpacity
                          style={styles.relatedCard}
                          onPress={() => handleRelatedContentPress(item)}
                        >
                          <Image
                            source={{ uri: getImageUrl(item.poster_path, 'w500') }}
                            style={styles.relatedPoster}
                            resizeMode="cover"
                          />
                          <Text style={styles.relatedTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  ) : (
                  <Text style={styles.noRelatedText}>
                      No hay contenido relacionado disponible
                    </Text>
                  )}
              </View>
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// Estilos estilo Pixel
const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  backgroundTouchable: {
    flex: 1,
    width: '100%',
  },
  content: {
    flex: 1,
    backgroundColor: '#000000',
    width: '100%',
    height: '100%',
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    position: 'relative',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
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
  backdropImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,
  },
  heroInfo: {
    maxWidth: '85%',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  heroYear: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  heroSeparator: {
    color: '#FFFFFF',
    fontSize: 16,
    marginHorizontal: 8,
    opacity: 0.7,
  },
  heroRuntime: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  heroAgeRating: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroRating: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  heroOverview: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 26,
    marginTop: 0,
    marginBottom: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    fontWeight: '400',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  bottomActionContainer: {
    backgroundColor: '#141414', // Consistente con la sección de detalles/relacionados
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bottomActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  myListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(109, 109, 110, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  myListButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(109, 109, 110, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(109, 109, 110, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 8,
  },
  trailerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  detailsSection: {
    padding: 20,
    backgroundColor: '#141414',
    marginTop: 0,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: 14,
    color: '#777',
    fontWeight: '600',
    minWidth: 80,
    marginRight: 12,
  },
  detailValue: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  relatedSection: {
    padding: 20,
    backgroundColor: '#141414',
  },
  relatedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  relatedLoading: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  relatedCard: {
    width: 120,
    marginRight: 12,
  },
  relatedPoster: {
    width: '100%',
    height: 180,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  noRelatedText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
