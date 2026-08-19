import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Hls from 'hls.js';
import { getCurrentBaseURL } from '../services/databaseService';

const EpisodePlayer: React.FC<any> = ({
  episode,
  animeTitle,
  seasonNumber,
  onClose,
  onNextEpisode,
  onPreviousEpisode,
  hasNextEpisode,
  hasPreviousEpisode
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [serverIndex, setServerIndex] = useState(0);

  // Fallback to episode.url if external_servers is empty
  const servers = episode?.external_servers || [];
  
  // Resolve source based on serverIndex or default
  let source = '';
  if (servers.length > 0 && servers[serverIndex]) {
    source = servers[serverIndex].url;
  } else {
    source = episode?.url || episode?.stream_url || episode?.video_url || '';
  }

  if (source.startsWith('/')) {
    const baseUrl = getCurrentBaseURL() || 'http://localhost:3001';
    source = `${baseUrl}${source}`;
  } else if (!source.startsWith('http')) {
    const baseUrl = getCurrentBaseURL() || 'http://localhost:3001';
    source = `${baseUrl}/api/video/stream/${episode?.id}`;
  }

  const isIframe = source.includes('jkanime.net/jkplayer') || source.includes('iframe') || servers.length > 0;

  useEffect(() => {
    if (!episode || !videoRef.current || isIframe) return;
    const video = videoRef.current;

    if (source.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Auto-play prevented:', e));
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
           setError('Error reproduciendo el video (HLS)');
        }
      });
      return () => {
        hls.destroy();
      };
    } else {
      video.src = source;
      video.load();
      video.play().catch(e => console.log('Auto-play prevented:', e));
    }
  }, [episode, serverIndex, source, isIframe]);

  return (
    <View style={styles.container}>
      {/* Header/Close Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titleText}>
          {animeTitle} - S{seasonNumber || 1} E{episode?.number}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : isIframe ? (
        <View style={styles.iframeContainer}>
          <iframe
            src={source}
            style={styles.video as any}
            allowFullScreen
            frameBorder="0"
            referrerPolicy="no-referrer"
          />
          <TouchableOpacity 
            style={styles.externalButton}
            onPress={() => window.open(source, '_blank')}
          >
            <Ionicons name="open-outline" size={20} color="#fff" />
            <Text style={styles.externalButtonText}>¿Pantalla en negro? Abrir en nueva pestaña</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <video 
          ref={videoRef as any}
          style={styles.video as any}
          controls
          autoPlay
          playsInline
        />
      )}
      
      {/* Server Selector */}
      {servers.length > 0 && (
        <View style={styles.serverSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
            {servers.map((srv: any, idx: number) => (
              <TouchableOpacity
                key={idx}
                style={[styles.serverButton, serverIndex === idx && styles.serverButtonActive]}
                onPress={() => setServerIndex(idx)}
              >
                <Text style={[styles.serverButtonText, serverIndex === idx && styles.serverButtonTextActive]}>
                  {srv.server}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Navigation Controls */}
      <View style={styles.controlsRow}>
         {hasPreviousEpisode && (
            <TouchableOpacity style={styles.navButton} onPress={onPreviousEpisode}>
               <Ionicons name="play-skip-back" size={24} color="#fff" />
               <Text style={styles.navText}>Anterior</Text>
            </TouchableOpacity>
         )}
         {hasNextEpisode && (
            <TouchableOpacity style={styles.navButton} onPress={onNextEpisode}>
               <Text style={styles.navText}>Siguiente</Text>
               <Ionicons name="play-skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
         )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 8,
  },
  titleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  iconButton: {
    padding: 5,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    objectFit: 'contain',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  },
  iframeContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  externalButton: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    gap: 8,
    zIndex: 20,
  },
  externalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  serverSelector: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 10,
  },
  serverButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  serverButtonActive: {
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    borderColor: '#fff',
  },
  serverButtonText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  serverButtonTextActive: {
    color: '#fff',
  },
  controlsRow: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    zIndex: 10,
    paddingHorizontal: 20,
    pointerEvents: 'box-none',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  navText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  }
});

export default EpisodePlayer;
