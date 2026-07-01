import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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

  useEffect(() => {
    if (!episode || !videoRef.current) return;
    const video = videoRef.current;
    
    // Determine the video source URL
    let source = episode.url || episode.stream_url || episode.video_url;
    if (!source) {
      setError('No hay fuente de video disponible');
      return;
    }

    // Convert relative backend paths to absolute URLs
    if (source.startsWith('/')) {
      const baseUrl = getCurrentBaseURL() || 'http://localhost:3001';
      source = `${baseUrl}${source}`;
    } else if (!source.startsWith('http')) {
      // Local backend stream endpoint
      const baseUrl = getCurrentBaseURL() || 'http://localhost:3001';
      source = `${baseUrl}/api/video/stream/${episode.id}`;
    }

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
  }, [episode]);

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
      ) : (
        <video 
          ref={videoRef as any}
          style={styles.video as any}
          controls
          autoPlay
          playsInline
        />
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
  controlsRow: {
    position: 'absolute',
    bottom: 40,
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
