import { useState, useEffect, useRef } from 'react';
import {
  Platform,
  Animated,
  useWindowDimensions,
  Alert,
  Linking,
} from 'react-native';
import { ContentItem, MovieDetail, TVShowDetail, AnimeDetail, Anime, StreamingInfo, AnimeEpisode, AnimeSeason } from '../../types';
import { getImageUrl, getMovieDetails, getTVShowDetails, animeToContentItem, tmdbToContentItem } from '../../services/api';
import { getAnimeDetails, getSimilarAnime, getAnimeImageUrl, getAnimeTitle, getAnimeYear, getAnimeScore, getAnimeByGenre } from '../../services/anilistService';
import { createMockStreamingInfo, getAnimeStreamingInfo } from '../../services/animeStreamingService';
import { debugM3U, resetM3UCache } from '../../services/m3uParser';
import { catalogService } from '../../services/catalogService';
import { useProfile } from '../../contexts/ProfileContext';
import { useMyList } from '../../contexts/MyListContext';
import { canReachUrl } from '../../services/connectivity';
import { offlineDownloads } from '../../services/offlineDownloads';
import { getResumeTarget } from '../../services/resumeTarget';
import type { AnimeSeriesModalProps, UseAnimeModalReturn } from './types';

export function useAnimeModal({
  content,
  visible,
  onClose,
  onPlayEpisode,
}: AnimeSeriesModalProps): UseAnimeModalReturn {
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
          averageScore: typeof anime.rating === 'number' ? anime.rating : (parseFloat(anime.rating as unknown as string) || 0),
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

  const getTitle = (): string => {
    if (detailData) {
      if ('title' in detailData && typeof detailData.title === 'object') {
        const animeTitle = getAnimeTitle(detailData.title as any);
        return String(animeTitle || currentContent?.title || 'Sin título');
      }
      if ('title' in detailData) {
        return String(detailData.title || currentContent?.title || 'Sin título');
      }
      if ('name' in detailData) {
        return String(detailData.name || currentContent?.title || 'Sin título');
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

  return {
    currentContent,
    detailData,
    trailerKey,
    loading,
    relatedContent,
    loadingRelated,
    trailerDelay,
    trailerFinished,
    streamingInfo,
    loadingStreaming,
    selectedSeason,
    showSeasonPicker,
    isTogglingMyList,
    isTogglingDownloads,
    currentInDownloads,
    currentInMyList,
    refreshing,

    fadeAnim,
    contentFadeAnim,
    descSlideAnim,

    isSmallScreen,
    width,
    height,

    setCurrentContent,
    setTrailerDelay,
    setTrailerFinished,
    setShowSeasonPicker,
    setSelectedSeason,

    handleClose,
    handleRefresh,
    handlePlayEpisode,
    handleWatchNow,
    handlePlayTrailer,
    handleCloseTrailer,
    handleToggleList,
    handleDownloadOptions,
    handleRemoveFromDownloads,
    openExternalTrailer,
    loadContentDetails,
    loadRelatedContent,

    getTitle,
    getReleaseDate,
    getRuntime,
    getAgeRating,
    isRealAnime,
    isAnimeMovie,
    cleanDescription,
    formatRuntime,
    formatDate,
  };
}
