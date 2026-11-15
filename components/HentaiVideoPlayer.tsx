import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useImmersivePlayer } from '../hooks/useImmersivePlayer';
import PlayerSystemBars from './PlayerSystemBars';
import PlaybackChrome from './PlaybackChrome';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { EMBEDDED_PLAYER_BRIDGE, shouldAllowEmbeddedNavigation } from '../utils/embeddedPlayerBridge';

interface VideoServer {
  server: string;
  url: string;
}

interface HentaiVideoPlayerProps {
  animeTitle: string;
  episodeNumber: number;
  servers: VideoServer[];
  onClose: () => void;
  hasPreviousEpisode?: boolean;
  hasNextEpisode?: boolean;
  previousEpisodeNumber?: number | null;
  nextEpisodeNumber?: number | null;
  onPreviousEpisode?: () => void;
  onNextEpisode?: () => void;
  loadingServers?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function HentaiVideoPlayer({
  animeTitle,
  episodeNumber,
  servers,
  onClose,
  hasPreviousEpisode = false,
  hasNextEpisode = false,
  previousEpisodeNumber = null,
  nextEpisodeNumber = null,
  onPreviousEpisode,
  onNextEpisode,
  loadingServers = false,
  error = null,
  onRetry,
}: HentaiVideoPlayerProps) {
  const isWeb = Platform.OS === 'web';
  useImmersivePlayer();
  const [activeServer, setActiveServer] = useState<VideoServer | null>(
    servers.length > 0 ? servers[0] : null
  );
  const [loading, setLoading] = useState(servers.length > 0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);
  const serverMenuOpenRef = useRef(false);
  serverMenuOpenRef.current = serverMenuOpen;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (isPausedRef.current || serverMenuOpenRef.current) return;
    hideTimerRef.current = setTimeout(() => {
      if (isPausedRef.current || serverMenuOpenRef.current) return;
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !isPausedRef.current && !serverMenuOpenRef.current) {
          setControlsVisible(false);
        }
      });
    }, 3500);
  }, [clearHideTimer, controlsOpacity]);

  const showControls = useCallback(
    (autoHide = true) => {
      clearHideTimer();
      setControlsVisible(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      if (autoHide && !isPausedRef.current && !serverMenuOpenRef.current) {
        scheduleHide();
      }
    },
    [clearHideTimer, controlsOpacity, scheduleHide]
  );

  useEffect(() => {
    const nextServer = servers.length > 0 ? servers[0] : null;
    setActiveServer(nextServer);
    setLoading(nextServer !== null);
    setServerMenuOpen(false);
    isPausedRef.current = false;
    showControls(true);
  }, [episodeNumber, servers, showControls]);

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  const handleClose = useCallback(() => {
    clearHideTimer();
    onClose();
  }, [clearHideTimer, isWeb, onClose]);

  const webMouseProps = isWeb
    ? ({
        onMouseMove: () => showControls(true),
      } as any)
    : {};

  return (
    <View style={styles.container} {...webMouseProps}>
      <PlayerSystemBars />
      {!isWeb && <StatusBar hidden={true} translucent={true} />}

      {/* Fullscreen Video Area */}
      <View style={styles.videoContainer}>
        {loadingServers ? (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color="#a9c0bd" />
            <Text style={styles.statusText}>Cargando episodio {episodeNumber}...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={36} color="#a9c0bd" />
            <Text style={styles.errorText}>{error}</Text>
            {onRetry && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Reintentar carga de servidores"
                style={[styles.retryButton, isWeb && ({ cursor: 'pointer' } as any)]}
                onPress={onRetry}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : activeServer ? (
          <>
            {loading && (
              <View style={styles.loaderContainer} pointerEvents="none">
                <ActivityIndicator size="large" color="#a9c0bd" />
              </View>
            )}

            {isWeb ? (
              <iframe
                key={`${episodeNumber}-${activeServer.server}-${activeServer.url}`}
                src={activeServer.url}
                style={styles.iframe as any}
                allowFullScreen
                frameBorder="0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                onLoad={() => {
                  setLoading(false);
                  showControls(true);
                }}
              />
            ) : (
              <WebView
                key={`${episodeNumber}-${activeServer.server}-${activeServer.url}`}
                source={{ uri: activeServer.url }}
                style={styles.webview}
                allowsFullscreenVideo={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                javaScriptCanOpenWindowsAutomatically={false}
                injectedJavaScriptForMainFrameOnly={false}
                injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
                injectedJavaScript={EMBEDDED_PLAYER_BRIDGE}
                injectedJavaScriptBeforeContentLoaded={EMBEDDED_PLAYER_BRIDGE}
                onOpenWindow={() => {}}
                onMessage={(event) => {
                  if (event.nativeEvent.data === 'user_interaction') {
                    showControls(true);
                    return;
                  }
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (msg?.type === 'pixel:player' && msg.canControl) {
                      if (!msg.playing && !isPausedRef.current) {
                        isPausedRef.current = true;
                        showControls(false);
                      } else if (msg.playing && isPausedRef.current) {
                        isPausedRef.current = false;
                        showControls(true);
                      }
                    }
                  } catch {
                    // Ignore unrelated messages
                  }
                }}
                onShouldStartLoadWithRequest={(request) =>
                  shouldAllowEmbeddedNavigation(request.url || '', activeServer.url)
                }
                onLoadEnd={() => {
                  setLoading(false);
                  showControls(true);
                }}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={[styles.loaderContainer, { backgroundColor: '#000' }]}>
                    <ActivityIndicator size="large" color="#a9c0bd" />
                  </View>
                )}
              />
            )}
          </>
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>No hay servidores disponibles</Text>
            {onRetry && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Reintentar carga de servidores"
                style={[styles.retryButton, isWeb && ({ cursor: 'pointer' } as any)]}
                onPress={onRetry}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Subtle corner/top trigger when controls are faded out */}
      {!controlsVisible && (
        <View style={styles.hiddenTriggersRow} pointerEvents="box-none">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Mostrar controles del reproductor"
            style={styles.hiddenTopStrip}
            activeOpacity={1}
            onPress={() => showControls(true)}
            {...(isWeb ? ({ onMouseEnter: () => showControls(true) } as any) : {})}
          />

        </View>
      )}

      {/* Auto-hiding Floating Overlay (Header + Corner Server Picker) */}
      <Animated.View
        style={[styles.overlayWrap, { opacity: controlsOpacity }]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        <PlaybackChrome title={animeTitle} subtitle={`Episodio ${episodeNumber}`} onClose={handleClose}
          servers={!loadingServers && !error ? servers : []} selectedIndex={Math.max(0, servers.indexOf(activeServer!))}
          menuOpen={serverMenuOpen} onMenuChange={open => {
            setServerMenuOpen(open); serverMenuOpenRef.current = open; showControls(!open);
          }} onSelectServer={index => { setLoading(true); setActiveServer(servers[index]); }}
          onPrevious={hasPreviousEpisode && onPreviousEpisode ? () => { showControls(true); onPreviousEpisode(); } : undefined}
          onNext={hasNextEpisode && onNextEpisode ? () => { showControls(true); onNextEpisode(); } : undefined} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  videoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  iframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  statusText: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#344544',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
    marginTop: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  hiddenTriggersRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 25,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  hiddenTopStrip: {
    flex: 1,
    height: 44,
  },
  cornerRevealPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginRight: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,15,15,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 2,
  },
  cornerRevealText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  overlayWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
});
