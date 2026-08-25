import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
  Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimeEpisode, VideoSource } from '../types';
import { progressApi } from '../services/progressApi';

interface EpisodePlayerProps {
  episode: AnimeEpisode;
  animeTitle: string;
  animeId: number;
  seasonNumber: number;
  profileId?: number;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  hasNextEpisode?: boolean;
  hasPreviousEpisode?: boolean;
}

const EpisodePlayer: React.FC<EpisodePlayerProps> = ({
  episode,
  animeTitle,
  animeId,
  seasonNumber,
  profileId,
  onClose,
  onNextEpisode,
  onPreviousEpisode,
  hasNextEpisode = false,
  hasPreviousEpisode = false,
}) => {
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const webVideoRef = useRef<any>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const lastProgressSecond = useRef<number>(0);
  const inFlightProgress = useRef<Promise<any> | null>(null);

  const episodeId = useMemo(() => {
    const n = Number(episode.id);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [episode.id]);

  const sendProgress = useCallback(
    async (payload: { current_time: number; duration: number }, options?: { force?: boolean }) => {
      if (!profileId) return;
      if (!episodeId) return;
      const currentTime = Number(payload.current_time);
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      const durationRaw = Number(payload.duration);
      const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0;

      const now = Date.now();
      const force = options?.force === true;
      const currentSecond = Math.floor(currentTime);
      if (!force && currentSecond <= 0) return;
      if (!force && currentSecond - lastProgressSecond.current < 5) return;
      if (inFlightProgress.current) return;

      lastProgressSecond.current = currentSecond;
      console.log('[EpisodePlayer][progress]', {
        profileId,
        animeId,
        episodeId,
        current_time: currentSecond,
        duration: Math.floor(duration),
        force,
      });

      inFlightProgress.current = progressApi
        .save(profileId, {
          anime_id: animeId,
          episode_id: episodeId,
          current_time: currentSecond,
          duration: Math.floor(duration),
        })
        .then((r) => {
          console.log('[EpisodePlayer][progress][ok]');
          return r;
        })
        .catch((e) => {
          console.log('[EpisodePlayer][progress][error]', e);
          return null;
        })
        .finally(() => {
          inFlightProgress.current = null;
        });
      await inFlightProgress.current;
    },
    [animeId, episodeId, profileId]
  );


  // ── Auto-hide UI ────────────────────────────────────────────
  const showUITemporarily = useCallback(() => {
    setShowUI(true);
    Animated.timing(uiOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(uiOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() =>
        setShowUI(false)
      );
    }, 4000); // 4s — da tiempo de leer títulos y usar controles
  }, [uiOpacity]);

  useEffect(() => {
    showUITemporarily();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  // ── StatusBar ────────────────────────────────────────────────
  useEffect(() => {
    try { StatusBar.setHidden(true, 'fade'); } catch {}
    return () => { try { StatusBar.setHidden(false, 'fade'); } catch {} };
  }, []);

  // ── HLS (web) ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const videoEl = webVideoRef.current as any;
    const url = selectedSource?.url || '';
    if (!videoEl || !url) return;
    const isM3U8 = /\.m3u8(\?|$)/i.test(url);
    let hls: any = null;

    function initHls() {
      const HlsCtor = (window as any).Hls;
      if (!HlsCtor?.isSupported?.()) { setError('HLS no soportado en este navegador'); return; }
      hls = new HlsCtor({ enableWorker: true, lowLatencyMode: false });
      hls.on(HlsCtor.Events.ERROR, (_event: any, data: any) => {
        if (data?.fatal) setError(`Error HLS: ${data?.details || 'fatal'}`);
      });
      hls.loadSource(url);
      hls.attachMedia(videoEl);
    }

    if (isM3U8) {
      if (videoEl.canPlayType?.('application/vnd.apple.mpegurl')) {
        videoEl.src = url; videoEl.load();
      } else if ((window as any).Hls) {
        initHls();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
        script.async = true;
        script.onload = initHls;
        script.onerror = () => setError('No se pudo cargar hls.js');
        document.head.appendChild(script);
      }
    }
    return () => { if (hls) { try { hls.destroy(); } catch {} } };
  }, [selectedSource]);

  // ── Load sources ─────────────────────────────────────────────
  useEffect(() => { loadEpisodeSources(); }, [episode.id]);

  const loadEpisodeSources = async () => {
    try {
      setLoading(true);
      setError(null);
      if (episode.url) {
        const directSources: VideoSource[] = [{ url: episode.url }];
        setSources(directSources);
        setSelectedSource(directSources[0]);
        return;
      }
      setError('No hay una fuente disponible para este episodio');
    } catch (err) {
      setError('Error al cargar las fuentes del episodio');
    } finally {
      setLoading(false);
    }
  };

  // ── Mouse move → show UI (web) ───────────────────────────────
  const webContainerProps = Platform.OS === 'web'
    ? { onMouseMove: showUITemporarily, onTouchStart: showUITemporarily }
    : { onTouchStart: showUITemporarily };

  // ── Video renderer ───────────────────────────────────────────
  const renderVideoPlayer = useMemo(() => {
    if (!selectedSource) return (
      <View style={styles.videoPlaceholder}>
        <ActivityIndicator size="large" color="#e50914" />
        <Text style={styles.placeholderText}>Cargando video...</Text>
      </View>
    );

    const videoUrl = selectedSource.url || '';
    const isHls = /\.m3u8(\?|$)/.test(videoUrl);
    const urlNoQuery = videoUrl.split('?')[0];
    const ext = (urlNoQuery.split('.').pop() || '').toLowerCase();
    const mime = ext === 'm3u8' ? 'application/vnd.apple.mpegurl'
      : ext === 'mp4' ? 'video/mp4'
      : ext === 'webm' ? 'video/webm'
      : ext === 'mov' ? 'video/quicktime'
      : '';

    // ── WEB: native <video> with full-screen style ───────────
    if (Platform.OS === 'web') {
      return (
        <video
          ref={webVideoRef}
          controls
          style={styles.webVideo as any}
          preload="metadata"
          crossOrigin="anonymous"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            setIsPlaying(false);
            const el = webVideoRef.current as any;
            if (el?.duration) {
              const dur = Number.isFinite(el.duration) ? el.duration : 0;
              sendProgress({ current_time: el.currentTime || 0, duration: dur }, { force: true });
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            const el = webVideoRef.current as any;
            if (el?.duration) {
              const dur = Number.isFinite(el.duration) ? el.duration : 0;
              sendProgress({ current_time: el.currentTime || 0, duration: dur }, { force: true });
            }
            if (hasNextEpisode && onNextEpisode) onNextEpisode();
          }}
          onTimeUpdate={() => {
            const el = webVideoRef.current as any;
            if (el?.duration) {
              const dur = Number.isFinite(el.duration) ? el.duration : 0;
              sendProgress({ current_time: el.currentTime || 0, duration: dur });
            }
          }}
          onError={(e) => {
            const el = webVideoRef.current as any;
            const code = el?.error?.code;
            setError(`Error al reproducir el video${code ? ` (code ${code})` : ''}`);
          }}
        >
          {!isHls && (mime
            ? <source src={videoUrl} type={mime} />
            : <source src={videoUrl} />
          )}
        </video>
      );
    }

    // ── MOBILE: premium WebView player ───────────────────────
    const safeVideoUrl = encodeURI(videoUrl);
    const videoHTML = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
          <style>
            /* ── fonts ── */
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              background: #000;
              width: 100%; height: 100vh;
              overflow: hidden;
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            #wrapper {
              position: relative; width: 100%; height: 100vh;
              display: flex; align-items: center; justify-content: center;
            }
            video {
              width: 100%; height: 100%;
              object-fit: contain;
              background: #000;
            }

            /* gradients */
            #grad-top {
              position: absolute; top: 0; left: 0; right: 0; height: 160px;
              background: linear-gradient(to bottom,
                rgba(0,0,0,0.92) 0%,
                rgba(0,0,0,0.55) 50%,
                transparent 100%);
              pointer-events: none; z-index: 3;
              transition: opacity 0.4s;
            }
            #grad-bottom {
              position: absolute; bottom: 0; left: 0; right: 0; height: 200px;
              background: linear-gradient(to top,
                rgba(0,0,0,0.95) 0%,
                rgba(0,0,0,0.6) 50%,
                transparent 100%);
              pointer-events: none; z-index: 3;
              transition: opacity 0.4s;
            }

            /* Top bar */
            #top-bar {
              position: absolute; top: 0; left: 0; right: 0;
              display: flex; align-items: center; gap: 14px;
              padding: 24px 28px 20px;
              z-index: 10; transition: opacity 0.4s;
            }
            #back-btn {
              background: rgba(255,255,255,0.1);
              border: 1px solid rgba(255,255,255,0.18);
              border-radius: 50%;
              width: 40px; height: 40px;
              display: flex; align-items: center; justify-content: center;
              cursor: pointer; color: #fff; font-size: 20px;
              flex-shrink: 0;
              transition: background 0.2s, transform 0.15s;
            }
            #back-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.06); }
            #titles { flex: 1; overflow: hidden; }
            #anime-name {
              color: #fff; font-size: 15px; font-weight: 700; letter-spacing: -0.1px;
              white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            #ep-name {
              color: rgba(255,255,255,0.5); font-size: 12px; font-weight: 400;
              white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
              margin-top: 3px; letter-spacing: 0.1px;
            }

            /* Episode nav */
            #nav-prev, #nav-next {
              position: absolute; top: 50%; transform: translateY(-50%);
              background: rgba(0,0,0,0.45);
              border: 1px solid rgba(255,255,255,0.18);
              border-radius: 50%; width: 52px; height: 52px;
              display: flex; align-items: center; justify-content: center;
              cursor: pointer; z-index: 10; color: #fff; font-size: 26px;
              transition: opacity 0.4s, background 0.2s, transform 0.15s, box-shadow 0.2s;
              box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            #nav-prev:hover, #nav-next:hover {
              background: rgba(229,9,20,0.35);
              border-color: rgba(229,9,20,0.5);
              transform: translateY(-50%) scale(1.08);
              box-shadow: 0 6px 24px rgba(229,9,20,0.3);
            }
            #nav-prev { left: 20px; }
            #nav-next { right: 20px; }
            #nav-prev.hidden, #nav-next.hidden { display: none; }

            /* Bottom controls */
            #controls {
              position: absolute; bottom: 0; left: 0; right: 0;
              padding: 0 24px 28px;
              z-index: 10; transition: opacity 0.4s;
            }
            /* Progress bar hit area */
            #progress-wrap {
              position: relative; height: 20px;
              display: flex; align-items: center;
              cursor: pointer; margin-bottom: 8px;
            }
            #progress-track {
              position: relative; height: 4px; width: 100%;
              background: rgba(255,255,255,0.18);
              border-radius: 2px;
              transition: height 0.2s;
            }
            #progress-wrap:hover #progress-track { height: 6px; }
            #progress-fill {
              height: 100%; background: #E50914; border-radius: 2px;
              width: 0%; position: relative;
            }
            #progress-fill::after {
              content: '';
              position: absolute; right: -7px; top: 50%; transform: translateY(-50%);
              width: 14px; height: 14px;
              background: #E50914; border-radius: 50%;
              box-shadow: 0 0 10px rgba(229,9,20,0.9);
              opacity: 0; transition: opacity 0.2s;
            }
            #progress-wrap:hover #progress-fill::after { opacity: 1; }

            /* ctrl row */
            #ctrl-row {
              display: flex; align-items: center; gap: 6px;
            }
            .ctrl-btn {
              background: none; border: none; color: #fff;
              font-size: 22px; cursor: pointer; padding: 8px;
              display: flex; align-items: center; justify-content: center;
              opacity: 0.85; transition: opacity 0.15s, transform 0.15s;
              border-radius: 6px;
            }
            .ctrl-btn:hover { opacity: 1; transform: scale(1.1); }
            #play-btn { font-size: 26px; margin-right: 4px; }
            #time-display {
              color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 500;
              letter-spacing: 0.3px; flex: 1; padding-left: 6px;
            }
            #time-display b { color: #fff; font-weight: 700; }
            #vol-wrap {
              display: flex; align-items: center; gap: 6px;
            }
            #vol-icon { opacity: 0.7; font-size: 16px; cursor: pointer; }
            #vol-slider {
              width: 68px; accent-color: #E50914; cursor: pointer;
              appearance: none; -webkit-appearance: none;
              height: 3px; border-radius: 2px;
              background: rgba(255,255,255,0.2);
            }
            #fs-btn { margin-left: 4px; }

            /* Loading */
            #loading {
              position: absolute; top: 50%; left: 50%;
              transform: translate(-50%, -50%);
              color: rgba(255,255,255,0.85); font-size: 13px; text-align: center;
              z-index: 5; letter-spacing: 0.2px;
            }
            .spinner {
              width: 44px; height: 44px;
              border: 3px solid rgba(255,255,255,0.08);
              border-top-color: #E50914; border-radius: 50%;
              animation: spin 0.75s linear infinite; margin: 0 auto 12px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            .ui-hidden { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.4s; }
          </style>
        </head>
        <body>
          <div id="wrapper">
            <video id="videoPlayer" preload="metadata" playsinline webkit-playsinline>
              ${isHls ? '' : `<source src="${safeVideoUrl}" ${mime ? `type="${mime}"` : ''} />`}
            </video>

            <div id="grad-top"></div>
            <div id="grad-bottom"></div>

            <!-- Top bar -->
            <div id="top-bar">
              <button id="back-btn" onclick="sendMsg('close')">&#8592;</button>
              <div id="titles">
                <div id="anime-name">${animeTitle}</div>
                <div id="ep-name">Ep.&nbsp;${episode.number}&ensp;&mdash;&ensp;${episode.title}</div>
              </div>
            </div>

            <!-- Episode navigation -->
            <button id="nav-prev" class="${hasPreviousEpisode ? '' : 'hidden'}"
              onclick="sendMsg('previous')">&#8249;</button>
            <button id="nav-next" class="${hasNextEpisode ? '' : 'hidden'}"
              onclick="sendMsg('next')">&#8250;</button>

            <!-- Loading -->
            <div id="loading">
              <div class="spinner"></div>
              Cargando...
            </div>

            <!-- Bottom controls -->
            <div id="controls" onmouseenter="pauseHide()" onmouseleave="resumeHide()">
              <div id="progress-wrap">
                <div id="progress-track">
                  <div id="progress-fill"></div>
                </div>
              </div>
              <div id="ctrl-row">
                <button class="ctrl-btn" id="play-btn" onclick="togglePlay()">&#9654;</button>
                <span id="time-display"><b id="time-cur">0:00</b> / <span id="time-tot">0:00</span></span>
                <div id="vol-wrap">
                  <span id="vol-icon" onclick="toggleMute()">&#128266;</span>
                  <input type="range" id="vol-slider" min="0" max="1" step="0.05" value="1"
                    oninput="setVol(this.value)" />
                </div>
                <button class="ctrl-btn" id="fs-btn" onclick="toggleFullscreen()">&#x26F6;</button>
              </div>
            </div>
          </div>

          <script>
            ${isHls ? `
            var hlsScript = document.createElement('script');
            hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
            document.head.appendChild(hlsScript);
            ` : ''}

            var video = document.getElementById('videoPlayer');
            var playBtn = document.getElementById('play-btn');
            var progressFill = document.getElementById('progress-fill');
            var progressWrap = document.getElementById('progress-wrap');
            var timeCur = document.getElementById('time-cur');
            var timeTot = document.getElementById('time-tot');
            var loadingEl = document.getElementById('loading');
            var topBar = document.getElementById('top-bar');
            var controls = document.getElementById('controls');
            var gradTop = document.getElementById('grad-top');
            var gradBottom = document.getElementById('grad-bottom');
            var navPrev = document.getElementById('nav-prev');
            var navNext = document.getElementById('nav-next');
            var volSlider = document.getElementById('vol-slider');
            var hideTimer = null;
            var isPaused = false; // flag: no auto-hide while mouse over controls

            function fmt(s) {
              if (!isFinite(s)) return '0:00';
              var m = Math.floor(s / 60), sec = Math.floor(s % 60);
              return m + ':' + (sec < 10 ? '0' : '') + sec;
            }
            function sendMsg(action) {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
                JSON.stringify({ action: action })
              );
            }
            function sendProgressNow(force) {
              if (!video || !video.duration) return;
              var ct = video.currentTime || 0;
              var dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 0;
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
                JSON.stringify({ action: 'progress', current_time: ct, duration: dur, force: !!force })
              );
            }
            function togglePlay() {
              if (video.paused) { video.play().catch(function(){}); }
              else { video.pause(); }
            }
            function setVol(v) {
              video.volume = parseFloat(v);
              video.muted = parseFloat(v) === 0;
            }
            function toggleMute() {
              video.muted = !video.muted;
              volSlider.value = video.muted ? 0 : video.volume;
            }
            function toggleFullscreen() {
              if (document.fullscreenElement) { document.exitFullscreen(); }
              else { document.documentElement.requestFullscreen().catch(function(){}); }
            }
            function showUI() {
              [topBar, controls, gradTop, gradBottom, navPrev, navNext].forEach(function(el){
                if (el) el.classList.remove('ui-hidden');
              });
              if (!isPaused) scheduleHide();
            }
            function scheduleHide() {
              clearTimeout(hideTimer);
              hideTimer = setTimeout(hideUI, 4000);
            }
            function hideUI() {
              [topBar, controls, gradTop, gradBottom, navPrev, navNext].forEach(function(el){
                if (el) el.classList.add('ui-hidden');
              });
            }
            function pauseHide() { isPaused = true; clearTimeout(hideTimer); }
            function resumeHide() { isPaused = false; scheduleHide(); }
            document.addEventListener('mousemove', showUI);
            document.addEventListener('touchstart', showUI);
            video.addEventListener('click', function() { togglePlay(); showUI(); });

            video.addEventListener('timeupdate', function() {
              if (!video.duration) return;
              var pct = (video.currentTime / video.duration) * 100;
              progressFill.style.width = pct + '%';
              if (timeCur) timeCur.textContent = fmt(video.currentTime);
              if (timeTot) timeTot.textContent = fmt(video.duration);
              if (!window.__lastProgressSent) window.__lastProgressSent = 0;
              var now = Date.now();
              if (!window.__lastSentSecond) window.__lastSentSecond = 0;
              var s = Math.floor(video.currentTime || 0);
              if (s > 0 && (s - window.__lastSentSecond) >= 5) {
                window.__lastSentSecond = s;
                window.__lastProgressSent = now;
                sendProgressNow(false);
              }
            });
            progressWrap.addEventListener('click', function(e) {
              var track = document.getElementById('progress-track');
              var rect = (track || progressWrap).getBoundingClientRect();
              var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              if (video.duration) video.currentTime = pct * video.duration;
            });
            video.addEventListener('play', function() {
              playBtn.innerHTML = '&#10074;&#10074;';
              sendMsg('playing');
            });
            video.addEventListener('pause', function() {
              playBtn.innerHTML = '&#9654;';
              sendMsg('paused');
              sendProgressNow(true);
            });
            video.addEventListener('ended', function() {
              playBtn.innerHTML = '&#9654;';
              sendMsg('ended');
              sendProgressNow(true);
            });
            video.addEventListener('waiting', function() { loadingEl.style.display = 'block'; });
            video.addEventListener('canplay', function() { loadingEl.style.display = 'none'; });
            video.addEventListener('loadeddata', function() { loadingEl.style.display = 'none'; });
            video.addEventListener('error', function() {
              loadingEl.innerHTML = '<div>Error al cargar el video</div>';
              sendMsg('error');
            });

            window.addEventListener('message', function(event) {
              try {
                var data = JSON.parse(event.data);
                if (data.action === 'play') video.play().catch(function(){});
                else if (data.action === 'pause') video.pause();
              } catch(e) {}
            });

            function initPlayer() {
              if (${isHls ? 'true' : 'false'}) {
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                  video.src = '${safeVideoUrl}'; video.load();
                } else if (window.Hls && window.Hls.isSupported()) {
                  var hls = new window.Hls({ enableWorker: true, lowLatencyMode: false });
                  hls.on(window.Hls.Events.ERROR, function(_e, data) {
                    if (data.fatal) sendMsg('hls_error');
                  });
                  hls.loadSource('${safeVideoUrl}');
                  hls.attachMedia(video);
                } else {
                  loadingEl.innerHTML = '<div>HLS no soportado</div>';
                }
              } else {
                video.load();
              }
            }
            if (${isHls ? 'true' : 'false'}) {
              if (window.Hls) { initPlayer(); }
              else if (typeof hlsScript !== 'undefined') { hlsScript.onload = initPlayer; }
            } else {
              initPlayer();
            }
            showUI();
          </script>
        </body>
      </html>
    `;

    return (
      <WebView
        ref={webViewRef}
        source={{ html: videoHTML }}
        style={styles.webView}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            switch (data.action) {
              case 'playing':   setIsPlaying(true); break;
              case 'paused':    setIsPlaying(false); break;
              case 'ended':
                setIsPlaying(false);
                if (hasNextEpisode && onNextEpisode) onNextEpisode();
                break;
              case 'progress':
                sendProgress(
                  { current_time: Number(data.current_time || 0), duration: Number(data.duration || 0) },
                  { force: Boolean(data.force) }
                );
                break;
              case 'error':
              case 'hls_error':
                setError(data.error || 'Error al reproducir el video');
                break;
              case 'close':     onClose(); break;
              case 'next':      if (hasNextEpisode && onNextEpisode) onNextEpisode(); break;
              case 'previous':  if (hasPreviousEpisode && onPreviousEpisode) onPreviousEpisode(); break;
            }
          } catch {}
        }}
        onError={() => setError('Error al cargar el reproductor de video')}
      />
    );
  }, [selectedSource, episode, animeTitle, hasNextEpisode, hasPreviousEpisode, onNextEpisode, onPreviousEpisode, onClose]);

  // ── Loading / Error screens ──────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.loadingText}>Cargando episodio...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <LinearGradient
          colors={['#0a0a0a', '#1a0000', '#0a0a0a']}
          style={styles.errorContainer}
        >
          <Ionicons name="alert-circle" size={56} color="#e50914" />
          <Text style={styles.errorTitle}>Error de reproducción</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadEpisodeSources}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>← Volver</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  // ── Main player (web) ────────────────────────────────────────
  // On web, we overlay our own UI on top of the native <video>
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container} {...webContainerProps as any}>
        <StatusBar hidden />

        {/* Video fills 100% */}
        <View style={styles.videoFullscreen}>
          {renderVideoPlayer}
        </View>

        {/* Overlays (auto-hide) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity }]} pointerEvents={showUI ? 'box-none' : 'none'}>
          {/* Top gradient */}
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
            style={styles.gradTop}
            pointerEvents="none"
          />

          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={onClose}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleBlock}>
              <Text style={styles.animeTitleOverlay} numberOfLines={1}>{animeTitle}</Text>
              <Text style={styles.episodeTitleOverlay} numberOfLines={1}>
                Ep. {episode.number} — {episode.title}
              </Text>
            </View>
          </View>

          {/* Floating episode navigation */}
          {hasPreviousEpisode && (
            <TouchableOpacity style={[styles.floatNav, styles.floatNavLeft]} onPress={onPreviousEpisode}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          {hasNextEpisode && (
            <TouchableOpacity style={[styles.floatNav, styles.floatNavRight]} onPress={onNextEpisode}>
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Bottom gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
            style={styles.gradBottom}
            pointerEvents="none"
          />
        </Animated.View>
      </View>
    );
  }

  // ── Mobile: pure WebView (UI inside HTML) ────────────────────
  return (
    <View style={styles.container} {...webContainerProps as any}>
      <StatusBar hidden />
      <View style={styles.videoFullscreen}>
        {renderVideoPlayer}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { color: 'rgba(255,255,255,0.55)', marginTop: 14, fontSize: 13, letterSpacing: 0.2 },

  // Error
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 10, letterSpacing: -0.3 },
  errorText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 21 },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#e50914', paddingHorizontal: 26, paddingVertical: 13,
    borderRadius: 8, marginBottom: 14,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  closeButton: { paddingHorizontal: 24, paddingVertical: 10 },
  closeButtonText: { color: 'rgba(255,255,255,0.38)', fontSize: 13 },

  // Video full bleed
  videoFullscreen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  webView: { flex: 1, backgroundColor: '#000' },
  webVideo: {
    width: '100%', height: '100%',
    backgroundColor: '#000', display: 'block',
    // No browser chrome — controls handled by our overlay
    outline: 'none',
  } as any,
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  placeholderText: { color: 'rgba(255,255,255,0.5)', marginTop: 14, fontSize: 14 },

  // ── Overlay UI (web) ──────────────────────────────────────────
  gradTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 180,               // más alto → mejor fundido
    pointerEvents: 'none' as any,
  },
  gradBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 200,
    pointerEvents: 'none' as any,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 16,
  },
  backBtn: {
    width: 42, height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBlock: { flex: 1 },
  animeTitleOverlay: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  episodeTitleOverlay: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 3,
    fontWeight: '400',
    letterSpacing: 0.1,
  },

  // Floating episode nav arrows
  floatNav: {
    position: 'absolute',
    top: '50%' as any,
    width: 54, height: 54,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginTop: -27,
    // Web shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  floatNavLeft: { left: 24 },
  floatNavRight: { right: 24 },
});

export default EpisodePlayer;
