import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
  SafeAreaView
} from 'react-native';
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
  const [activeServer, setActiveServer] = useState<VideoServer | null>(
    servers.length > 0 ? servers[0] : null
  );
  const [loading, setLoading] = useState(servers.length > 0);

  useEffect(() => {
    const nextServer = servers.length > 0 ? servers[0] : null;
    setActiveServer(nextServer);
    setLoading(nextServer !== null);
  }, [episodeNumber, servers]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Back Button and Episode Navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Volver a detalles de la serie"
          style={[styles.backButton, isWeb && ({ cursor: 'pointer' } as any)]}
          onPress={onClose}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {animeTitle} - Ep {episodeNumber}
          </Text>
        </TouchableOpacity>

        {(hasPreviousEpisode || hasNextEpisode) && (
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
                onPress={onPreviousEpisode}
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
                onPress={onNextEpisode}
              >
                <Text style={styles.navButtonText}>Siguiente</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Video Area */}
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
              <View style={styles.loaderContainer}>
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
                onLoad={() => setLoading(false)}
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
                onShouldStartLoadWithRequest={(request) =>
                  shouldAllowEmbeddedNavigation(request.url || '', activeServer.url)
                }
                onLoadEnd={() => setLoading(false)}
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

      {/* Server Selector */}
      {!loadingServers && !error && servers && servers.length > 0 && (
        <View style={styles.serverSelectorContainer}>
          <Text style={styles.serverTitle}>Seleccionar Servidor:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverList}>
            {servers.map((s, index) => (
              <TouchableOpacity
                key={`${s.server}-${index}`}
                style={[
                  styles.serverButton,
                  activeServer?.server === s.server && styles.serverButtonActive,
                  isWeb && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => {
                  setLoading(true);
                  setActiveServer(s);
                }}
              >
                <Text
                  style={[
                    styles.serverButtonText,
                    activeServer?.server === s.server && styles.serverButtonTextActive
                  ]}
                >
                  {s.server}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 10,
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
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  navButtonSecondary: {
    backgroundColor: '#262626',
  },
  navButtonPrimary: {
    backgroundColor: '#E50914',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
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
  serverSelectorContainer: {
    padding: 15,
    backgroundColor: '#111',
    borderTopWidth: 0,
    borderTopColor: '#333',
  },
  serverTitle: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 10,
  },
  serverList: {
    flexDirection: 'row',
    gap: 10,
  },
  serverButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 0,
    backgroundColor: '#333',
    marginRight: 10,
  },
  serverButtonActive: {
    backgroundColor: '#E50914',
  },
  serverButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  serverButtonTextActive: {
    fontWeight: 'bold',
  }
});
