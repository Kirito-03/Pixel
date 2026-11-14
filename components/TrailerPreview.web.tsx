import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TrailerPreviewProps { id: string; onEnded?: () => void; initialMuted?: boolean; }
let apiPromise: Promise<any> | null = null;
function youtubeApi(): Promise<any> {
  const win = window as any;
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady;
    const timeout = setTimeout(() => { apiPromise = null; reject(new Error('YouTube no respondió')); }, 15000);
    win.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); previous?.(); resolve(win.YT); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { clearTimeout(timeout); apiPromise = null; script.remove(); reject(new Error('No se pudo cargar YouTube')); };
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}
export default function TrailerPreview({ id, onEnded, initialMuted = false }: TrailerPreviewProps) {
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const ended = useRef(onEnded); ended.current = onEnded;
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    let disposed = false;
    setIsMuted(initialMuted); setBlocked(false); setError(false);
    youtubeApi().then(YT => {
      if (disposed || !host.current) return;
      const mount = document.createElement('div'); host.current.replaceChildren(mount);
      player.current = new YT.Player(mount, {
        host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%', videoId: id,
        playerVars: { autoplay: 1, mute: initialMuted ? 1 : 0, playsinline: 1, controls: 0, fs: 0, rel: 0, iv_load_policy: 3, origin: window.location.origin },
        events: {
          onReady: ({ target }: any) => { if (disposed) return; initialMuted ? target.mute() : (target.unMute(), target.setVolume(100)); target.playVideo(); },
          onAutoplayBlocked: ({ target }: any) => { if (disposed) return; setBlocked(true); setIsMuted(true); target.mute(); target.playVideo(); },
          onStateChange: ({ data, target }: any) => {
            if (disposed) return;
            if (data === YT.PlayerState.ENDED) ended.current?.();
            if (data === YT.PlayerState.PLAYING && !target.isMuted()) { setBlocked(false); setIsMuted(false); }
          },
          onError: () => { if (!disposed) setError(true); },
        },
      });
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; player.current?.destroy?.(); player.current = null; };
  }, [id, initialMuted]);
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const sound = (event: any) => {
    event?.stopPropagation?.();
    if (!player.current?.unMute) return;
    if (isMuted || blocked) { player.current.unMute(); player.current.setVolume(100); player.current.playVideo(); setIsMuted(false); setBlocked(false); }
    else { player.current.mute(); setIsMuted(true); }
  };
  return <View style={styles.container}>
    <div ref={host} style={{ width: '100%', height: '100%' }} />
    {error ? <View style={styles.error}><Text style={styles.text}>Tráiler no disponible</Text></View> :
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={isMuted || blocked ? 'Reproducir tráiler con sonido' : 'Silenciar tráiler'} style={styles.soundButton} onPress={sound}>
        <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        <Text style={styles.text}>{blocked ? 'Reproducir con sonido' : isMuted ? 'Activar sonido' : 'Sonido activado'}</Text>
      </TouchableOpacity>}
  </View>;
}
const styles = StyleSheet.create({
  container: { width: '100%', height: '100%', position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  error: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  soundButton: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(20,20,20,.9)', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: 20, zIndex: 10 },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
