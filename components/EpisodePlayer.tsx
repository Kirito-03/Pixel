import Loader from './Loader';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
  AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useImmersivePlayer } from '../hooks/useImmersivePlayer';
import PlayerSystemBars from './PlayerSystemBars';
import PlaybackChrome from './PlaybackChrome';
import SeekButton from './SeekButton';
import PlaybackTimeline from './PlaybackTimeline';
import { episodePlaybackSources, isDirectPlaybackUrl } from '../services/episodePlaybackSources';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimeEpisode, VideoSource } from '../types';
import { progressApi } from '../services/progressApi';

import { EMBEDDED_PLAYER_BRIDGE, shouldAllowEmbeddedNavigation } from '../utils/embeddedPlayerBridge';

interface EpisodePlayerProps {
  episode: AnimeEpisode;
  animeTitle: string;
  animeId: number;
  seasonNumber: number;
  profileId?: number;
  resumeTimeSeconds?: number;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  hasNextEpisode?: boolean;
  hasPreviousEpisode?: boolean;
}

// ── Native Video Player (Android / iOS) ─────────────────────────────────────
interface NativePlayerProps {
  videoUrl: string;
  resumeTimeSeconds?: number;
  episode: AnimeEpisode;
  animeTitle: string;
  hasNextEpisode: boolean;
  hasPreviousEpisode: boolean;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  onProgress: (payload: { current_time: number; duration: number; position_known?: boolean }, opts?: { force?: boolean }) => void;
}

export const NativeVideoPlayer: React.FC<NativePlayerProps> = ({
  videoUrl,
  resumeTimeSeconds = 0,
  episode,
  animeTitle,
  hasNextEpisode,
  hasPreviousEpisode,
  onClose,
  onNextEpisode,
  onPreviousEpisode,
  onProgress,
}) => {
  const [showControls, setShowControls] = useState(true);
  const [timeline, setTimeline] = useState({ current_time: 0, duration: 0 });
  const scrubbing = useRef(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentSecond = useRef(0);
  const lastSentAt = useRef(0);
  const lastValidSnapshot = useRef<{ current_time: number; duration: number } | null>(null);

  // This effect is registered before Expo's auto-release cleanup.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const player = useVideoPlayer(videoUrl, p => {
    p.play();
  });

  const [playing, setPlaying] = useState(player.playing);
  const [playbackError, setPlaybackError] = useState('');
  const resumed = useRef(resumeTimeSeconds <= 0);
  useEffect(() => {
    resumed.current = resumeTimeSeconds <= 0;
    lastValidSnapshot.current = null;
    lastSentSecond.current = 0;
    lastSentAt.current = 0;
  }, [videoUrl, resumeTimeSeconds]);

  const captureSnapshot = useCallback(() => {
    if (!mounted.current || !resumed.current) return null;
    const cur = Math.floor(player.currentTime ?? 0);
    const dur = Math.floor(player.duration ?? 0);
    if (!Number.isFinite(cur) || cur < 0 || (cur === 0 && !(dur > 0))) return null;
    const snap = { current_time: cur, duration: Number.isFinite(dur) && dur > 0 ? dur : 0 };
    lastValidSnapshot.current = snap;
    return snap;
  }, [player]);

  const flushProgress = useCallback((force = true) => {
    const snap = captureSnapshot() || lastValidSnapshot.current;
    if (!snap || snap.current_time < 0) return;
    lastSentSecond.current = snap.current_time;
    lastSentAt.current = Date.now();
    onProgress({ ...snap, position_known: true }, { force });
  }, [captureSnapshot, onProgress]);

  const flushProgressRef = useRef(flushProgress);
  flushProgressRef.current = flushProgress;

  const resetControlsTimer = useCallback(() => {
    if (!mounted.current) return;
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (player.playing && !scrubbing.current) controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, [player]);
  useEffect(() => {
    setPlaying(player.playing);
    const playingSubscription = player.addListener('playingChange', event => {
      if (!mounted.current) return;
      setPlaying(event.isPlaying);
      resetControlsTimer();
      if (!event.isPlaying) {
        flushProgressRef.current(true);
      }
    });
    const statusSubscription = player.addListener('statusChange', event => {
      if (!mounted.current) return;
      setPlaybackError(event.status === 'error' ? event.error?.message || 'No se pudo reproducir este vídeo.' : '');
      if (event.status === 'readyToPlay' && !resumed.current && resumeTimeSeconds > 0) {
        resumed.current = true;
        player.currentTime = Math.min(resumeTimeSeconds, player.duration || resumeTimeSeconds);
      }
      if (event.status === 'readyToPlay') {
        const snapshot = captureSnapshot();
        if (snapshot) setTimeline(snapshot);
      }
    });
    resetControlsTimer();
    return () => {
      playingSubscription.remove(); statusSubscription.remove();
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [player, resetControlsTimer, resumeTimeSeconds]);

  // Track progress every 15s (including backward seeks)
  useEffect(() => {
    const interval = setInterval(() => {
      const snap = captureSnapshot();
      if (snap) setTimeline(snap);
      if (!snap || !player.playing) return;
      const now = Date.now();
      const moved = Math.abs(snap.current_time - lastSentSecond.current);
      const elapsed = lastSentAt.current > 0 ? now - lastSentAt.current : 0;
      if (moved >= 15 || (elapsed >= 15000 && snap.current_time !== lastSentSecond.current)) {
        lastSentSecond.current = snap.current_time;
        lastSentAt.current = now;
        onProgress({ ...snap, position_known: true });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [player, captureSnapshot, onProgress]);

  // Flush last valid snapshot on background or unmount
  useEffect(() => {
    const sub = AppState?.addEventListener?.('change', state => {
      if (state === 'background' || state === 'inactive') {
        flushProgressRef.current(true);
      }
    });
    return () => {
      sub?.remove?.();
      const snapshot = lastValidSnapshot.current;
      if (snapshot) onProgress({ ...snapshot, position_known: true }, { force: true });
    };
  }, []);

  // Advancing is tied to the actual end event, never to pausing near the end.
  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      if (!mounted.current) return;
      flushProgressRef.current(true);
      if (hasNextEpisode && onNextEpisode) onNextEpisode();
    });
    return () => subscription.remove();
  }, [player, hasNextEpisode, onNextEpisode]);

  const handleClose = useCallback(() => {
    if (!mounted.current) return;
    flushProgressRef.current(true);
    player.pause();
    onClose();
  }, [onClose, player]);

  const handleNextEpisode = useCallback(() => {
    if (!mounted.current) return;
    flushProgressRef.current(true);
    player.pause();
    onNextEpisode?.();
  }, [onNextEpisode, player]);

  const handlePreviousEpisode = useCallback(() => {
    if (!mounted.current) return;
    flushProgressRef.current(true);
    player.pause();
    onPreviousEpisode?.();
  }, [onPreviousEpisode, player]);

  const seekTo = (seconds: number) => {
    if (!mounted.current) return;
    const duration = Number(player.duration);
    if (!resumed.current || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds)) return;
    const target = Math.max(0, Math.min(duration, seconds));
    player.currentTime = target;
    setTimeline({ current_time: target, duration });
    flushProgressRef.current(true);
    resetControlsTimer();
  };
  const seekBy = (seconds: number) => { if (mounted.current) seekTo(Number(player.currentTime) + seconds); };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onTouchStart={resetControlsTimer}>
      <PlayerSystemBars /><StatusBar hidden={true} translucent={true} />
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="contain"
        nativeControls={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      />

      {playbackError ? <Text accessibilityRole="alert" style={{ color: '#fff', position: 'absolute', top: '40%', left: 24, right: 24, textAlign: 'center' }}>{playbackError}</Text> : null}
      {showControls && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <PlaybackChrome title={animeTitle} subtitle={`Episodio ${episode.number} · ${episode.title}`}
            onClose={handleClose} onPrevious={hasPreviousEpisode ? handlePreviousEpisode : undefined}
            onNext={hasNextEpisode ? handleNextEpisode : undefined} />

          {/* Center controls */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28,
          }} pointerEvents="box-none">
            <SeekButton onPress={() => seekBy(-10)} />
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={playing ? 'Pausar capítulo' : 'Reproducir capítulo'}
              onPress={() => { if (player.playing) player.pause(); else player.play(); resetControlsTimer(); }}
              style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#344544', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name={playing ? 'pause' : 'play'} size={30} color="#fff" />
            </TouchableOpacity>
            <SeekButton forward onPress={() => seekBy(10)} />
          </View>

          {/* Bottom gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
            pointerEvents="none"
          />
          <View style={{ position: 'absolute', bottom: 14, left: 24, right: 24 }}>
            <PlaybackTimeline currentTime={timeline.current_time} duration={timeline.duration} onSeek={seekTo}
              onScrubbingChange={active => {
                scrubbing.current = active;
                if (active) { if (controlsTimer.current) clearTimeout(controlsTimer.current); }
                else resetControlsTimer();
              }} />
          </View>
        </View>
      )}
    </View>
  );
};

// ── Main EpisodePlayer ───────────────────────────────────────────────────────
const EpisodePlayer: React.FC<EpisodePlayerProps> = ({
  episode,
  animeTitle,
  animeId,
  seasonNumber,
  profileId,
  resumeTimeSeconds = 0,
  onClose,
  onNextEpisode,
  onPreviousEpisode,
  hasNextEpisode = false,
  hasPreviousEpisode = false,
}) => {
  const [sources, setSources] = useState<(VideoSource & { server?: string })[]>([]);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const serverMenuOpenRef = useRef(false);
  const loadedEpisode = useRef<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canControlEmbed, setCanControlEmbed] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const webVideoRef = useRef<any>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const lastProgressSecond = useRef<number>(0);
  const lastProgressSavedAt = useRef<number>(0);
  const savedUnknownMarkerRef = useRef<boolean>(false);
  const prevEmbedPlayingRef = useRef<boolean>(false);
  const embedResumedRef = useRef(false);
  const latestSnapshotRef = useRef<{
    animeId: number;
    episodeId: number;
    episodeNumber: number;
    seasonNumber: number;
    title?: string;
    thumbnail?: string;
    current_time: number;
    duration: number;
    position_known: boolean;
  } | null>(null);
  const lastSavedStateRef = useRef<{
    episodeId: number;
    current_time: number;
    duration: number;
    position_known: boolean;
  } | null>(null);

  const episodeId = useMemo(() => {
    const n = Number(episode.id);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [episode.id]);

  const episodeThumbnail = episode.image || (episode as any).thumbnail || undefined;
  const episodeTitleMeta = animeTitle || episode.title || undefined;

  const saveProgressRecord = useCallback(
    (snap: {
      animeId: number;
      episodeId: number;
      episodeNumber: number;
      seasonNumber: number;
      title?: string;
      thumbnail?: string;
      current_time: number;
      duration: number;
      position_known: boolean;
    }) => {
      if (!profileId || !snap.episodeId || !snap.animeId) return Promise.resolve();
      lastSavedStateRef.current = {
        episodeId: snap.episodeId,
        current_time: snap.current_time,
        duration: snap.duration,
        position_known: snap.position_known,
      };
      return progressApi
        .save(profileId, {
          anime_id: snap.animeId,
          episode_id: snap.episodeId,
          current_time: snap.current_time,
          duration: snap.duration,
          position_known: snap.position_known,
          ...(Number.isFinite(snap.episodeNumber) && snap.episodeNumber >= 0 ? { episode_number: snap.episodeNumber } : {}),
          ...(Number.isFinite(snap.seasonNumber) && snap.seasonNumber >= 0 ? { season: snap.seasonNumber } : {}),
          ...(snap.title ? { title: snap.title } : {}),
          ...(snap.thumbnail ? { thumbnail: snap.thumbnail } : {}),
        })
        .catch((e) => { lastSavedStateRef.current = null; console.log('[EpisodePlayer][progress][error]', e); });
    },
    [profileId]
  );

  const sendProgress = useCallback(
    async (
      payload: { current_time: number; duration: number; position_known?: boolean },
      options?: { force?: boolean }
    ) => {
      if (!profileId || !episodeId || !animeId) return;
      const positionKnown = payload.position_known !== false;
      const force = options?.force === true;

      if (!positionKnown) {
        const marker = {
          animeId,
          episodeId,
          episodeNumber: episode.number,
          seasonNumber,
          title: episodeTitleMeta,
          thumbnail: episodeThumbnail,
          current_time: 0,
          duration: 0,
          position_known: false,
        };
        if (!latestSnapshotRef.current || !latestSnapshotRef.current.position_known) {
          latestSnapshotRef.current = marker;
        }
        if (!force && savedUnknownMarkerRef.current) return;
        savedUnknownMarkerRef.current = true;
        await saveProgressRecord(marker);
        return;
      }

      const currentTime = Number(payload.current_time);
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      const currentSecond = Math.floor(currentTime);
      if (currentSecond === 0 && (!force || payload.position_known !== true || !(payload.duration > 0))) return;

      const durationRaw = Number(payload.duration);
      const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : 0;

      const snapshot = {
        animeId,
        episodeId,
        episodeNumber: episode.number,
        seasonNumber,
        title: episodeTitleMeta,
        thumbnail: episodeThumbnail,
        current_time: currentSecond,
        duration,
        position_known: true,
      };
      latestSnapshotRef.current = snapshot;

      const now = Date.now();
      if (!force) {
        const delta = Math.abs(currentSecond - lastProgressSecond.current);
        const elapsed = lastProgressSavedAt.current > 0 ? now - lastProgressSavedAt.current : 0;
        if (delta < 15 && !(elapsed >= 15000 && currentSecond !== lastProgressSecond.current)) return;
      }

      lastProgressSecond.current = currentSecond;
      lastProgressSavedAt.current = now;
      await saveProgressRecord(snapshot);
    },
    [animeId, episodeId, episode.number, seasonNumber, episodeTitleMeta, episodeThumbnail, profileId, saveProgressRecord]
  );

  const flushLatestSnapshot = useCallback(() => {
    const snap = latestSnapshotRef.current;
    if (!snap || !profileId || !snap.episodeId || !snap.animeId) return;
    if (snap.position_known && snap.current_time < 0) return;
    const prev = lastSavedStateRef.current;
    if (
      prev &&
      prev.episodeId === snap.episodeId &&
      prev.current_time === snap.current_time &&
      prev.duration === snap.duration &&
      prev.position_known === snap.position_known
    ) {
      return;
    }
    if (!snap.position_known) {
      if (savedUnknownMarkerRef.current) return;
      savedUnknownMarkerRef.current = true;
    }
    saveProgressRecord(snap);
  }, [profileId, saveProgressRecord]);

  const flushLatestSnapshotRef = useRef(flushLatestSnapshot);
  flushLatestSnapshotRef.current = flushLatestSnapshot;

  useEffect(() => {
    const sub = AppState?.addEventListener?.('change', state => {
      if (state === 'background' || state === 'inactive') {
        flushLatestSnapshotRef.current();
      }
    });
    return () => {
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      flushLatestSnapshot();
      latestSnapshotRef.current = null;
      lastSavedStateRef.current = null;
      lastProgressSecond.current = 0;
      lastProgressSavedAt.current = 0;
      savedUnknownMarkerRef.current = false;
      prevEmbedPlayingRef.current = false;
      embedResumedRef.current = false;
    };
  }, [episodeId, animeId, profileId, saveProgressRecord]);

  const handleClose = useCallback(() => {
    flushLatestSnapshotRef.current();
    onClose();
  }, [onClose]);

  const handleNextEpisode = useCallback(() => {
    flushLatestSnapshotRef.current();
    onNextEpisode?.();
  }, [onNextEpisode]);

  const handlePreviousEpisode = useCallback(() => {
    flushLatestSnapshotRef.current();
    onPreviousEpisode?.();
  }, [onPreviousEpisode]);

  // ── Auto-hide UI ────────────────────────────────────────────
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    Animated.timing(uiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (serverMenuOpenRef.current) return;
    hideTimer.current = setTimeout(() => {
      Animated.timing(uiOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setShowUI(false)
      );
    }, 4000);
  }, [uiOpacity]);

  useEffect(() => {
    showUITemporarily();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  useImmersivePlayer();

  // ── HLS (web) ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const videoEl = webVideoRef.current as any;
    const url = selectedSource?.url || '';
    if (!videoEl || !url) return;
    const isM3U8 = /\.m3u8(\?|$)/i.test(url);
    let hls: any = null;

    function initHls() {
      const HlsCtor = (window as any).Hls;
      if (!HlsCtor?.isSupported?.()) { setError('HLS no soportado en este navegador'); return; }
      hls = new HlsCtor({ enableWorker: true, lowLatencyMode: false });
      hls.on(HlsCtor.Events.ERROR, (_event: any, data: any) => {
        if (data?.fatal) setError(`Error HLS: ${data?.details || 'fatal'}`);
      });
      hls.loadSource(url);
      hls.attachMedia(videoEl);
    }

    if (isM3U8) {
      if (videoEl.canPlayType?.('application/vnd.apple.mpegurl')) {
        videoEl.src = url; videoEl.load();
      } else if ((window as any).Hls) {
        initHls();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
        script.async = true;
        script.onload = initHls;
        script.onerror = () => setError('No se pudo cargar hls.js');
        document.head.appendChild(script);
      }
    }
    return () => { if (hls) { try { hls.destroy(); } catch {} } };
  }, [selectedSource]);

  // ── Load sources ─────────────────────────────────────────────
  useEffect(() => { loadEpisodeSources(); }, [episode.id]);

  const loadEpisodeSources = async () => {
    loadedEpisode.current = String(episode.id);
    try {
      setLoading(true);
      setError(null);
      setCanControlEmbed(false);
      setServerMenuOpen(false); serverMenuOpenRef.current = false;
      const directSources = episodePlaybackSources(episode);
      if (directSources.length) {
        setSources(directSources);
        setSelectedSource(directSources[0]);
        return;
      }
      setError('No hay una fuente disponible para este episodio');
    } catch (err) {
      setError('Error al cargar las fuentes del episodio');
    } finally {
      setLoading(false);
    }
  };

  const webContainerProps = Platform.OS === 'web'
    ? { onMouseMove: showUITemporarily, onTouchStart: showUITemporarily }
    : { onTouchStart: showUITemporarily };

  // ── Video renderer ───────────────────────────────────────────
  const renderVideoPlayer = useMemo(() => {
    if (!selectedSource) return (
      <View style={styles.videoPlaceholder}>
        <Loader onDark />
      </View>
    );

    const videoUrl = selectedSource.url || '';
    const isHls = /\.m3u8(\?|$)/.test(videoUrl);
    const urlNoQuery = videoUrl.split('?')[0];
    const ext = (urlNoQuery.split('.').pop() || '').toLowerCase();
    const mime = ext === 'm3u8' ? 'application/vnd.apple.mpegurl'
      : ext === 'mp4' ? 'video/mp4'
      : ext === 'webm' ? 'video/webm'
      : ext === 'mov' ? 'video/quicktime'
      : '';

    // ── WEB: native <video> ───────────────────────────────────
    if (Platform.OS === 'web') {
      return (
        <video
          ref={webVideoRef}
          controls
          style={styles.webVideo as any}
          preload="metadata"
          crossOrigin="anonymous"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            setIsPlaying(false);
            const el = webVideoRef.current as any;
            if (el?.duration) {
              const dur = Number.isFinite(el.duration) ? el.duration : 0;
              sendProgress({ current_time: el.currentTime || 0, duration: dur }, { force: true });
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            const el = webVideoRef.current as any;
            if (el?.duration) {
              const dur = Number.isFinite(el.duration) ? el.duration : 0;
              sendProgress({ current_time: el.currentTime || 0, duration: dur }, { force: true });
            }
            if (hasNextEpisode && onNextEpisode) onNextEpisode();
          }}
          onTimeUpdate={() => {
            const el = webVideoRef.current as any;
            if (el?.duration) {
              const dur = Number.isFinite(el.duration) ? el.duration : 0;
              sendProgress({ current_time: el.currentTime || 0, duration: dur });
            }
          }}
          onError={() => {
            const el = webVideoRef.current as any;
            const code = el?.error?.code;
            setError(`Error al reproducir el video${code ? ` (code ${code})` : ''}`);
          }}
        >
          {!isHls && (mime
            ? <source src={videoUrl} type={mime} />
            : <source src={videoUrl} />
          )}
        </video>
      );
    }

    // ── MOBILE: native expo-video ─────────────────────────────
    // Si no es un enlace directo de video (mp4, m3u8, webm), usamos WebView
    const isDirectVideo = isDirectPlaybackUrl(videoUrl) || selectedSource.isM3U8 === true;
    
    if (!isDirectVideo) {
      return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <PlayerSystemBars /><StatusBar hidden={true} translucent={true} />
          <WebView
            ref={webViewRef}
            source={{ uri: videoUrl }}
            style={{ flex: 1 }}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            injectedJavaScriptForMainFrameOnly={false}
            injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
            injectedJavaScript={EMBEDDED_PLAYER_BRIDGE}
            injectedJavaScriptBeforeContentLoaded={EMBEDDED_PLAYER_BRIDGE}
            onOpenWindow={() => {}}
            onMessage={(event) => {
              if (event.nativeEvent.data === 'user_interaction') { showUITemporarily(); return; }
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === 'pixel:player') {
                  const canControl = message.canControl === true;
                  const nowPlaying = message.playing === true;
                  const wasPlaying = prevEmbedPlayingRef.current;
                  prevEmbedPlayingRef.current = nowPlaying;
                  setCanControlEmbed(canControl);
                  setIsPlaying(nowPlaying);

                  if (canControl) {
                    const cur = Number(message.currentTime);
                    const dur = Number(message.duration);
                    const curSec = Number.isFinite(cur) && cur > 0 ? Math.floor(cur) : 0;
                    const durSec = Number.isFinite(dur) && dur > 0 ? Math.floor(dur) : 0;
                    if (!embedResumedRef.current && resumeTimeSeconds > 0) {
                      if (durSec > 0 && Number.isFinite(resumeTimeSeconds)) {
                        embedResumedRef.current = true;
                        webViewRef.current?.injectJavaScript(`window.__pixelSeekPlayback?.(${Number(resumeTimeSeconds)}); true;`);
                      }
                      return;
                    }
                    if (curSec > 0) {
                      const pausedNow = wasPlaying && !nowPlaying;
                      sendProgress({ current_time: curSec, duration: durSec, position_known: true }, { force: pausedNow });
                    }
                  } else {
                    sendProgress({ current_time: 0, duration: 0, position_known: false });
                  }
                }
              } catch { /* Ignore unrelated messages from the provider. */ }
            }}
            onLoadStart={() => setWebViewLoading(true)}
            onLoadEnd={() => setWebViewLoading(false)}
            onShouldStartLoadWithRequest={(request) =>
              shouldAllowEmbeddedNavigation(request.url || '', videoUrl)
            }
          />
          {/* Indicador de carga propio del WebView */}
          {webViewLoading && (
            <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]} pointerEvents="none">
              <Loader onDark />
            </View>
          )}
          {/* Interfaz Animada */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
            <PlaybackChrome title={animeTitle} subtitle={`Temporada ${seasonNumber || 1} · Episodio ${episode.number}`}
              onClose={handleClose} servers={sources} selectedIndex={Math.max(0, sources.indexOf(selectedSource!))}
              menuOpen={serverMenuOpen} onMenuChange={open => { setServerMenuOpen(open); serverMenuOpenRef.current = open; showUITemporarily(); }}
              onSelectServer={index => { flushLatestSnapshotRef.current(); setSelectedSource(sources[index]); setCanControlEmbed(false); setWebViewLoading(true); }}
              onPrevious={hasPreviousEpisode ? handlePreviousEpisode : undefined} onNext={hasNextEpisode ? handleNextEpisode : undefined} />

            {canControlEmbed && <TouchableOpacity accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pausar capítulo' : 'Reproducir capítulo'}
              style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -32, marginTop: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: '#344544', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => { webViewRef.current?.injectJavaScript('window.__pixelTogglePlayback && window.__pixelTogglePlayback(); true;'); showUITemporarily(); }}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" />
            </TouchableOpacity>}
          </Animated.View>
        </View>
      );
    }

    return (
      <NativeVideoPlayer
        key={`${profileId}:${animeId}:${episodeId}:${videoUrl}`}
        videoUrl={videoUrl}
        resumeTimeSeconds={resumeTimeSeconds}
        episode={episode}
        animeTitle={animeTitle}
        hasNextEpisode={hasNextEpisode}
        hasPreviousEpisode={hasPreviousEpisode}
        onClose={handleClose}
        onNextEpisode={onNextEpisode ? handleNextEpisode : undefined}
        onPreviousEpisode={onPreviousEpisode ? handlePreviousEpisode : undefined}
        onProgress={sendProgress}
      />
    );
  }, [selectedSource, episode, animeTitle, hasNextEpisode, hasPreviousEpisode, onNextEpisode, onPreviousEpisode, handleClose, handleNextEpisode, handlePreviousEpisode, sendProgress, canControlEmbed, isPlaying, showUI, webViewLoading, showUITemporarily, uiOpacity, resumeTimeSeconds, serverMenuOpen, sources, seasonNumber]);

  // ── Loading / Error screens ──────────────────────────────────
  if (loading || loadedEpisode.current !== String(episode.id)) {
    return (
      <View style={styles.container}>
        <PlayerSystemBars /><StatusBar hidden />
        <View style={styles.loadingContainer}>
          <Loader onDark />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <PlayerSystemBars /><StatusBar hidden />
        <LinearGradient
          colors={['#0a0a0a', '#1a0000', '#0a0a0a']}
          style={styles.errorContainer}
        >
          <Ionicons name="alert-circle" size={56} color="#e50914" />
          <Text style={styles.errorTitle}>Error de reproducción</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadEpisodeSources}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>← Volver</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  // ── Web: custom overlay UI ────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container} {...webContainerProps as any}>
        <PlayerSystemBars /><StatusBar hidden />
        <View style={styles.videoFullscreen}>
          {renderVideoPlayer}
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
            style={styles.gradTop}
            pointerEvents="none"
          />
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={onClose}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleBlock}>
              <Text style={styles.animeTitleOverlay} numberOfLines={1}>{animeTitle}</Text>
              <Text style={styles.episodeTitleOverlay} numberOfLines={1}>
                Ep. {episode.number} — {episode.title}
              </Text>
            </View>
          </View>
          {hasPreviousEpisode && (
            <TouchableOpacity style={[styles.floatNav, styles.floatNavLeft]} onPress={onPreviousEpisode}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          {hasNextEpisode && (
            <TouchableOpacity style={[styles.floatNav, styles.floatNavRight]} onPress={onNextEpisode}>
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
            style={styles.gradBottom}
            pointerEvents="none"
          />
        </Animated.View>
      </View>
    );
  }

  // ── Mobile: NativeVideoPlayer fills entire screen ────────────
  return (
    <View style={styles.container}>
      <PlayerSystemBars /><StatusBar hidden />
      <View style={styles.videoFullscreen}>
        {renderVideoPlayer}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { color: 'rgba(255,255,255,0.55)', marginTop: 14, fontSize: 13, letterSpacing: 0.2 },

  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 10, letterSpacing: -0.3 },
  errorText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 21 },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#e50914', paddingHorizontal: 26, paddingVertical: 13,
    borderRadius: 8, marginBottom: 14,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  closeButton: { paddingHorizontal: 24, paddingVertical: 10 },
  closeButtonText: { color: 'rgba(255,255,255,0.38)', fontSize: 13 },

  videoFullscreen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  webView: { flex: 1, backgroundColor: '#000' },
  webVideo: {
    width: '100%', height: '100%',
    backgroundColor: '#000', display: 'block',
    outline: 'none',
  } as any,
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  placeholderText: { color: 'rgba(255,255,255,0.5)', marginTop: 14, fontSize: 14 },

  gradTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 180,
    pointerEvents: 'none' as any,
  },
  gradBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 200,
    pointerEvents: 'none' as any,
  },

  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 16,
  },
  backBtn: {
    width: 42, height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBlock: { flex: 1 },
  animeTitleOverlay: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  episodeTitleOverlay: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 3, fontWeight: '400' },

  floatNav: {
    position: 'absolute',
    top: '50%' as any,
    width: 54, height: 54,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginTop: -27,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  floatNavLeft: { left: 24 },
  floatNavRight: { right: 24 },
});

export default EpisodePlayer;
