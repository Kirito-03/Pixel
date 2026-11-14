import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Hls from 'hls.js';
import { progressApi } from '../services/progressApi';
import { getCurrentBaseURL } from '../services/databaseService';

const EpisodePlayer: React.FC<any> = ({
  episode,
  animeTitle,
  animeId,
  profileId,
  resumeTimeSeconds,
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
  const [progressError, setProgressError] = useState(false);
  const progressRef = useRef<null | { current_time: number; duration: number; position_known: boolean }>(null);
  const lastSent = useRef(0);
  const restored = useRef(false);
  const endedRef = useRef(false);
  const saveRef = useRef<(force?: boolean) => void>(() => {});

  useEffect(() => {
    progressRef.current = null; lastSent.current = 0; restored.current = false; endedRef.current = false;
    setServerIndex(0); setError(''); setProgressError(false);
    let active = true;
    const save = (force = false) => {
      const snapshot = progressRef.current;
      if (!snapshot || !profileId || !animeId || (!force && Date.now() - lastSent.current < 15000)) return;
      lastSent.current = Date.now();
      void progressApi.save(Number(profileId), {
        anime_id: Number(animeId), episode_id: Number(episode.id), ...snapshot,
        episode_number: Number(episode.number ?? episode.episode_number), season: Number(seasonNumber || 1),
        title: animeTitle, thumbnail: episode.thumbnail_url || episode.thumbnail,
      }).then(() => { if (active) setProgressError(false); }).catch(() => { if (active) setProgressError(true); });
    };
    saveRef.current = save;
    const flush = () => save(true);
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => { active = false; flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, [episode?.id, animeId, profileId, seasonNumber, animeTitle]);
  const snapshotVideo = (force = false) => {
    const video = videoRef.current;
    if (!video || !restored.current || !Number.isFinite(video.duration) || video.duration <= 0) return;
    progressRef.current = { current_time: video.currentTime, duration: video.duration, position_known: true };
    saveRef.current(force);
  };
  const leave = (action?: () => void) => { snapshotVideo(true); action?.(); };


  // Fallback to episode.url if external_servers is empty
  let servers = [];
  try {
    servers = typeof episode?.external_servers === 'string' 
      ? JSON.parse(episode.external_servers) 
      : (episode?.external_servers || []);
  } catch (e) {
    console.error('Error parsing external_servers', e);
  }
  
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
        <TouchableOpacity style={styles.iconButton} onPress={() => leave(onClose)}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titleText}>
          {animeTitle} - S{seasonNumber || 1} E{episode?.number}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {progressError && <Text style={styles.progressNotice}>No se pudo guardar el avance. Revisa tu conexión.</Text>}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : isIframe ? (
        <View style={styles.iframeContainer}>
          <iframe
            title="Reproductor del episodio"
            src={source}
            onLoad={() => {
              progressRef.current = { current_time: 0, duration: 0, position_known: false };
              saveRef.current(true);
            }}
            style={styles.video as any}
            allowFullScreen
            frameBorder="0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          />
        </View>
      ) : (
        <video 
          ref={videoRef as any}
          style={styles.video as any}
          controls
          autoPlay
          playsInline
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (!video) return;
            if (!restored.current && resumeTimeSeconds > 0 && Number.isFinite(video.duration))
              video.currentTime = Math.min(resumeTimeSeconds, Math.max(0, video.duration - 1));
            restored.current = true;
          }}
          onTimeUpdate={() => snapshotVideo()}
          onPause={() => snapshotVideo(true)}
          onSeeked={() => snapshotVideo(true)}
          onEnded={() => {
            snapshotVideo(true);
            if (!endedRef.current && hasNextEpisode) { endedRef.current = true; onNextEpisode?.(); }
          }}
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
            <TouchableOpacity style={styles.navButton} onPress={() => leave(onPreviousEpisode)}>
               <Ionicons name="play-skip-back" size={24} color="#fff" />
               <Text style={styles.navText}>Anterior</Text>
            </TouchableOpacity>
         )}
         {hasNextEpisode && (
            <TouchableOpacity style={styles.navButton} onPress={() => leave(onNextEpisode)}>
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
  progressNotice: { position: 'absolute', top: 75, alignSelf: 'center', zIndex: 20, backgroundColor: '#292015', color: '#fff', padding: 10 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 15,
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
