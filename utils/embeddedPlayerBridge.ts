/** Native WebView only: preserve provider playback controls while preventing ad popups. */
export const EMBEDDED_PLAYER_BRIDGE = `
(function () {
  if (window.__pixelMediaBridge) return true;
  window.__pixelMediaBridge = true;

  function silentPing(url) {
    try {
      if (!url || typeof url !== 'string') return;
      if (!/^https?:\\/\\//i.test(url)) return;
      if (typeof fetch === 'function') {
        fetch(url, { mode: 'no-cors', credentials: 'omit', keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  function createFakeWindow(url) {
    var targetUrl = String(url || 'about:blank');
    return {
      closed: false,
      opener: window,
      name: '',
      focus: function () {},
      blur: function () {},
      close: function () { this.closed = true; },
      postMessage: function () {},
      location: {
        href: targetUrl,
        assign: function () {},
        replace: function () {}
      },
      document: {
        open: function () {},
        write: function () {},
        writeln: function () {},
        close: function () {}
      }
    };
  }

  window.open = function (url) {
    if (!url) return null;
    silentPing(String(url));
    return createFakeWindow(url);
  };

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
  window.__pixelSeekPlayback = function (seconds) {
    var media = video();
    if (!media || !Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(media.duration) || media.duration <= 0) return;
    media.currentTime = Math.min(seconds, Math.max(0, media.duration - 1));
    report();
  };
  window.__pixelTogglePlayback = function () {
    var media = video();
    if (!media) return;
    if (!media.paused) media.pause();
    else { var result = media.play(); if (result && result.catch) result.catch(function () {}); }
    report();
  };

  var adSelectors = [
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="clickadu"]',
    'iframe[src*="propellerads"]',
    'iframe[src*="popcash"]',
    'iframe[src*="adcash"]',
    'iframe[src*="exoclick"]',
    'iframe[src*="adsterra"]',
    'iframe[src*="hilltopads"]',
    'iframe[src*="monetag"]',
    'div[id^="ad-"]',
    'div[class^="ad-"]',
    'a[target="_blank"]'
  ].join(',');

  function cleanAds() {
    try {
      var ads = document.querySelectorAll(adSelectors);
      for (var i = 0; i < ads.length; i++) {
        if (!ads[i].closest(playerSelector) && !ads[i].querySelector('video')) {
          ads[i].remove();
        }
      }
    } catch (e) {}
  }

  document.addEventListener('click', function (event) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage('user_interaction');
    }
    var anchor = event.target && event.target.closest ? event.target.closest('a') : null;
    if (anchor && !anchor.closest(playerSelector)) {
      var href = anchor.getAttribute('href') || anchor.href || '';
      var isBlank = (anchor.getAttribute('target') || '').toLowerCase() === '_blank';
      if (isBlank || /^https?:\\/\\//i.test(href)) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        silentPing(href);
      }
    }
  }, true);

  document.addEventListener('touchstart', function () {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('user_interaction');
  }, true);
  ['play', 'pause', 'ended', 'loadedmetadata'].forEach(function (name) { document.addEventListener(name, report, true); });
  cleanAds(); report(); setInterval(function () { cleanAds(); report(); }, 1500);
  if (document.body && typeof MutationObserver !== 'undefined') {
    new MutationObserver(cleanAds).observe(document.body, { childList: true, subtree: true });
  }
  return true;
})();
`;

const AD_AND_TRACKER_PATTERNS = [
  'doubleclick',
  'googlesyndication',
  'googleadservices',
  'adserver',
  'clickadu',
  'propellerads',
  'popcash',
  'adcash',
  'popads',
  'exoclick',
  'juicyads',
  'trafficjunky',
  'adsterra',
  'hilltopads',
  'monetag',
  'tsyndicate',
  'realsrv',
  'onclickalgo',
  'betteradsystem',
  'highperformanceformat',
  'acscdn',
  'pemsrv',
  'magsrv',
  'chaturbate',
  'stripchat',
  'bongacams',
  'livejasmin',
  '1xbet',
  'bet365',
  'zoneid=',
  'clickid=',
];

const SAFE_INTERNAL_SCHEMES = ['http:', 'https:', 'about:', 'blob:', 'data:'];

/**
 * Decide whether a WebView navigation request should proceed inside the embedded player.
 * Blocks external app intents (Chrome/Play Store/etc.) and known ad/popunder URLs.
 */
export function shouldAllowEmbeddedNavigation(
  requestUrl: string,
  _initialVideoUrl?: string
): boolean {
  const raw = String(requestUrl || '').trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  const schemeMatch = lower.match(/^([a-z][a-z0-9+.-]*:)/);
  if (schemeMatch && !SAFE_INTERNAL_SCHEMES.includes(schemeMatch[1])) {
    return false;
  }

  for (const pattern of AD_AND_TRACKER_PATTERNS) {
    if (lower.includes(pattern)) {
      return false;
    }
  }

  return true;
}
