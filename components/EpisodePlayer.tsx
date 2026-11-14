import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { AnimeEpisode, VideoSource } from '../types';
import { progressApi } from '../services/progressApi';

import { EMBEDDED_PLAYER_BRIDGE } from '../utils/embeddedPlayerBridge';

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
  onProgress: (payload: { current_time: number; duration: number }, opts?: { force?: boolean }) => void;
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
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentSecond = useRef(0);

  const player = useVideoPlayer(videoUrl, p => {
    p.play();
  });

  const [playing, setPlaying] = useState(player.playing);
  const [playbackError, setPlaybackError] = useState('');
  const resumed = useRef(false);
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (player.playing) controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, [player]);
  useEffect(() => {
    const playingSubscription = player.addListener('playingChange', event => {
      setPlaying(event.isPlaying);
      resetControlsTimer();
    });
    const statusSubscription = player.addListener('statusChange', event => {
      setPlaybackError(event.status === 'error' ? event.error?.message || 'No se pudo reproducir este vídeo.' : '');
      if (event.status === 'readyToPlay' && !resumed.current && resumeTimeSeconds > 0) {
        resumed.current = true;
        player.currentTime = Math.min(resumeTimeSeconds, player.duration || resumeTimeSeconds);
      }
    });
    resetControlsTimer();
    return () => {
      playingSubscription.remove(); statusSubscription.remove();
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [player, resetControlsTimer, resumeTimeSeconds]);

  // Track progress every ~2s polling
  useEffect(() => {
    const interval = setInterval(() => {
      const cur = Math.floor(player.currentTime ?? 0);
      const dur = Math.floor(player.duration ?? 0);
      if (cur > 0 && (cur - lastSentSecond.current) >= 5) {
        lastSentSecond.current = cur;
        onProgress({ current_time: cur, duration: dur });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [player, onProgress]);

  // Advancing is tied to the actual end event, never to pausing near the end.
  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      onProgress({ current_time: Math.floor(player.currentTime || 0), duration: Math.floor(player.duration || 0) }, { force: true });
      if (hasNextEpisode && onNextEpisode) onNextEpisode();
    });
    return () => subscription.remove();
  }, [player, hasNextEpisode, onNextEpisode, onProgress]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onTouchStart={resetControlsTimer}>
      <StatusBar hidden={true} translucent={true} />
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
          {/* Top gradient */}
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
            pointerEvents="none"
          />

          {/* Top bar */}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            flexDirection: 'row', alignItems: 'center',
            paddingTop: 44, paddingHorizontal: 20, paddingBottom: 16, gap: 14,
          }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{animeTitle}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                Ep. {episode.number} — {episode.title}
              </Text>
            </View>
          </View>

          {/* Center controls */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40,
          }} pointerEvents="box-none">
            {hasPreviousEpisode && (
              <TouchableOpacity onPress={onPreviousEpisode}
                style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="play-skip-back" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={playing ? 'Pausar capítulo' : 'Reproducir capítulo'}
              onPress={() => { if (player.playing) player.pause(); else player.play(); resetControlsTimer(); }}
              style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E50914', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name={playing ? 'pause' : 'play'} size={30} color="#fff" />
            </TouchableOpacity>
            {hasNextEpisode && (
              <TouchableOpacity onPress={onNextEpisode}
                style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="play-skip-forward" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}
            pointerEvents="none"
          />
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
  const [sources, setSources] = useState<VideoSource[]>([]);
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
  const inFlightProgress = useRef<Promise<any> | null>(null);

  const episodeId = useMemo(() => {
    const n = Number(episode.id);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [episode.id]);

  const sendProgress = useCallback(
    async (payload: { current_time: number; duration: number }, options?: { force?: boolean }) => {
      if (!profileId) return;
      if (!episodeId) return;
      const currentTime = Number(payload.current_time);
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      const durationRaw = Number(payload.duration);
      const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0;

      const force = options?.force === true;
      const currentSecond = Math.floor(currentTime);
      if (!force && currentSecond <= 0) return;
      if (!force && currentSecond - lastProgressSecond.current < 5) return;
      if (inFlightProgress.current) return;

      lastProgressSecond.current = currentSecond;

      inFlightProgress.current = progressApi
        .save(profileId, {
          anime_id: animeId,
          episode_id: episodeId,
          current_time: currentSecond,
          duration: Math.floor(duration),
        })
        .catch((e) => console.log('[EpisodePlayer][progress][error]', e))
        .finally(() => { inFlightProgress.current = null; });
      await inFlightProgress.current;
    },
    [animeId, episodeId, profileId]
  );

  // ── Auto-hide UI ────────────────────────────────────────────
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    Animated.timing(uiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
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

  // ── Pantalla Completa (Inmersiva) ────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync("hidden");
        NavigationBar.setBehaviorAsync("overlay-swipe");
      } catch (e) {}
    }
    return () => {
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync("visible");
        } catch (e) {}
      }
    };
  }, []);

  // ── Orientación: forzar landscape al entrar, restaurar al salir ──
  useEffect(() => {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        .catch(() => {});
    }
    return () => {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
          .catch(() => {});
      }
    };
  }, []);

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
    try {
      setLoading(true);
      setError(null);
      setCanControlEmbed(false);
      if (episode.url) {
        const directSources: VideoSource[] = [{ url: episode.url }];
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
        <ActivityIndicator size="large" color="#e50914" />
        <Text style={styles.placeholderText}>Cargando video...</Text>
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
    const isDirectVideo = ext === 'm3u8' || ext === 'mp4' || ext === 'webm' || ext === 'mov' || /^(file|content):/i.test(videoUrl) || selectedSource.isM3U8 === true;
    
    if (!isDirectVideo) {
      return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StatusBar hidden={true} translucent={true} />
          <WebView
            ref={webViewRef}
            source={{ uri: videoUrl }}
            style={{ flex: 1 }}
            allowsFullscreenVideo
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            injectedJavaScript={EMBEDDED_PLAYER_BRIDGE}
            injectedJavaScriptBeforeContentLoaded={EMBEDDED_PLAYER_BRIDGE}
            onMessage={(event) => {
              if (event.nativeEvent.data === 'user_interaction') { showUITemporarily(); return; }
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === 'pixel:player') { setCanControlEmbed(message.canControl === true); setIsPlaying(message.playing === true); }
              } catch { /* Ignore unrelated messages from the provider. */ }
            }}
            onLoadStart={() => setWebViewLoading(true)}
            onLoadEnd={() => setWebViewLoading(false)}
            onShouldStartLoadWithRequest={(request) => {
              // Bloquear navegación a páginas de anuncios conocidas
              const url = request.url || '';
              const isAd = url.includes('doubleclick') ||
                           url.includes('googlesyndication') ||
                           url.includes('adserver') ||
                           url.includes('clickadu') ||
                           url.includes('propellerads') ||
                           url.includes('popcash') ||
                           url.includes('adcash');
              return !isAd;
            }}
          />
          {/* Indicador de carga propio del WebView */}
          {webViewLoading && (
            <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]} pointerEvents="none">
              <ActivityIndicator size="large" color="#E50914" />
              <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 13 }}>Cargando reproductor...</Text>
            </View>
          )}
          {/* Interfaz Animada */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
            <LinearGradient
              colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
              style={styles.gradTop}
              pointerEvents="none"
            />
            
            {/* Top Bar */}
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

            {canControlEmbed && <TouchableOpacity accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pausar capítulo' : 'Reproducir capítulo'}
              style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -32, marginTop: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: '#E50914', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => { webViewRef.current?.injectJavaScript('window.__pixelTogglePlayback && window.__pixelTogglePlayback(); true;'); showUITemporarily(); }}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" />
            </TouchableOpacity>}
            {/* Navigation Buttons */}
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
          </Animated.View>
        </View>
      );
    }

    return (
      <NativeVideoPlayer
        videoUrl={videoUrl}
        resumeTimeSeconds={resumeTimeSeconds}
        episode={episode}
        animeTitle={animeTitle}
        hasNextEpisode={hasNextEpisode}
        hasPreviousEpisode={hasPreviousEpisode}
        onClose={onClose}
        onNextEpisode={onNextEpisode}
        onPreviousEpisode={onPreviousEpisode}
        onProgress={sendProgress}
      />
    );
  }, [selectedSource, episode, animeTitle, hasNextEpisode, hasPreviousEpisode, onNextEpisode, onPreviousEpisode, onClose, sendProgress, canControlEmbed, isPlaying, showUI, webViewLoading, showUITemporarily, uiOpacity, resumeTimeSeconds]);

  // ── Loading / Error screens ──────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.loadingText}>Cargando episodio...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
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
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
        <StatusBar hidden />
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
      <StatusBar hidden />
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
