import { briefSynopsis, cleanSynopsisText } from '../utils/briefSynopsis';
import MovieRow from './MovieRow';
import TrailerPreview from './TrailerPreview';
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
  AppState,
  Dimensions,
  Animated,
  FlatList,
  Modal,
  useWindowDimensions,
  RefreshControl,
  Alert,
  Pressable,
  Linking,
  BackHandler,
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
import { seriesPlaybackTarget } from '../services/seriesPlaybackTarget';
import { animeModalPalette } from './AnimeSeriesModalStyles';
import { useTheme } from '../contexts/ThemeContext';
import Loader from './Loader';
import AnimeArtwork from './AnimeArtwork';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AnimeSeriesModalProps {
  content: ContentItem | null;
  visible: boolean;
  onClose: () => void;
  playback?: React.ReactNode;
  onClosePlayback?: () => void;
  onPlayEpisode?: (episode: AnimeEpisode, season: AnimeSeason, resumeTimeSeconds?: number) => void;
}

export default function AnimeSeriesModal({
  content,
  visible: modalVisible,
  onClose,
  onPlayEpisode,
  playback,
  onClosePlayback,
}: AnimeSeriesModalProps) {
  const { colors, theme } = useTheme();
  const { styles, heroStyles, continueStyles, infoStyles, epStyles, simStyles } = React.useMemo(() => animeModalPalette(colors), [colors]);
  const visible = modalVisible && !playback;
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const detailScrollRef = useRef<ScrollView>(null);
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
  const [loadingStreaming, setLoadingStreaming] = useState(true);
  const [showEpisodePlayer, setShowEpisodePlayer] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<AnimeEpisode | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<AnimeSeason | null>(null);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [localTogglingMyList, setIsTogglingMyList] = useState(false);
  const [isTogglingDownloads, setIsTogglingDownloads] = useState(false);
  const [currentInDownloads, setCurrentInDownloads] = useState(false);

  const { currentProfile } = useProfile();
  const { isInMyList, toggleMyList, isUpdatingMyList, loading: listLoading } = useMyList();

  const { width, height } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const androidCompact = Platform.OS === 'android' && isSmallScreen;
  const insets = useSafeAreaInsets();
  const [continueTarget, setContinueTarget] = useState<ReturnType<typeof seriesPlaybackTarget>>(null);
  const [loadingContinue, setLoadingContinue] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setContinueTarget(null);
    if (!visible || currentContent?.type !== 'anime' || !streamingInfo || loadingStreaming) return;
    const seasons = streamingInfo.seasons;
    setLoadingContinue(true);
    const resolve = async () => {
      try {
        const resume = currentProfile?.id ? await getResumeTarget(Number(currentContent.id), Number(currentProfile.id)) : undefined;
        if (!cancelled) setContinueTarget(seriesPlaybackTarget(seasons, resume));
      } catch { if (!cancelled) setContinueTarget(seriesPlaybackTarget(seasons)); }
      finally { if (!cancelled) setLoadingContinue(false); }
    };
    void resolve();
    return () => { cancelled = true; };
  }, [visible, currentContent?.id, currentProfile?.id, streamingInfo, loadingStreaming, showEpisodePlayer]);
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
  const isTogglingMyList = localTogglingMyList || listLoading || (currentContent ? isUpdatingMyList(currentContent.id, normalizedTypeForCurrentContent) : false);

  useEffect(() => {
    if (content) {
      setCurrentContent(content);
      setDetailData(null);
      setStreamingInfo(null);
      setLoadingStreaming(true);
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
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.dispatchEvent(new Event('pixel:close-previews'));
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
  }, [visible, currentContent]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible || !trailerKey || trailerFinished) return;
    const timer = setTimeout(() => { if (AppState.currentState === 'active') setTrailerDelay(true); }, 3000);
    return () => clearTimeout(timer);
  }, [visible, currentContent?.id, trailerKey, trailerFinished]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { setTrailerDelay(false); setTrailerFinished(true); }
    });
    return () => subscription.remove();
  }, []);

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
          trailer: anime.trailer_id ? { id: anime.trailer_id, site: anime.trailer_site || 'youtube' } : undefined,
          description: anime.description || '',
          translation_status: anime.translation_status,
          coverImage: {
            large: anime.poster_url || '',
            medium: anime.poster_url || '',
          },
          bannerImage: anime.banner_url || undefined,
          startDate: { year: 0 },
          averageScore: typeof anime.rating === 'number' ? anime.rating : 0,
          episodes: typeof anime.total_episodes === 'number' ? anime.total_episodes : undefined,
          status: String(anime.status || 'UNKNOWN').trim().toUpperCase().replace(/[\s-]+/g, '_'),
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
          image: ep.thumbnail_url || undefined,
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
        status: String(anime.status || 'UNKNOWN').trim().toUpperCase().replace(/[\s-]+/g, '_'),
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

    setLoadingRelated(true);
    try {
      let similar: any[] = [];
      let recommended: any[] = [];

      if (currentContent.type === 'anime') {
        try {
          const genres = currentContent.genres || [];
          if (genres.length > 0) {
            const response = await catalogService.getAnimeList({ genre: genres[0], limit: 15 });
            similar = (response.data || []).filter(a => String(a.id) !== String(currentContent.id));
          } else {
            const response = await catalogService.getAnimeList({ limit: 15 });
            similar = (response.data || []).filter(a => String(a.id) !== String(currentContent.id));
          }
        } catch (error) {
          console.log('Error loading related anime');
        }
      } else if (currentContent.type === 'movie') {
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
      }

      const combined = [...similar, ...recommended];
      const unique = combined.filter((item, index, self) => index === self.findIndex(t => String(t.id) === String(item.id)));

      // Mapear a ContentItem unificado según el tipo
      let mapped: ContentItem[] = [];
      if (currentContent.type === 'anime') {
        mapped = unique.map((anime: any) => ({
          id: Number(anime.id),
          type: 'anime',
          title: anime.title || anime.title_romaji || 'Sin título',
          overview: anime.description || '',
          poster_path: anime.poster_url || '',
          backdrop_path: anime.banner_url || anime.poster_url || '',
          release_date: anime.release_date || '',
          vote_average: typeof anime.rating === 'number' ? anime.rating : 0,
          source: 'anilist',
          trailer_id: anime.trailer_id, trailer_site: anime.trailer_site, trailer_checked_at: anime.trailer_checked_at,
          genres: Array.isArray(anime.genres) ? anime.genres : [],
        }));
      } else if (currentContent.type === 'movie') {
        mapped = unique.map((movie: any) => tmdbToContentItem(movie as any, 'movie'));
      } else if (currentContent.type === 'tv') {
        mapped = unique.map((show: any) => tmdbToContentItem(show as any, 'tv'));
      }

      setRelatedContent(mapped.slice(0, 15));
    } catch (error) {
      console.error('Error loading related content:', error);
      setRelatedContent([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  // Episode handling functions
  const handlePlayEpisode = (episode: AnimeEpisode, season: AnimeSeason, resumeTimeSeconds?: number) => {
    setTrailerDelay(false);
    setTrailerFinished(true);
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
  const [expandedSynopsis, setExpandedSynopsis] = useState(false);
  useEffect(() => setExpandedSynopsis(false), [currentContent?.id]);
  const fullSynopsis = String((detailData as any)?.description || currentContent?.overview || '');

  const cleanDescription = (description: string): string => cleanSynopsisText(description);

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

  if (!modalVisible || !currentContent) {
    return null;
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={playback ? onClosePlayback : handleClose}
    >
      {playback ? <View style={{ flex: 1, backgroundColor: '#000' }}>{playback}</View> : (() => {
        const hasLandscapeBanner = !isSmallScreen && Boolean(
          currentContent?.type === 'anime'
            ? (detailData as any)?.bannerImage || currentContent?.backdrop_path
            : currentContent?.backdrop_path
        );
        const isLight = theme === 'light';
        const lightPortrait = isLight;
        const heroBg = isLight ? colors.background : '#050505';
        return (
      <Animated.View style={[styles.container, { opacity: fadeAnim, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style={theme === 'light' ? 'dark' : 'light'} translucent />

        <Animated.View style={[styles.content, { opacity: contentFadeAnim, maxWidth: undefined, maxHeight: '100%', borderRadius: 0, overflow: 'hidden' }]}>
          {/* Botón cerrar estilo Pixel */}
          <>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar detalles" style={[styles.closeButton, lightPortrait && { backgroundColor: 'rgba(0,0,0,0.08)' }, Platform.OS === 'android' && { top: insets.top + 12 }]} onPress={handleClose}>
              <Ionicons name="close" size={28} color={lightPortrait ? colors.text : '#FFFFFF'} />
            </TouchableOpacity>
          </>

          <ScrollView
            ref={detailScrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            bounces={true}
            onScroll={event => { if (event.nativeEvent.contentOffset.y > 200) { setTrailerDelay(false); setTrailerFinished(true); } }}
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
            <View style={[heroStyles.heroSection, androidCompact ? { height: undefined, minHeight: trailerDelay ? undefined : 500 } : { height: isSmallScreen ? Math.min(height * 0.55, 430) : Math.min(height * 0.62, 560) }]}>
              {/* Backdrop + gradiente cinematográfico */}
              {trailerDelay && trailerKey && !trailerFinished ? (
                <View style={[styles.trailerBackground, { paddingTop: 40 }, androidCompact && { position: 'relative', height: undefined, paddingTop: insets.top + 64, paddingBottom: 12 }]}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Detener tráiler" style={[styles.trailerCloseButton, { top: 4, left: 16, paddingVertical: 4 }, androidCompact && { position: 'relative', top: 0, left: 0, alignSelf: 'flex-start', marginLeft: 16, marginBottom: 10, minHeight: 44 }]} onPress={handleCloseTrailer}>
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                    <Text style={styles.trailerCloseText}>Detener tráiler</Text>
                  </TouchableOpacity>
                  {androidCompact ? <View style={{ width: '100%', aspectRatio: 16 / 9 }}><TrailerPreview id={trailerKey} onEnded={handleCloseTrailer} /></View> : <TrailerPreview id={trailerKey} onEnded={handleCloseTrailer} />}
                </View>
              ) : (
                <>
                  <AnimeArtwork
                    backgroundColor={heroBg}
                    banner={isSmallScreen ? undefined : (
                      currentContent?.type === 'anime'
                        ? (detailData as any)?.bannerImage || currentContent?.backdrop_path || undefined
                        : currentContent?.backdrop_path ? getImageUrl(currentContent.backdrop_path, 'original') : undefined
                    )}
                    poster={currentContent?.type === 'anime'
                      ? (detailData as any)?.coverImage?.extraLarge || (detailData as any)?.coverImage?.large || currentContent?.poster_path || undefined
                      : currentContent?.poster_path ? getImageUrl(currentContent.poster_path, 'original') : undefined}
                    position={isSmallScreen
                      ? ((currentContent as any)?.poster_position || '50% 18%')
                      : (currentContent as any)?.banner_position}
                  />
                  {/* En modo claro sin degradado negro: transición suave al fondo claro; en modo oscuro conserva sombreado cinematográfico */}
                  {isLight && hasLandscapeBanner && (
                    <LinearGradient
                      colors={['rgba(255,255,255,0.82)', 'rgba(255,255,255,0.38)', 'transparent']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      locations={[0, 0.52, 0.85]}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <LinearGradient
                    colors={isLight ? ['transparent', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.58)', colors.background] : [
                      'rgba(0,0,0,0.22)',
                      'rgba(0,0,0,0.12)',
                      'rgba(0,0,0,0.52)',
                      'rgba(0,0,0,0.78)',
                      colors.background,
                    ]}
                    locations={isLight ? [0, 0.58, 0.86, 1] : [0, 0.45, 0.72, 0.9, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                </>
              )}

              {/* Contenido sobre el backdrop */}
              {!trailerDelay && (
                <View style={[heroStyles.heroContent, androidCompact && { position: 'relative', top: undefined, bottom: undefined, right: undefined, width: '100%', transform: [{ translateY: 0 }], paddingTop: insets.top + 88, paddingBottom: 28, paddingHorizontal: 20, maxWidth: undefined }, !isSmallScreen && { left: Math.max(24, (width - 1120) / 2), maxWidth: 740 }] }>
                  {/* Rating + año + estado */}
                  <View style={heroStyles.metaRow}>
                    {currentContent?.vote_average != null && currentContent.vote_average > 0 && (
                      <View style={heroStyles.ratingPill}>
                        <Ionicons name="star" size={11} color="#FFD700" />
                        <Text style={heroStyles.ratingText}>{currentContent.vote_average.toFixed(1)}</Text>
                      </View>
                    )}
                    {getReleaseDate() && (
                      <Text style={[heroStyles.metaText, lightPortrait && { color: colors.textSecondary }]}>{new Date(getReleaseDate()).getFullYear()}</Text>
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
                      <Text style={[heroStyles.metaText, lightPortrait && { color: colors.textSecondary }]}>{(detailData as any).episodes} ep.</Text>
                    )}
                  </View>

                  {/* Título */}
                  <Text style={[heroStyles.title, { fontSize: isSmallScreen ? 24 : 34 }, lightPortrait && { color: colors.text }]} numberOfLines={2}>
                    {String(getTitle())}
                  </Text>

                  {/* Géneros en chips */}
                  {detailData?.genres && detailData.genres.length > 0 && (
                    <View style={heroStyles.genreRow}>
                      {detailData.genres.slice(0, 4).map((g: any, i: number) => (
                        <View key={i} style={[heroStyles.genreChip, lightPortrait && { backgroundColor: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.12)' }]}>
                          <Text style={[heroStyles.genreChipText, lightPortrait && { color: colors.text }]}>{typeof g === 'string' ? g : g.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Descripción */}
                  <Animated.View style={{ transform: [{ translateY: descSlideAnim }] }}>
                    {currentContent?.type === 'anime' && (loading || !detailData) ? (
                      <Loader />
                    ) : (
                      <Text style={[heroStyles.overview, lightPortrait && { color: colors.textSecondary }]} numberOfLines={2}>
                        {briefSynopsis(cleanDescription(
                          currentContent?.type === 'anime' && detailData && 'description' in detailData
                            ? (detailData as any).description || currentContent?.overview || ''
                            : currentContent?.overview || ''
                        ))}
                      </Text>
                    )}
                  </Animated.View>

                  {/* Botones de acción */}
                  {currentContent?.type === 'anime' && (isRealAnime() || isAnimeMovie()) && (
                    <View style={[heroStyles.actionRow, androidCompact && { flexWrap: 'nowrap', width: '100%', gap: 8 }]}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reproducir anime" disabled={loadingStreaming || !streamingInfo?.seasons?.some(s => s.episodes.length > 0)} style={[heroStyles.btnPlay, lightPortrait && { backgroundColor: '#111111' }, androidCompact && { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 8, justifyContent: 'center' }, (!streamingInfo?.seasons?.some(s => s.episodes.length > 0)) && { opacity: 0.45 }]} onPress={handleWatchNow}>
                        <Ionicons name="play" size={18} color={lightPortrait ? '#FFFFFF' : '#111111'} />
                        <Text numberOfLines={1} style={[heroStyles.btnPlayText, { color: lightPortrait ? '#FFFFFF' : '#111111' }, androidCompact && { fontSize: 13, flexShrink: 1 }]}>{androidCompact ? 'Ver ahora' : 'Reproducir'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[heroStyles.btnSecondary, lightPortrait && { backgroundColor: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.14)' }, androidCompact && { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 8, justifyContent: 'center' }, isTogglingMyList && { opacity: 0.6 }]}
                        accessibilityRole="button" accessibilityLabel={currentInMyList ? "Quitar de Mi Lista" : "Añadir a Mi Lista"}
                        onPress={handleToggleList}
                        accessibilityState={{ busy: isTogglingMyList, disabled: isTogglingMyList }} disabled={isTogglingMyList}
                      >
                        {isTogglingMyList
                          ? <ActivityIndicator size="small" color={lightPortrait ? colors.text : '#FFFFFF'} />
                          : <Ionicons name={currentInMyList ? 'checkmark' : 'add'} size={18} color={lightPortrait ? colors.text : '#FFFFFF'} />}
                        <Text numberOfLines={1} style={[heroStyles.btnSecondaryText, lightPortrait && { color: colors.text }, androidCompact && { flexShrink: 1, fontSize: 13 }]}>
                          {isTogglingMyList ? 'Guardando…' : currentInMyList ? 'En mi lista' : 'Mi lista'}
                        </Text>
                      </TouchableOpacity>

                      {trailerKey && (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver tráiler" style={[heroStyles.btnIcon, lightPortrait && { backgroundColor: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.14)' }, androidCompact && { width: 48, minHeight: 48, paddingHorizontal: 0, justifyContent: 'center' }]} onPress={handlePlayTrailer}>
                          <Ionicons name="play-circle-outline" size={22} color={lightPortrait ? colors.text : '#FFFFFF'} />
                          {!androidCompact && <Text style={[heroStyles.btnIconText, lightPortrait && { color: colors.text }]}>Trailer</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center' }}>
            {/* ── TARJETA CONTINUAR VIENDO ── */}
            {currentContent?.type === 'anime' && continueTarget && !loadingStreaming && (() => {
              const { episode: nextEp, season: targetSeason, resumeTime } = continueTarget;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Ver episodio ${nextEp.number} de la temporada ${targetSeason.season}`}
                  accessibilityState={{ busy: loadingContinue, disabled: loadingContinue }} disabled={loadingContinue}
                  style={[continueStyles.card, Platform.OS === 'android' && { marginTop: 0 }]}
                  onPress={() => handlePlayEpisode(nextEp, targetSeason, resumeTime)}
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
                    <Text style={continueStyles.label}>{resumeTime > 0 ? 'CONTINUAR VIENDO' : 'VER EPISODIO'}</Text>
                    <Text style={continueStyles.epTitle} numberOfLines={1}>
                      Ep. {nextEp.number} — {nextEp.title}
                    </Text>
                    <Text style={continueStyles.duration}>Temporada {targetSeason.season}{resumeTime > 0 ? ` · Minuto ${Math.floor(resumeTime / 60)}` : ''}</Text>
                  </View>

                  {/* CTA horizontal premium */}
                  <View style={continueStyles.playBtn}>
                    <Ionicons name="play" size={16} color="#181818" />
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

              {fullSynopsis ? <View style={{ paddingHorizontal: 24, paddingBottom: 20, gap: 10 }}>
                {(detailData as any)?.translation_status === 'pending' ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Sinopsis original · traducción al español pendiente</Text> : null}
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expandedSynopsis }} onPress={() => setExpandedSynopsis(value => !value)} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{expandedSynopsis ? 'Ocultar sinopsis' : 'Leer sinopsis completa'}</Text>
                </TouchableOpacity>
                {expandedSynopsis ? <Text style={{ color: colors.textSecondary, lineHeight: 23, fontSize: 14 }}>{cleanDescription(fullSynopsis)}</Text> : null}
              </View> : null}

              {/* Streaming Episodes for Anime - mostrar si hay datos del M3U */}
              {currentContent?.type === 'anime' && (loadingStreaming || (streamingInfo && Array.isArray(streamingInfo.seasons) && streamingInfo.seasons.length > 0)) && (
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

                  {/* Botones de acción eliminados porque ya existen en la cabecera principal */}

                  {loadingStreaming ? (
                    <View style={styles.streamingLoading}>
                      <Loader />
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
                            <Ionicons name={showSeasonPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text} />
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
                                    episodesToShow = selectedSeason.episodes;
                                  }
                                }
                                return episodesToShow.length;
                              })()} episodios
                            </Text>
                          </View>

                          <View style={[styles.episodesGrid, { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }]}>
                            {(() => {
                              let episodesToShow = selectedSeason.episodes;
                              if (detailData && 'status' in detailData) {
                                const animeStatus = (detailData as AnimeDetail).status;
                                if (animeStatus === 'RELEASING') {
                                  episodesToShow = selectedSeason.episodes;
                                }
                              }
                              return episodesToShow.map((episode) => (
                                <TouchableOpacity
                                  key={episode.id}
                                  accessibilityRole="button" accessibilityLabel={`Ver episodio ${episode.number}`}
                                  style={[epStyles.card, { width: isSmallScreen ? '100%' : '48.5%' }]}
                                  onPress={() => handlePlayEpisode(episode, selectedSeason)}
                                  {...(Platform.OS === 'web' ? {
                                    // @ts-ignore
                                    onMouseEnter: (e: any) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; },
                                    onMouseLeave: (e: any) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; },
                                  } : {})}
                                >
                                  {/* Miniatura horizontal real o alternativa neutra con etiqueta pequeña */}
                                  <View style={[epStyles.thumbWrap, { backgroundColor: colors.surfaceElevated }]}>
                                    {episode.image ? (
                                      <Image
                                        source={{ uri: episode.image }}
                                        style={epStyles.thumb}
                                        resizeMode="cover"
                                      />
                                    ) : (
                                      <View style={epStyles.thumbPlaceholder}>
                                        <Ionicons name="film-outline" size={20} color={colors.textMuted} />
                                      </View>
                                    )}
                                    <View style={epStyles.thumbBadge}>
                                      <Text style={epStyles.thumbBadgeText}>{episode.number}</Text>
                                    </View>
                                  </View>

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
              {currentContent?.type === 'anime' && !loadingStreaming && (!streamingInfo || !Array.isArray(streamingInfo.seasons) || streamingInfo.seasons.length === 0) && (
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
                    <MovieRow showTitle={false} title="Recomendados para ti" movies={relatedContent} onMoviePress={(id) => {
                      const item = relatedContent.find(x => x.id === id);
                      if (!item) return;
                      setTrailerDelay(false);
                      setTrailerFinished(false);
                      setStreamingInfo(null);
                      setSelectedSeason(null);
                      setLoadingStreaming(true);
                      setTrailerKey(null);
                      detailScrollRef.current?.scrollTo({ y: 0, animated: false });
                      setCurrentContent(item);
                    }} />
                  ) : (
                    <View style={simStyles.emptyWrap}>
                      <Ionicons name="film-outline" size={18} color="rgba(255,255,255,0.25)" />
                      <Text style={simStyles.emptyText}>Sin títulos similares disponibles</Text>
                    </View>
                  )}
            </View>
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
        );
      })()}

    </Modal>
  );
}

