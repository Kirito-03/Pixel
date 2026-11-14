import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TrailerPreviewProps {
  id: string;
  onEnded?: () => void;
  initialMuted?: boolean;
}

export default function TrailerPreview({ id, onEnded, initialMuted = true }: TrailerPreviewProps) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

  const [isMuted, setIsMuted] = useState(initialMuted);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Listener para detectar cuando termina el video en YouTube (PlayerState.ENDED = 0)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        // YouTube API emite onStateChange con info = 0 cuando el video finaliza
        if (data?.event === 'onStateChange' && data?.info === 0) {
          onEndedRef.current?.();
        } else if (data?.info && typeof data.info.playerState === 'number' && data.info.playerState === 0) {
          onEndedRef.current?.();
        }
      } catch {
        // Ignorar mensajes no-JSON
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const toggleSound = (e: any) => {
    e?.stopPropagation?.();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      if (nextMuted) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'mute' }), '*');
      } else {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute' }), '*');
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
      }
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Parámetros YouTube:
  // - autoplay=1: arranca automático
  // - mute=1: por defecto mute para garantizar que el navegador permita autoplay sin bloquear
  // - controls=0: oculta barra de controles
  // - cc_load_policy=0: desactiva subtítulos automáticos
  // - iv_load_policy=3: desactiva anotaciones y tarjetas de texto de YouTube
  // - modestbranding=1: sin logo grande de YouTube
  // - rel=0: no muestra videos externos al final
  // - enablejsapi=1: habilita eventos postMessage (sonido y fin de reproducción)
  const embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${initialMuted ? 1 : 0}&playsinline=1&controls=0&fs=0&rel=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&enablejsapi=1${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;

  return (
    <View style={styles.container}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        <iframe
          ref={iframeRef}
          title="Tráiler"
          src={embedUrl}
          style={{
            position: 'absolute',
            top: '-12%',
            left: '-6%',
            width: '112%',
            height: '124%',
            border: 'none',
            pointerEvents: 'none',
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            // Desactivar subtítulos si YouTube intenta forzarlos
            try {
              iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'unloadModule', args: ['captions'] }),
                '*'
              );
            } catch {}
          }}
        />
      </div>

      {/* Botón flotante para activar / desactivar sonido */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isMuted ? 'Activar sonido del tráiler' : 'Silenciar tráiler'}
        style={styles.soundButton}
        onPress={toggleSound}
        activeOpacity={0.8}
      >
        <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#FFFFFF" />
        <Text style={styles.soundText}>{isMuted ? 'Activar sonido' : 'Sonido activado'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  soundButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
    cursor: 'pointer' as any,
  },
  soundText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
