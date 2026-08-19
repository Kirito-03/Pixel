  import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  Animated,
  FlatList,
  Modal,
  useWindowDimensions,
  RefreshControl,
  Alert,
  Pressable,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { ContentItem, MovieDetail, TVShowDetail, AnimeDetail, Anime, StreamingInfo, AnimeEpisode, AnimeSeason } from '../types';
import { getImageUrl, getMovieDetails, getTVShowDetails, animeToContentItem, tmdbToContentItem, searchMovies, searchTVShows } from '../services/api';
import { getAnimeDetails, getSimilarAnime, getAnimeImageUrl, getAnimeTitle, getAnimeYear, getAnimeScore, getAnimeByGenre } from '../services/anilistService';
import { createMockStreamingInfo, getAnimeStreamingInfo } from '../services/animeStreamingService';
import { debugM3U, resetM3UCache } from '../services/m3uParser';
import { catalogService } from '../services/catalogService';
import { useProfile } from '../contexts/ProfileContext';
import { useMyList } from '../contexts/MyListContext';
import EpisodePlayer from './EpisodePlayer';
import { canReachUrl } from '../services/connectivity';
import { offlineDownloads } from '../services/offlineDownloads';
import { getResumeTarget } from '../services/resumeTarget';

interface AnimeSeriesModalProps {
  content: ContentItem | null;
  visible: boolean;
  onClose: () => void;
  onPlayEpisode?: (episode: AnimeEpisode, season: AnimeSeason, resumeTimeSeconds?: number) => void;
}

export default function AnimeSeriesModal({
  content,
  visible,
  onClose,
  onPlayEpisode,
}: AnimeSeriesModalProps) {
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const [detailData, setDetailData] = useState<MovieDetail | TVShowDetail | AnimeDetail | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Lista de contenido relacionado en formato unificado
  const [relatedContent, setRelatedContent] = useState<ContentItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerDelay, setTrailerDelay] = useState(false);
  const [trailerFinished, setTrailerFinished] = useState(false);
  
  // Streaming states
  const [streamingInfo, setStreamingInfo] = useState<StreamingInfo | null>(null);
  const [loadingStreaming, setLoadingStreaming] = useState(false);
  const [showEpisodePlayer, setShowEpisodePlayer] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<AnimeEpisode | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<AnimeSeason | null>(null);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [isTogglingMyList, setIsTogglingMyList] = useState(false);
  const [isTogglingDownloads, setIsTogglingDownloads] = useState(false);
  const [currentInDownloads, setCurrentInDownloads] = useState(false);

  const { currentProfile } = useProfile();
  const { isInMyList, toggleMyList } = useMyList();
  
  const { width, height } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const descSlideAnim = useRef(new Animated.Value(0)).current;

  // Verificar si el contenido actual está en Mi Lista
  // Normalizar el tipo según la fuente para la verificación de Mi Lista
  const normalizedTypeForCurrentContent: 'movie' | 'tv' | 'anime' = currentContent
    ? (currentContent.source === 'anilist'
        ? 'anime'
        : currentContent.source === 'tmdb'
          ? (currentContent.type === 'tv' ? 'tv' : 'movie')
          : currentContent.type)
    : 'movie';
  const currentInMyList = currentContent ? isInMyList(currentContent.id, normalizedTypeForCurrentContent) : false;

  useEffect(() => {
    if (content) {
      setCurrentContent(content);
      setDetailData(null);
      setStreamingInfo(null);
      setSelectedSeason(null);
      setTrailerKey(null);
      descSlideAnim.setValue(12);
      Animated.sequence([
        Animated.timing(contentFadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(descSlideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [content]);

  useEffect(() => {
    if (visible && currentContent) {
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
      
      if ((currentContent.type as string) === 'anime') {
        console.log('Loading streaming info for anime');
        loadStreamingInfo();
      }

      // Verificar estado de Descargas al abrir
      setCurrentInDownloads(false);
      
      return () => {
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
      setTrailerFinished(false);
    }
  }, [visible, currentContent, trailerKey]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!visible) return;
    const profileId = currentProfile?.id;
    const season = selectedSeason;
    if (!profileId || !season) {
      setCurrentInDownloads(false);
      return;
    }
    const episodeIds = season.episodes
      .map((e) => Number(e.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (episodeIds.length === 0) {
      setCurrentInDownloads(false);
      return;
    }
    offlineDownloads
      .getSeasonSummary(profileId, episodeIds)
      .then((s) => setCurrentInDownloads(s.total > 0 && s.downloaded === s.total))
      .catch(() => setCurrentInDownloads(false));
  }, [visible, currentProfile?.id, selectedSeason?.id]);

  useEffect(() => {
    if (!visible) return;
    if (!currentContent) return;
    if (currentContent.type !== 'anime') return;
    if (!detailData) return;
    loadStreamingInfo();
  }, [detailData, visible, currentContent]);

  useEffect(() => {
    if (!currentContent) return;
    setDetailData(null);
    setStreamingInfo(null);
    setSelectedSeason(null);
    setTrailerKey(null);
    descSlideAnim.setValue(12);
    Animated.sequence([
      Animated.timing(contentFadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(contentFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(descSlideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
    ]).start();
  }, [currentContent?.id]);

  const loadContentDetails = async () => {
    if (!currentContent) return;
    
    console.log('Loading content details for:', currentContent);
    setLoading(true);
    try {
      let details;
      if (currentContent.type === 'movie') {
        details = await getMovieDetails(currentContent.id);
      } else if (currentContent.type === 'tv') {
        details = await getTVShowDetails(currentContent.id);
      } else if ((currentContent.type as string) === 'anime') {
        const anime = await catalogService.getAnimeById(currentContent.id);
        details = {
          id: anime.id,
          title: {
            romaji: anime.title,
            english: anime.title_english || undefined,
            native: anime.title_japanese || anime.title,
          },
          description: anime.description || '',
          coverImage: {
            large: anime.poster_url || '',
            medium: anime.poster_url || '',
          },
          bannerImage: anime.banner_url || undefined,
          startDate: { year: 0 },
          averageScore: typeof anime.rating === 'number' ? anime.rating : 0,
          episodes: typeof anime.total_episodes === 'number' ? anime.total_episodes : undefined,
          status: anime.status || 'UNKNOWN',
          genres: Array.isArray(anime.genres) ? anime.genres : [],
          format: 'TV',
          source: 'anilist',
          studios: { nodes: [] },
          characters: { nodes: [] },
          recommendations: { nodes: [] },
        } as any;
      } else {
        details = await getMovieDetails(currentContent.id);
      }
      
      setDetailData(details);
      
      // Extraer trailer
      let trailer = null as any;
      let anyVideo = null as any;
      
      if (currentContent.type === 'anime' && 'trailer' in details && (details as AnimeDetail).trailer) {
        const t = (details as AnimeDetail).trailer;
        if (t && t.site && t.site.toLowerCase() === 'youtube' && t.id) {
          setTrailerKey(String(t.id));
        } else {
          setTrailerKey(null);
        }
      } else if ('videos' in details && (details as any).videos) {
        trailer = (details as any).videos.results.find(
          (video: any) => video.type === 'Trailer' && video.site === 'YouTube'
        );
        
        anyVideo = (details as any).videos.results.find(
          (video: any) => video.site === 'YouTube'
        );
        
        if (trailer) {
          setTrailerKey(trailer.key);
        } else if (anyVideo) {
          setTrailerKey(anyVideo.key);
        } else {
          setTrailerKey(null);
        }
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

  const loadStreamingInfo = async () => {
    if (!currentContent || currentContent.type !== 'anime') return;

    setLoadingStreaming(true);
    try {
      const [anime, episodes] = await Promise.all([
        catalogService.getAnimeById(currentContent.id),
        catalogService.getAnimeEpisodes(currentContent.id),
      ]);

      const grouped = new Map<number, AnimeEpisode[]>();
      for (const ep of episodes) {
        const season = typeof ep.season === 'number' ? ep.season : 1;
        const url = ep.stream_url || ep.video_url || undefined;
        const episodeItem: AnimeEpisode = {
          id: String(ep.id),
          number: ep.episode_number,
          title: ep.title || `Episodio ${ep.episode_number}`,
          url,
          downloadUrl: ep.video_url || undefined,
          external_servers: ep.external_servers || undefined,
        };
        const list = grouped.get(season) || [];
        list.push(episodeItem);
        grouped.set(season, list);
      }

      const seasons: AnimeSeason[] = Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([season, eps]) => ({
          id: `season-${season}`,
          season,
          title: season === 1 ? 'Temporada 1' : `Temporada ${season}`,
          episodes: eps.sort((a, b) => a.number - b.number),
        }));

      const info: StreamingInfo = {
        animeId: String(anime.id),
        title: anime.title,
        description: anime.description || '',
        image: anime.poster_url || '',
        genres: Array.isArray(anime.genres) ? anime.genres : [],
        status: anime.status || 'UNKNOWN',
        totalEpisodes:
          typeof anime.total_episodes === 'number'
            ? anime.total_episodes
            : seasons.reduce((c, s) => c + s.episodes.length, 0),
        seasons,
      };

      setStreamingInfo(info);
      setSelectedSeason(info.seasons[0] || null);
    } catch (error) {
      console.error('Error loading streaming data:', error);
      setStreamingInfo({
        animeId: String(currentContent.id),
        title: currentContent.title,
        description: '',
        image: '',
        genres: [],
        status: 'UNKNOWN',
        totalEpisodes: 0,
        seasons: [],
      });
      setSelectedSeason(null);
    } finally {
      setLoadingStreaming(false);
    }
  };

  const handleRefresh = async () => {
    if (!currentContent) return;
    setRefreshing(true);
    try {
      await Promise.all([
        // recargar detalles básicos y similares si aplica
        loadContentDetails(),
        loadStreamingInfo(),
      ]);
    } catch (e) {
      // noop, ya hay logs dentro
    } finally {
      setRefreshing(false);
    }
  };

  const loadRelatedContent = async () => {
    if (!currentContent) return;
    
    if ((currentContent.type as string) === 'anime') {
      setRelatedContent([]);
      return;
    }

    setLoadingRelated(true);
    try {
      let similar: any[] = [];
      let recommended: any[] = [];
      
      if (currentContent.type === 'movie') {
        try {
          const movieDetails = await getMovieDetails(currentContent.id);
          similar = [movieDetails];
          recommended = [];
        } catch (error) {
          console.log('Error loading movie related content, using fallback');
          similar = [];
          recommended = [];
        }
      } else if (currentContent.type === 'tv') {
        try {
          const tvDetails = await getTVShowDetails(currentContent.id);
          similar = [tvDetails];
          recommended = [];
        } catch (error) {
          console.log('Error loading TV related content, using fallback');
          similar = [];
          recommended = [];
        }
      } else {
        similar = [];
        recommended = [];
      }
      
      const combined = [...similar, ...recommended];
      const unique = combined.filter((item, index, self) => index === self.findIndex(t => t.id === item.id));

      // Mapear a ContentItem unificado según el tipo
      let mapped: ContentItem[] = [];
      if ((currentContent.type as string) === 'anime') {
        mapped = unique.map((anime: Anime) => animeToContentItem(anime));
      } else if (currentContent.type === 'movie') {
        mapped = unique.map((movie: any) => tmdbToContentItem(movie as any, 'movie'));
      } else if (currentContent.type === 'tv') {
        mapped = unique.map((show: any) => tmdbToContentItem(show as any, 'tv'));
      }

      setRelatedContent(mapped.slice(0, 20));
    } catch (error) {
      console.error('Error loading related content:', error);
      setRelatedContent([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  // Episode handling functions
  const handlePlayEpisode = (episode: AnimeEpisode, season: AnimeSeason, resumeTimeSeconds?: number) => {
    console.log('Playing episode:', episode.title, 'from season:', season.title);
    console.log('Episode ID:', episode.id, 'Season ID:', season.id);
    
    if (onPlayEpisode) {
      console.log('Using external onPlayEpisode handler');
      onPlayEpisode(episode, season, resumeTimeSeconds);
    } else {
      console.log('Using internal episode handling (fallback)');
      // Fallback para compatibilidad
      setSelectedEpisode(episode);
      setSelectedSeason(season);
      setCurrentEpisodeIndex(season.episodes.findIndex(ep => ep.id === episode.id));
      setShowEpisodePlayer(true);
    }
  };

  const handleNextEpisode = () => {
    if (!selectedSeason || currentEpisodeIndex >= selectedSeason.episodes.length - 1) return;
    
    const nextIndex = currentEpisodeIndex + 1;
    const nextEpisode = selectedSeason.episodes[nextIndex];
    setCurrentEpisodeIndex(nextIndex);
    setSelectedEpisode(nextEpisode);
  };

  const handlePreviousEpisode = () => {
    if (!selectedSeason || currentEpisodeIndex <= 0) return;
    
    const prevIndex = currentEpisodeIndex - 1;
    const prevEpisode = selectedSeason.episodes[prevIndex];
    setCurrentEpisodeIndex(prevIndex);
    setSelectedEpisode(prevEpisode);
  };

  const handleCloseEpisodePlayer = () => {
    console.log('Closing episode player');
    setShowEpisodePlayer(false);
    setSelectedEpisode(null);
    setSelectedSeason(null);
    setCurrentEpisodeIndex(0);
    console.log('Episode player closed and state cleared');
  };

  // Ver ahora: series -> primer episodio; películas -> abrir trailer si existe
  const handleWatchNow = async () => {
    // Series de anime: reproducir primer episodio de la primera temporada
    if (
      currentContent?.type === 'anime' &&
      streamingInfo &&
      streamingInfo &&
      Array.isArray(streamingInfo.seasons) &&
      streamingInfo.seasons.length > 0
    ) {
      const firstSeason = streamingInfo.seasons[0];
      const firstEpisode = firstSeason?.episodes?.[0];
      if (!firstEpisode) return;

      if (!currentProfile?.id || !currentContent?.id) {
        handlePlayEpisode(firstEpisode, firstSeason, 0);
        return;
      }

      try {
        const target = await getResumeTarget(Number(currentContent.id), Number(currentProfile.id));
        const targetEpisodeId = target.episodeId ? String(target.episodeId) : '';
        const resumeTime = Number(target.resumeTime || 0);
        if (targetEpisodeId) {
          for (const s of streamingInfo.seasons) {
            const ep = s.episodes?.find((e) => String(e.id) === targetEpisodeId);
            if (ep) {
              handlePlayEpisode(ep, s, resumeTime);
              return;
            }
          }
        }
        handlePlayEpisode(firstEpisode, firstSeason, 0);
        return;
      } catch {
        handlePlayEpisode(firstEpisode, firstSeason, 0);
        return;
      }
    }

    // Películas de anime: abrir trailer si está disponible
    if (currentContent?.type === 'anime' && isAnimeMovie()) {
      if (trailerKey) {
        openExternalTrailer(trailerKey);
        return;
      }
      Alert.alert('Sin trailer', 'No hay trailer disponible para esta película de anime.');
      return;
    }

    Alert.alert('Contenido no disponible', 'No hay episodios disponibles para reproducir.');
  };

  const handlePlayTrailer = () => {
    if (!trailerKey) {
      Alert.alert('Sin trailer', 'No hay trailer disponible para este título.');
      return;
    }
    setTrailerFinished(false);
    setTrailerDelay(true);
  };

  const handleCloseTrailer = () => {
    setTrailerDelay(false);
    setTrailerFinished(true);
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
      // Normalizar el tipo según la fuente para evitar IDs inconsistentes (TMDB vs AniList)
      const normalizedType: 'movie' | 'tv' | 'anime' =
        currentContent.source === 'anilist' ? 'anime' :
        currentContent.source === 'tmdb' ? (currentContent.type === 'tv' ? 'tv' : 'movie') :
        currentContent.type;
      console.log('AnimeSeriesModal: toggleMyList with', { id: currentContent.id, type: currentContent.type, source: currentContent.source, normalizedType });
      await toggleMyList(currentContent.id, normalizedType);
    } catch (error) {
      console.error('Error toggling mi lista:', error);
      Alert.alert('Error', 'No se pudo actualizar Mi Lista. Verifica tu conexión al servidor.');
    } finally {
      setIsTogglingMyList(false);
    }
  };

  // Descargas
  const handleRemoveFromDownloads = async () => {
    if (!currentContent) return;
    if (!currentProfile) {
      Alert.alert('Perfil requerido', 'Selecciona un perfil para gestionar Descargas.');
      return;
    }
    if (Platform.OS !== 'android') return;
    if (isTogglingDownloads) return;
    setIsTogglingDownloads(true);
    try {
      if (!selectedSeason) {
        Alert.alert('Temporada requerida', 'Selecciona una temporada para gestionar descargas.');
        return;
      }
      const profileId = currentProfile.id;
      const episodeIds = selectedSeason.episodes
        .map((e) => Number(e.id))
        .filter((n) => Number.isFinite(n) && n > 0);
      await Promise.all(episodeIds.map((id) => offlineDownloads.removeEpisode(profileId, id)));
      setCurrentInDownloads(false);
    } catch (error) {
      Alert.alert('Error', 'No se pudo quitar de Descargas.');
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
    if (Platform.OS !== 'android') return;
    if (isTogglingDownloads) return;
    setIsTogglingDownloads(true);
    try {
      if (!selectedSeason) {
        Alert.alert('Temporada requerida', 'Selecciona una temporada para descargar.');
        return;
      }
      const profileId = currentProfile.id;
      const animeId = currentContent.id;
      const toDownload = selectedSeason.episodes
        .map((ep) => {
          const episodeId = Number(ep.id);
          const url = ep.downloadUrl;
          if (!Number.isFinite(episodeId) || episodeId <= 0) return null;
          if (!url) return null;
          return { episodeId, episodeNumber: ep.number, title: ep.title, url };
        })
        .filter((x): x is { episodeId: number; episodeNumber: number; title: string; url: string } => !!x);
      if (!toDownload.length) {
        Alert.alert('No disponible', 'No hay archivos descargables para esta temporada.');
        return;
      }
      const online = await canReachUrl(toDownload[0].url);
      if (!online) {
        Alert.alert('Sin conexión', 'Conéctate a internet para descargar.');
        return;
      }
      for (const ep of toDownload) {
        await offlineDownloads.downloadEpisode(
          profileId,
          {
            animeId,
            season: selectedSeason.season,
            episodeId: ep.episodeId,
            episodeNumber: ep.episodeNumber,
            title: ep.title,
            url: ep.url,
          }
        );
      }
      const summary = await offlineDownloads.getSeasonSummary(
        profileId,
        selectedSeason.episodes.map((e) => Number(e.id)).filter((n) => Number.isFinite(n) && n > 0)
      );
      setCurrentInDownloads(summary.total > 0 && summary.downloaded === summary.total);
    } catch (error) {
      Alert.alert('Error', 'No se pudo agregar a Descargas.');
    } finally {
      setIsTogglingDownloads(false);
    }
  };

  const handleClose = () => {
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
    });
  };

  // Fallback para Web: abrir el trailer directamente en YouTube si el iframe falla
  const openExternalTrailer = (key?: string | null) => {
    if (!key) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.open(`https://www.youtube.com/watch?v=${key}`, '_blank');
      } catch (e) {
        
      }
    } else {
      try {
        Linking.openURL(`https://www.youtube.com/watch?v=${key}`);
      } catch (e) {
        
      }
    }
  };

  const getTitle = () => {
    if (detailData) {
      if ('title' in detailData && typeof detailData.title === 'object') {
        return getAnimeTitle(detailData.title as any) || currentContent?.title || 'Sin título';
      }
      if ('title' in detailData) {
        return detailData.title || currentContent?.title || 'Sin título';
      }
      if ('name' in detailData) {
        return detailData.name || currentContent?.title || 'Sin título';
      }
    }
    return currentContent?.title || 'Sin título';
  };

  const getReleaseDate = () => {
    if (detailData) {
      if ('startDate' in detailData && detailData.startDate) {
        const { year, month, day } = detailData.startDate as any;
        if (year) {
          return `${year}-${month?.toString().padStart(2, '0') || '01'}-${day?.toString().padStart(2, '0') || '01'}`;
        }
      }
      if ('release_date' in detailData) {
        return detailData.release_date || '';
      }
      if ('first_air_date' in detailData) {
        return detailData.first_air_date || '';
      }
    }
    return currentContent?.release_date || '';
  };

  const getRuntime = () => {
    if (detailData) {
      if ('duration' in detailData && detailData.duration) {
        return detailData.duration;
      }
      if ('runtime' in detailData) {
        return detailData.runtime || 0;
      }
    }
    return 0;
  };

  const getAgeRating = () => {
    if (detailData && 'adult' in detailData) {
      return detailData.adult ? 'R' : 'PG';
    }
    return 'PG';
  };

  // Función para determinar si es realmente un anime (no película)
  const isRealAnime = (): boolean => {
    if (!currentContent || currentContent.type !== 'anime') return false;
    
    if (!detailData) return false;
    
    if ('format' in detailData) {
      const format = (detailData as AnimeDetail).format;
      if (format === 'MOVIE') {
        console.log('Detected as anime movie, not series');
        return false;
      }
      return ['TV', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT'].includes(format);
    }
    
    if ('episodes' in detailData) {
      const episodes = (detailData as any).episodes;
      return episodes !== null && episodes !== undefined && episodes > 1;
    }
    
    return false;
  };

  // Detectar si es una PELÍCULA de anime (AniList format === 'MOVIE')
  const isAnimeMovie = (): boolean => {
    if (!currentContent || currentContent.type !== 'anime') return false;
    if (!detailData) return false;
    if ('format' in detailData) {
      return (detailData as AnimeDetail).format === 'MOVIE';
    }
    return false;
  };

  // Función para limpiar HTML de las descripciones
  const cleanDescription = (description: string): string => {
    if (!description) return '';
    
    return description
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  };

  const formatRuntime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No disponible';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!visible || !currentContent) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <StatusBar style="light" translucent />
        
        <Animated.View style={[styles.content, { opacity: contentFadeAnim }]}>
          {/* Botón cerrar estilo Pixel */}
          {!(trailerDelay && trailerKey && !trailerFinished) && (
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          <ScrollView 
            showsVerticalScrollIndicator={false} 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            bounces={true}
            scrollEventThrottle={16}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#E50914"
                colors={["#E50914"]}
              />
            }
          >
            {/* HERO SECTION */}
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

            {/* ── TARJETA CONTINUAR VIENDO ── */}
            {currentContent?.type === 'anime' && streamingInfo && streamingInfo.seasons.length > 0 && !loadingStreaming && (() => {
              const firstSeason = streamingInfo.seasons[0];
              const nextEp = firstSeason?.episodes?.[0];
              if (!nextEp) return null;
              return (
                <TouchableOpacity
                  style={continueStyles.card}
                  onPress={async () => {
                    if (!currentProfile?.id || !currentContent?.id) {
                      handlePlayEpisode(nextEp, firstSeason, 0);
                      return;
                    }
                    try {
                      const target = await getResumeTarget(Number(currentContent.id), Number(currentProfile.id));
                      const resumeTime = String(target.episodeId) === String(nextEp.id) ? Number(target.resumeTime || 0) : 0;
                      handlePlayEpisode(nextEp, firstSeason, resumeTime);
                    } catch {
                      handlePlayEpisode(nextEp, firstSeason, 0);
                    }
                  }}
                  activeOpacity={0.92}
                >
                  {/* Miniatura */}
                  <View style={continueStyles.thumb}>
                    {currentContent.poster_path ? (
                      <Image
                        source={{ uri: currentContent.type === 'anime' ? getAnimeImageUrl(currentContent.poster_path) : getImageUrl(currentContent.poster_path, 'w500') }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="film-outline" size={28} color="rgba(255,255,255,0.3)" />
                      </View>
                    )}
                    <View style={continueStyles.thumbOverlay}>
                      <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.95)" />
                    </View>
                  </View>

                  {/* Info */}
                  <View style={continueStyles.info}>
                    <Text style={continueStyles.label}>▶ PRÓXIMO EPISODIO</Text>
                    <Text style={continueStyles.epTitle} numberOfLines={1}>
                      Ep. {nextEp.number} — {nextEp.title}
                    </Text>
                    <Text style={continueStyles.duration}>~24 min</Text>
                  </View>

                  {/* CTA horizontal premium */}
                  <View style={continueStyles.playBtn}>
                    <Ionicons name="play" size={16} color="#fff" />
                    <Text style={continueStyles.playBtnText}>Ver ahora</Text>
                  </View>
                </TouchableOpacity>
              );
            })()}

            {/* ── INFO RÁPIDA ── */}
            <View style={infoStyles.section}>
              {/* Fila: estado + episodios + formato */}
              <View style={infoStyles.grid}>
                {detailData && 'status' in detailData && (
                  <View style={infoStyles.cell}>
                    <Text style={infoStyles.cellLabel}>Estado</Text>
                    <View style={[
                      infoStyles.statusPill,
                      (detailData as any).status === 'RELEASING' && { backgroundColor: 'rgba(229,9,20,0.15)', borderColor: 'rgba(229,9,20,0.4)' },
                      (detailData as any).status === 'FINISHED' && { backgroundColor: 'rgba(0,200,83,0.12)', borderColor: 'rgba(0,200,83,0.35)' },
                    ]}>
                      <Text style={[
                        infoStyles.statusPillText,
                        (detailData as any).status === 'RELEASING' && { color: '#E50914' },
                        (detailData as any).status === 'FINISHED' && { color: '#00C853' },
                      ]}>
                        {(detailData as any).status === 'RELEASING' ? 'En emisión' :
                         (detailData as any).status === 'FINISHED' ? 'Completado' :
                         (detailData as any).status === 'NOT_YET_RELEASED' ? 'Próximamente' :
                         (detailData as any).status || '—'}
                      </Text>
                    </View>
                  </View>
                )}

                {currentContent?.type === 'anime' && detailData && 'episodes' in detailData && isRealAnime() && (
                  <View style={infoStyles.cell}>
                    <Text style={infoStyles.cellLabel}>Episodios</Text>
                    <Text style={infoStyles.cellValue}>{(detailData as any).episodes || '—'}</Text>
                  </View>
                )}

                {currentContent?.type === 'anime' && detailData && 'format' in detailData && (
                  <View style={infoStyles.cell}>
                    <Text style={infoStyles.cellLabel}>Formato</Text>
                    <Text style={infoStyles.cellValue}>{(detailData as any).format || '—'}</Text>
                  </View>
                )}

                {getReleaseDate() && (
                  <View style={infoStyles.cell}>
                    <Text style={infoStyles.cellLabel}>Estreno</Text>
                    <Text style={infoStyles.cellValue}>{formatDate(getReleaseDate())}</Text>
                  </View>
                )}
              </View>

              {/* Géneros */}
              {detailData?.genres && detailData.genres.length > 0 && (
                <View style={infoStyles.genreRow}>
                  {detailData.genres.map((g: any, i: number) => (
                    <View key={i} style={infoStyles.genreChip}>
                      <Text style={infoStyles.genreChipText}>{typeof g === 'string' ? g : g.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

              {/* Streaming Episodes for Anime - mostrar si hay datos del M3U */}
              {currentContent?.type === 'anime' && streamingInfo && Array.isArray(streamingInfo.seasons) && streamingInfo.seasons.length > 0 && (
                <View style={styles.streamingSection}>
                  <View style={styles.streamingHeader}>
                    <Text style={styles.streamingTitle}>Episodios</Text>
                    {detailData && 'status' in detailData && (
                      <Text style={styles.streamingSubtitle}>
                        {(detailData as AnimeDetail).status === 'RELEASING' ? 'Nuevos episodios cada semana' :
                         (detailData as AnimeDetail).status === 'FINISHED' ? 'Serie completada' :
                         (detailData as AnimeDetail).status === 'NOT_YET_RELEASED' ? 'Próximamente' :
                         ''}
                      </Text>
                    )}
                  </View>

                  {/* Botones de acción: Mi Lista y Descargas arriba de las temporadas */}
                  <View style={styles.actionButtons}>
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

                    {Platform.OS === 'android' && (
                      <TouchableOpacity
                        style={[styles.downloadButton, (isTogglingDownloads || isAnimeMovie() || !selectedSeason) && { opacity: 0.6 }]}
                        onPress={() => currentInDownloads ? handleRemoveFromDownloads() : handleDownloadOptions()}
                        disabled={isTogglingDownloads || isAnimeMovie() || !selectedSeason}
                      >
                        {isTogglingDownloads ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons
                            name={currentInDownloads ? 'checkmark-circle' : 'download-outline'}
                            size={20}
                            color="#FFFFFF"
                          />
                        )}
                        <Text style={styles.downloadButtonText}>
                          {isTogglingDownloads
                            ? 'Descargando...'
                            : (currentInDownloads ? 'Descargado' : 'Descargar')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {loadingStreaming ? (
                    <View style={styles.streamingLoading}>
                      <ActivityIndicator size="small" color="#E50914" />
                      <Text style={styles.streamingLoadingText}>Cargando episodios...</Text>
                    </View>
                  ) : streamingInfo && streamingInfo.seasons.length > 0 ? (
                    <View style={styles.seasonsContainer}>
                      {streamingInfo.seasons.length > 1 && (
                        <View style={styles.seasonPicker}>
                          <TouchableOpacity
                            style={styles.seasonPickerButton}
                            onPress={() => setShowSeasonPicker(true)}
                          >
                            <Text style={styles.seasonPickerButtonText}>
                              {selectedSeason?.title || streamingInfo.seasons[0].title}
                            </Text>
                            <Ionicons name={showSeasonPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
                          </TouchableOpacity>
                          {/* Lista movida a Modal para evitar problemas de transparencia y z-index */}
                        </View>
                      )}

                      {selectedSeason && (
                        <View style={styles.seasonContainer}>
                          <View style={styles.streamingSeasonHeader}>
                            <Text style={styles.streamingSeasonTitle}>{selectedSeason.title}</Text>
                            <Text style={styles.seasonEpisodeCount}>
                              {(() => {
                                let episodesToShow = selectedSeason.episodes;
                                if (detailData && 'status' in detailData) {
                                  const animeStatus = (detailData as AnimeDetail).status;
                                  if (animeStatus === 'RELEASING') {
                                    episodesToShow = selectedSeason.episodes.filter(ep => ep.number <= (selectedSeason.episodes.length || 0));
                                  }
                                }
                                return episodesToShow.length;
                              })()} episodios
                            </Text>
                          </View>

                          <View style={styles.episodesGrid}>
                            {(() => {
                              let episodesToShow = selectedSeason.episodes;
                              if (detailData && 'status' in detailData) {
                                const animeStatus = (detailData as AnimeDetail).status;
                                if (animeStatus === 'RELEASING') {
                                  episodesToShow = selectedSeason.episodes.filter(ep => ep.number <= (selectedSeason.episodes.length || 0));
                                }
                              }
                              return episodesToShow.map((episode) => (
                                <TouchableOpacity
                                  key={episode.id}
                                  style={epStyles.card}
                                  onPress={() => handlePlayEpisode(episode, selectedSeason)}
                                  {...(Platform.OS === 'web' ? {
                                    // @ts-ignore
                                    onMouseEnter: (e: any) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; },
                                    onMouseLeave: (e: any) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; },
                                  } : {})}
                                >
                                  {/* Número o thumb */}
                                  {episode.image ? (
                                    <Image
                                      source={{ uri: episode.image }}
                                      style={epStyles.thumb}
                                      resizeMode="cover"
                                    />
                                  ) : (
                                    <View style={epStyles.numBadge}>
                                      <Text style={epStyles.numText}>{episode.number}</Text>
                                    </View>
                                  )}

                                  {/* Info */}
                                  <View style={epStyles.info}>
                                    <Text style={epStyles.num}>Ep. {episode.number}</Text>
                                    <Text style={epStyles.title} numberOfLines={1}>{episode.title}</Text>
                                    {episode.description && (
                                      <Text style={epStyles.desc} numberOfLines={1}>
                                        {cleanDescription(episode.description)}
                                      </Text>
                                    )}
                                  </View>

                                  {/* Play icon */}
                                  <View style={epStyles.playWrap}>
                                    <Ionicons name="play" size={14} color="#fff" />
                                  </View>
                                </TouchableOpacity>
                              ));
                            })()}
                          </View>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.noEpisodesContainer}>
                      <Text style={styles.noEpisodesText}>
                        No se encontraron episodios para este anime
                      </Text>
                      <Text style={styles.noEpisodesSubtext}>
                        Intenta nuevamente o prueba con otro título
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {currentContent?.type === 'anime' && (!streamingInfo || !Array.isArray(streamingInfo.seasons) || streamingInfo.seasons.length === 0) && (
                <View style={styles.streamingSection}>
                  <View style={styles.streamingHeader}>
                    <Text style={styles.streamingTitle}>Episodios</Text>
                  </View>
                  <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                    <Text style={{ color: '#b3b3b3', marginBottom: 12 }}>
                      No hay episodios disponibles para este anime en el catálogo interno.
                    </Text>
                    <View style={styles.actionButtons}>
                      <TouchableOpacity style={styles.myListButton} onPress={handleRefresh}>
                        <Ionicons name="refresh" size={20} color="#FFFFFF" />
                        <Text style={styles.myListButtonText}>Reintentar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* Modal de selección de temporada para evitar transparencia/z-index issues */}
              {showSeasonPicker && (
                <Modal
                  visible={showSeasonPicker}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowSeasonPicker(false)}
                >
                  <Pressable style={styles.seasonModalBackdrop} onPress={() => setShowSeasonPicker(false)}>
                    <Pressable style={styles.seasonModalContent} onPress={() => {}}>
                      <View style={styles.seasonModalHeader}>
                        <Text style={styles.seasonModalHeaderText}>Selecciona temporada</Text>
                      </View>
                      <ScrollView style={styles.seasonModalList}>
                        {streamingInfo?.seasons.map((season) => (
                          <TouchableOpacity
                            key={season.id}
                            style={styles.seasonPickerItem}
                            onPress={() => {
                              setSelectedSeason(season);
                              setShowSeasonPicker(false);
                            }}
                          >
                            <Text style={styles.seasonPickerItemText}>{season.title}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </Pressable>
                  </Pressable>
                </Modal>
              )}


            {/* ── MÁS ANIME SIMILAR ── */}
            <View style={simStyles.section}>
              <View style={simStyles.header}>
                <View style={simStyles.accentBar} />
                <Text style={simStyles.title}>
                  {currentContent?.type === 'movie' ? 'Más películas similares' :
                   currentContent?.type === 'tv' ? 'Más series similares' :
                   currentContent?.type === 'anime' && isRealAnime() ? 'Más anime similar' :
                   'Más títulos similares'}
                </Text>
              </View>
                  
                  {loadingRelated ? (
                    <View style={styles.relatedLoading}>
                      <ActivityIndicator size="small" color="#E50914" />
                    </View>
                  ) : relatedContent.length > 0 ? (
                    <FlatList
                      data={relatedContent}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled={true}
                      scrollEnabled={true}
                      decelerationRate="fast"
                      snapToAlignment="start"
                      snapToInterval={132}
                      disableIntervalMomentum={true}
                      keyExtractor={(item) => `${item.source}-${item.type}-${item.id}`}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={simStyles.card}
                          onPress={() => {
                            setCurrentContent(item);
                            setTrailerDelay(false);
                            setTrailerFinished(false);
                            loadContentDetails();
                            loadRelatedContent();
                          }}
                        >
                          <Image
                            source={{ uri: item.source === 'anilist' ? getAnimeImageUrl(item.poster_path) : getImageUrl(item.poster_path, 'w500') }}
                            style={simStyles.poster}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}
                      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
                    />
                  ) : (
                    <View style={simStyles.emptyWrap}>
                      <Ionicons name="film-outline" size={18} color="rgba(255,255,255,0.25)" />
                      <Text style={simStyles.emptyText}>Sin títulos similares disponibles</Text>
                    </View>
                  )}
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>

    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
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
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  heroSection: {
    height: 400, // Altura fija en lugar de porcentaje
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
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
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
    fontWeight: '600',
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
    color: '#999999',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 100,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 16,
    flex: 1,
  },
  relatedSection: {
    backgroundColor: '#141414',
    paddingVertical: 20,
  },
  relatedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  relatedLoading: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 200,
  },
  relatedCard: {
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  relatedPoster: {
    width: 120,
    height: 180,
  },
  noRelatedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 200,
    paddingHorizontal: 20,
  },
  noRelatedText: {
    color: '#999999',
    fontSize: 16,
    textAlign: 'center',
  },
  // Streaming styles
  streamingSection: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  streamingHeader: {
    marginBottom: 16,
  },
  streamingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  streamingSubtitle: {
    fontSize: 14,
    color: '#999999',
    fontStyle: 'italic',
  },
  streamingLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  streamingLoadingText: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 14,
  },
  seasonsContainer: {
    marginBottom: 20,
  },
  seasonPicker: {
    marginBottom: 12,
    position: 'relative',
  },
  seasonPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  seasonPickerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  seasonPickerList: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(34, 34, 34, 0.95)',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 100,
    // Elevation for Android to ensure the list sits above other content
    elevation: 12,
    // Shadow for iOS/web for visual separation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  seasonModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonModalContent: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#222',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  seasonModalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  seasonModalHeaderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  seasonModalList: {
    maxHeight: 360,
  },
  seasonPickerItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  seasonPickerItemText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  seasonContainer: {
    marginBottom: 24,
  },
  streamingSeasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  streamingSeasonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  seasonEpisodeCount: {
    fontSize: 14,
    color: '#999999',
  },
  episodesGrid: {
    gap: 8,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  episodeNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E50914',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  episodeNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  episodeInfo: {
    flex: 1,
    marginRight: 12,
  },
  episodeThumb: {
    width: 72,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: '#222'
  },
  episodeTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeDescription: {
    color: '#999999',
    fontSize: 12,
    lineHeight: 16,
  },
  episodePlayButton: {
    padding: 4,
  },
  noEpisodesContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noEpisodesText: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  noEpisodesSubtext: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
  },
  // Estilos para el estado del anime
  animeStatusContainer: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: 16,
    color: '#999999',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#333333',
  },
  statusBadgeAiring: {
    backgroundColor: '#ff4444',
  },
  statusBadgeFinished: {
    backgroundColor: '#44ff44',
  },
  statusText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statusTextAiring: {
    color: '#FFFFFF',
  },
  statusTextFinished: {
    color: '#000000',
  },
  // Estilos para información compacta
  compactInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  compactInfoItem: {
    flex: 1,
    minWidth: '30%',
    marginBottom: 12,
    paddingRight: 12,
  },
  compactInfoLabel: {
    fontSize: 12,
    color: '#999999',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  compactInfoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});

// ── HERO STYLES ─────────────────────────────────────────────────
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
    // objectPosition se aplica inline de forma dinámica (ver JSX)
  },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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
    maxWidth: 740,        // evita que el texto flote en pantallas ultrawides
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
  dot: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
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
    maxWidth: 500,        // limita el ancho del texto en desktop
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

// ── CONTINUE WATCHING CARD ──────────────────────────────────────
const continueStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: -52,
    marginBottom: 4,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.09)',
    minHeight: 84,
    position: 'relative',
    zIndex: 5,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  thumb: {
    width: 116,
    backgroundColor: '#111',
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  thumbOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  info: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    color: '#E50914',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  epTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  duration: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  // Botón horizontal premium
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E50914',
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginRight: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 112,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(0,0,0,0.35)',
    borderRadius: 0,
  },
  playBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
});

// ── INFO RÁPIDA ─────────────────────────────────────────────────
const infoStyles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#141414',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  cell: {
    flex: 1,
    minWidth: 80,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cellLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cellValue: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  statusPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  genreChipText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '500' },
});

// ── EPISODE STYLES ──────────────────────────────────────────────
const epStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  thumb: {
    width: 92,
    height: 56,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  numBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(229,9,20,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numText: { color: '#E50914', fontSize: 15, fontWeight: '800' },
  info: { flex: 1, gap: 2 },
  num: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  desc: { color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 15 },
  playWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E50914',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
  },
});

// ── SIMILAR SECTION ─────────────────────────────────────────────
const simStyles = StyleSheet.create({
  section: {
    backgroundColor: '#0f0f0f',
    paddingBottom: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  accentBar: {
    width: 3,
    height: 18,
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  card: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1c1c1c',
  },
  poster: {
    width: 110,
    height: 160,
  },
  emptyWrap: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontStyle: 'italic',
    letterSpacing: 0.1,
  },
});
