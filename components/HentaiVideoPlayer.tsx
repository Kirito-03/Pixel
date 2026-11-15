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
            <ActivityIndicator size="large" color="#E50914" />
            <Text style={styles.statusText}>Cargando episodio {episodeNumber}...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={36} color="#E50914" />
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
                <ActivityIndicator size="large" color="#E50914" />
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
                    <ActivityIndicator size="large" color="#E50914" />
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
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Mostrar selector de servidor"
            style={[styles.cornerRevealPill, isWeb && ({ cursor: 'pointer' } as any)]}
            activeOpacity={0.85}
            onPress={() => {
              setServerMenuOpen(true);
              showControls(false);
            }}
            {...(isWeb ? ({ onMouseEnter: () => showControls(true) } as any) : {})}
          >
            <Ionicons name="server-outline" size={14} color="#fff" />
            <Text style={styles.cornerRevealText}>{activeServer?.server || 'Servidor'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-hiding Floating Overlay (Header + Corner Server Picker) */}
      <Animated.View
        style={[styles.overlayWrap, { opacity: controlsOpacity }]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Volver a detalles de la serie"
            style={[styles.backButton, isWeb && ({ cursor: 'pointer' } as any)]}
            onPress={handleClose}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {animeTitle} - Ep {episodeNumber}
            </Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {hasPreviousEpisode && onPreviousEpisode && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  previousEpisodeNumber !== null
                    ? `Capítulo anterior: episodio ${previousEpisodeNumber}`
                    : 'Capítulo anterior'
                }
                style={[styles.navButton, styles.navButtonSecondary, isWeb && ({ cursor: 'pointer' } as any)]}
                onPress={() => {
                  showControls(true);
                  onPreviousEpisode();
                }}
              >
                <Ionicons name="chevron-back" size={16} color="#fff" />
                <Text style={styles.navButtonText}>Anterior</Text>
              </TouchableOpacity>
            )}

            {hasNextEpisode && onNextEpisode && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  nextEpisodeNumber !== null
                    ? `Siguiente capítulo: episodio ${nextEpisodeNumber}`
                    : 'Siguiente capítulo'
                }
                style={[styles.navButton, styles.navButtonPrimary, isWeb && ({ cursor: 'pointer' } as any)]}
                onPress={() => {
                  showControls(true);
                  onNextEpisode();
                }}
              >
                <Text style={styles.navButtonText}>Siguiente</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </TouchableOpacity>
            )}

            {!loadingServers && !error && servers && servers.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cambiar servidor de video"
                style={[
                  styles.serverCornerBtn,
                  serverMenuOpen && styles.serverCornerBtnActive,
                  isWeb && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => {
                  const nextOpen = !serverMenuOpen;
                  setServerMenuOpen(nextOpen);
                  serverMenuOpenRef.current = nextOpen;
                  if (nextOpen) {
                    showControls(false);
                  } else {
                    showControls(true);
                  }
                }}
              >
                <Ionicons name="server-outline" size={15} color="#fff" />
                <Text style={styles.serverCornerBtnText} numberOfLines={1}>
                  {activeServer?.server || 'Servidor'}
                </Text>
                <Ionicons
                  name={serverMenuOpen ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color="#fff"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Corner Server Dropdown */}
        {serverMenuOpen && !loadingServers && !error && servers && servers.length > 0 && (
          <View style={styles.serverDropdown}>
            <Text style={styles.serverDropdownTitle}>Cambiar servidor</Text>
            <ScrollView style={styles.serverDropdownList} showsVerticalScrollIndicator={false}>
              {servers.map((s, index) => {
                const isActive = activeServer?.server === s.server;
                return (
                  <TouchableOpacity
                    key={`${s.server}-${index}`}
                    style={[
                      styles.serverDropdownItem,
                      isActive && styles.serverDropdownItemActive,
                      isWeb && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={() => {
                      setLoading(true);
                      setActiveServer(s);
                      setServerMenuOpen(false);
                      serverMenuOpenRef.current = false;
                      showControls(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.serverDropdownItemText,
                        isActive && styles.serverDropdownItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {s.server}
                    </Text>
                    {isActive && <Ionicons name="checkmark" size={15} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
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
    backgroundColor: '#E50914',
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
    left: 0,
    right: 0,
    zIndex: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.72)',
    gap: 10,
  },
  backButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 2,
  },
  navButtonSecondary: {
    backgroundColor: '#262626',
  },
  navButtonPrimary: {
    backgroundColor: '#E50914',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  serverCornerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(38,38,38,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    maxWidth: 150,
  },
  serverCornerBtnActive: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  serverCornerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  serverDropdown: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 210,
    maxHeight: 260,
    backgroundColor: 'rgba(18,18,18,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    padding: 8,
    zIndex: 40,
  },
  serverDropdownTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  serverDropdownList: {
    maxHeight: 215,
  },
  serverDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 2,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  serverDropdownItemActive: {
    backgroundColor: '#E50914',
  },
  serverDropdownItemText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 6,
  },
  serverDropdownItemTextActive: {
    fontWeight: '800',
  },
});
