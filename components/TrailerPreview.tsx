import React from 'react';
import { WebView } from 'react-native-webview';
export default function TrailerPreview({ id }: { id: string }) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const url = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&fs=0&rel=0&hl=es`;
  return <WebView source={{ html: `<html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:black"><iframe title="Tráiler" src="${url}" style="border:0;width:100%;height:100vh" allow="autoplay; encrypted-media" allowfullscreen></iframe></body></html>`, baseUrl: 'https://pixelnosekai.com' }} style={{ flex: 1, minHeight: 200, backgroundColor: '#000' }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} />;
}
