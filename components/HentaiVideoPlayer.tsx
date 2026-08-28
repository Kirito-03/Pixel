import React, { useState } from 'react';
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

interface VideoServer {
  server: string;
  url: string;
}

interface HentaiVideoPlayerProps {
  animeTitle: string;
  episodeNumber: number;
  servers: VideoServer[];
  onClose: () => void;
}

export default function HentaiVideoPlayer({
  animeTitle,
  episodeNumber,
  servers,
  onClose
}: HentaiVideoPlayerProps) {
  const [activeServer, setActiveServer] = useState<VideoServer | null>(
    servers.length > 0 ? servers[0] : null
  );
  const [loading, setLoading] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {animeTitle} - Ep {episodeNumber}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Video Area */}
      <View style={styles.videoContainer}>
        {loading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#E50914" />
          </View>
        )}
        
        {activeServer ? (
          Platform.OS === 'web' ? (
            <iframe
              src={activeServer.url}
              style={styles.iframe as any}
              allowFullScreen
              frameBorder="0"
              onLoad={() => setLoading(false)}
            />
          ) : (
            <WebView
              source={{ uri: activeServer.url }}
              style={styles.webview}
              allowsFullscreenVideo={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadEnd={() => setLoading(false)}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={[styles.loaderContainer, { backgroundColor: '#000' }]}>
                  <ActivityIndicator size="large" color="#E50914" />
                </View>
              )}
            />
          )
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>No hay servidores disponibles</Text>
          </View>
        )}
      </View>

      {/* Server Selector */}
      {servers && servers.length > 0 && (
        <View style={styles.serverSelectorContainer}>
          <Text style={styles.serverTitle}>Seleccionar Servidor:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverList}>
            {servers.map((s, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.serverButton,
                  activeServer?.server === s.server && styles.serverButtonActive
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
    padding: 15,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 15,
    flexShrink: 1,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
  serverSelectorContainer: {
    padding: 15,
    backgroundColor: '#111',
    borderTopWidth: 1,
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
    borderRadius: 20,
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
