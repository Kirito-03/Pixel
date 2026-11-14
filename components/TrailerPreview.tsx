import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

interface TrailerPreviewProps {
  id: string;
  onEnded?: () => void;
  initialMuted?: boolean;
}

export default function TrailerPreview({ id, onEnded, initialMuted = true }: TrailerPreviewProps) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

  const [isMuted, setIsMuted] = useState(initialMuted);
  const webViewRef = React.useRef<any>(null);

  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (webViewRef.current) {
      if (nextMuted) {
        webViewRef.current.injectJavaScript(`
          if (window.player && window.player.mute) { window.player.mute(); }
          else { document.querySelector('iframe')?.contentWindow?.postMessage('{"event":"command","func":"mute"}', '*'); }
          true;
        `);
      } else {
        webViewRef.current.injectJavaScript(`
          if (window.player && window.player.unMute) { window.player.unMute(); window.player.setVolume(100); }
          else { 
            document.querySelector('iframe')?.contentWindow?.postMessage('{"event":"command","func":"unMute"}', '*'); 
            document.querySelector('iframe')?.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*'); 
          }
          true;
        `);
      }
    }
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body, html { width:100%; height:100%; background:#000; overflow:hidden; }
          .wrap { position:relative; width:100%; height:100%; overflow:hidden; }
          iframe { position:absolute; top:-10%; left:-5%; width:110%; height:120%; border:none; pointer-events:none; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <iframe 
            src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${initialMuted ? 1 : 0}&playsinline=1&controls=0&fs=0&rel=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&enablejsapi=1" 
            allow="autoplay; encrypted-media" 
            allowfullscreen>
          </iframe>
        </div>
        <script>
          window.addEventListener('message', function(e) {
            try {
              var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
              if (data && (data.event === 'onStateChange' && data.info === 0) || (data.info && data.info.playerState === 0)) {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage('ENDED');
                }
              }
            } catch(err) {}
          });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: 'https://pixelnosekai.com' }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scalesPageToFit
        onMessage={(event) => {
          if (event.nativeEvent.data === 'ENDED') {
            onEnded?.();
          }
        }}
      />
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
    flex: 1,
    minHeight: 200,
    backgroundColor: '#000000',
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
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
  },
  soundText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
