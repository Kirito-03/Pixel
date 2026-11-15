import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

interface TrailerPreviewProps {
  id: string;
  onEnded?: () => void;
  initialMuted?: boolean;
  fallbackYoutubeId?: string;
}

const isDirectStreamUrl = (value?: string | null): boolean =>
  Boolean(value && /^(https?:\/\/|\/api\/stream\/)/i.test(value.trim()));

const isYoutubeId = (value?: string | null): boolean =>
  Boolean(value && /^[A-Za-z0-9_-]{11}$/.test(value.trim()));

export default function TrailerPreview({ id, onEnded, initialMuted = false, fallbackYoutubeId }: TrailerPreviewProps) {
  const [activeId, setActiveId] = useState(id);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const webViewRef = React.useRef<any>(null);

  React.useEffect(() => {
    setActiveId(id);
    setIsMuted(initialMuted);
  }, [id, initialMuted]);

  const directUrl = isDirectStreamUrl(activeId)
    ? (activeId.trim().startsWith('/') ? `https://pixelnosekai.com${activeId.trim()}` : activeId.trim())
    : null;
  const youtubeId = !directUrl && isYoutubeId(activeId) ? activeId.trim() : null;

  if (!directUrl && !youtubeId) return null;

  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (webViewRef.current) {
      if (nextMuted) {
        webViewRef.current.injectJavaScript(`
          var v = document.querySelector('video');
          if (v) { v.muted = true; }
          else if (window.player && window.player.mute) { window.player.mute(); }
          else { document.querySelector('iframe')?.contentWindow?.postMessage('{"event":"command","func":"mute"}', '*'); }
          true;
        `);
      } else {
        webViewRef.current.injectJavaScript(`
          var v = document.querySelector('video');
          if (v) { v.muted = false; v.volume = 1; v.play().catch(function(){}); }
          else if (window.player && window.player.unMute) { window.player.unMute(); window.player.setVolume(100); window.player.playVideo(); }
          else { 
            document.querySelector('iframe')?.contentWindow?.postMessage('{"event":"command","func":"unMute"}', '*'); 
            document.querySelector('iframe')?.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*'); 
          }
          true;
        `);
      }
    }
  };

  const html = directUrl
    ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body, html { width:100%; height:100%; background:#000; overflow:hidden; }
          #player { position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; background:#000; }
        </style>
      </head>
      <body>
        <video id="player" playsinline autoplay ${initialMuted ? 'muted' : ''}></video>
        <script>
          (function() {
            var v = document.getElementById('player');
            v.src = ${JSON.stringify(directUrl)};
            v.addEventListener('ended', function() {
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ENDED');
            });
            v.addEventListener('error', function() {
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('STREAM_ERROR');
            });
            var p = v.play();
            if (p && p.catch) {
              p.catch(function() {
                v.muted = true;
                if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('BLOCKED');
                v.play().catch(function(){});
              });
            }
          })();
        </script>
      </body>
    </html>
  `
    : `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body, html { width:100%; height:100%; background:#000; overflow:hidden; }
          .wrap { position:relative; width:100%; height:100%; overflow:hidden; }
          iframe, #player { position:absolute; top:0; left:0; width:100%; height:100%; border:none; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <iframe id="player"
            src="https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=${initialMuted ? 1 : 0}&playsinline=1&controls=0&fs=0&rel=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&enablejsapi=1" 
            allow="autoplay; encrypted-media" 
            allowfullscreen>
          </iframe>
        </div>
        <script>
          window.onYouTubeIframeAPIReady = function() {
            window.player = new YT.Player('player', {
              events: {
                onReady: function(event) { ${initialMuted ? 'event.target.mute();' : 'event.target.unMute();'} event.target.playVideo(); },
                onAutoplayBlocked: function(event) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('BLOCKED'); event.target.mute(); event.target.playVideo(); },
                onStateChange: function(event) {
                  if (event.data === YT.PlayerState.ENDED && window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ENDED');
                }
              }
            });
          };
          var api = document.createElement('script'); api.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(api);
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
          if (event.nativeEvent.data === 'BLOCKED') setIsMuted(true);
          if (event.nativeEvent.data === 'STREAM_ERROR' && fallbackYoutubeId && isYoutubeId(fallbackYoutubeId)) {
            setActiveId(fallbackYoutubeId);
          }
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
    minHeight: 0,
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
    minHeight: 44,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  soundText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
