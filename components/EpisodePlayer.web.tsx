import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Hls from 'hls.js';
import PlaybackChrome from './PlaybackChrome';
import SeekButton from './SeekButton';
import { episodePlaybackSources, isDirectPlaybackUrl } from '../services/episodePlaybackSources';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setShowChrome(true);
    if (!menuOpen) hideTimer.current = setTimeout(() => setShowChrome(false), 3500);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [menuOpen, episode?.id]);
  const reveal = () => { setShowChrome(true); if (hideTimer.current) clearTimeout(hideTimer.current); if (!menuOpen) hideTimer.current = setTimeout(() => setShowChrome(false), 3500); };
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
    setServerIndex(0); setMenuOpen(false); setError(''); setProgressError(false);
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
  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !restored.current || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    snapshotVideo(true); reveal();
  };
  const leave = (action?: () => void) => { snapshotVideo(true); action?.(); };


  const servers = episodePlaybackSources({ ...episode, url: episode?.url || episode?.stream_url || episode?.video_url });
  let source = servers[serverIndex]?.url || '';

  if (source.startsWith('/')) {
    const baseUrl = getCurrentBaseURL() || 'http://localhost:3001';
    source = `${baseUrl}${source}`;
  } else if (!source.startsWith('http')) {
    const baseUrl = getCurrentBaseURL() || 'http://localhost:3001';
    source = `${baseUrl}/api/video/stream/${episode?.id}`;
  }

  const isIframe = !isDirectPlaybackUrl(source);

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
    <View style={styles.container} {...({ onMouseMove: reveal } as any)}>
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
      
      {!isIframe && showChrome && <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -26, flexDirection: 'row', justifyContent: 'center', gap: 100, zIndex: 12 }}>
        <SeekButton onPress={() => seekBy(-10)} /><SeekButton forward onPress={() => seekBy(10)} />
      </View>}
      <View style={[StyleSheet.absoluteFill, { zIndex: 15 }]} pointerEvents="box-none">
        {showChrome ? <PlaybackChrome title={animeTitle} subtitle={`Temporada ${seasonNumber || 1} · Episodio ${episode?.number}`}
          onClose={() => leave(onClose)} servers={isIframe ? servers : []} selectedIndex={serverIndex}
          menuOpen={menuOpen} onMenuChange={setMenuOpen} onSelectServer={index => { snapshotVideo(true); setServerIndex(index); setError(''); }}
          onPrevious={hasPreviousEpisode ? () => leave(onPreviousEpisode) : undefined}
          onNext={hasNextEpisode ? () => leave(onNextEpisode) : undefined} />
          : <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mostrar controles del reproductor" onPress={reveal} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 48 }} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  progressNotice: { position: 'absolute', top: 90, alignSelf: 'center', zIndex: 20, backgroundColor: '#292015', color: '#fff', padding: 10 },
  video: { width: '100%', height: '100%', backgroundColor: '#000', objectFit: 'contain' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ddd', fontSize: 16 }, iframeContainer: { width: '100%', height: '100%', position: 'relative' },
});
export default EpisodePlayer;
