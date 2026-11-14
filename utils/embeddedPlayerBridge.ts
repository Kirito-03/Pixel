/** Native WebView only: preserve provider playback controls while preventing ad popups. */
export const EMBEDDED_PLAYER_BRIDGE = `
(function () {
  if (window.__pixelMediaBridge) return true;
  window.__pixelMediaBridge = true;
  window.open = function () { return null; };
  var playerSelector = 'video, #player, .plyr, .jwplayer, .video-js, .vjs-control, .mejs-container';
  function video() {
    var found = document.querySelector('video');
    if (found) return found;
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try { found = frames[i].contentDocument && frames[i].contentDocument.querySelector('video'); if (found) return found; } catch (_) {}
    }
    return null;
  }
  function send(value) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(value)); }
  function report() {
    var media = video();
    send({ type: 'pixel:player', canControl: !!media, playing: !!media && !media.paused, currentTime: media ? media.currentTime : 0, duration: media && Number.isFinite(media.duration) ? media.duration : 0 });
  }
  window.__pixelTogglePlayback = function () {
    var media = video();
    if (!media) return;
    if (!media.paused) media.pause();
    else { var result = media.play(); if (result && result.catch) result.catch(function () {}); }
    report();
  };
  function cleanAds() {
    var ads = document.querySelectorAll('iframe[src*="doubleclick"],iframe[src*="googlesyndication"],div[id^="ad-"],div[class^="ad-"],a[target="_blank"]');
    for (var i = 0; i < ads.length; i++) {
      if (!ads[i].closest(playerSelector) && !ads[i].querySelector('video')) ads[i].remove();
    }
  }
  document.addEventListener('click', function (event) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('user_interaction');
    var anchor = event.target && event.target.closest ? event.target.closest('a') : null;
    if (anchor && !anchor.closest(playerSelector)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  document.addEventListener('touchstart', function () {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('user_interaction');
  }, true);
  ['play', 'pause', 'ended', 'loadedmetadata'].forEach(function (name) { document.addEventListener(name, report, true); });
  cleanAds(); report(); setInterval(function () { cleanAds(); report(); }, 1500);
  return true;
})();
`;
