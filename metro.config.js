// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ── Platform-specific module resolution ────────────────────────
// Ensure Metro correctly prioritizes .web.tsx on web and .tsx on native.
// This is critical for platform-split components like EpisodePlayer.
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
];

// ── Exclude web-only packages from native bundle ───────────────
// hls.js uses browser APIs (window, document, XMLHttpRequest prototypes)
// that don't exist in React Native. Even dynamic require() causes Metro
// to resolve and bundle the module. We block it entirely on native.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'hls.js' && platform !== 'web') {
    // Return an empty module for native platforms
    return {
      type: 'empty',
    };
  }
  // Fall back to default resolution for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
