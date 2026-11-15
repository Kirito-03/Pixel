import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useReaderImage } from '../hooks/useReaderImage';

export default function ReaderImage({ uri, page, active }: { uri: string; page: number; active?: boolean }) {
  const host = useRef<any>(null);
  const [near, setNear] = useState(page <= 2);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(entries => setNear(entries[0].isIntersecting), { rootMargin: '1600px 0px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const image = useReaderImage(uri, active !== false && near);
  const [naturalWidth, setNaturalWidth] = useState(800);
  return <View ref={host} style={{ width: '100%', maxWidth: Math.min(naturalWidth, 800), alignSelf: 'center', minHeight: image.loaded ? 0 : 360, backgroundColor: '#101010' }}>
    {(!image.failed && (near || image.loaded)) && <img key={`${uri}-${image.attempt}`} src={image.source} alt={`Página ${page}`}
      loading={page <= 2 ? 'eager' : 'lazy'} decoding="async"
      onLoad={event => { setNaturalWidth(event.currentTarget.naturalWidth || 800); image.onLoad(); }} onError={image.onError}
      style={{ display: 'block', width: '100%', height: 'auto', opacity: image.loaded ? 1 : 0 }} />}
    {!image.loaded && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 }}>
      <ActivityIndicator color="#E50914" />
      <Text style={{ color: '#ccc' }}>Página {page} · {image.failed ? image.paused ? 'En pausa' : 'Reintentando la imagen…' : 'Cargando…'}</Text>
      {image.failed && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reintentar página ${page}`} onPress={image.retry} style={{ minHeight: 44, padding: 12, backgroundColor: '#252525' }}><Text style={{ color: '#fff' }}>Reintentar ahora</Text></TouchableOpacity>}
      {image.failed && <TouchableOpacity accessibilityRole="button" onPress={() => image.setPaused(!image.paused)} style={{ minHeight: 44, padding: 12 }}><Text style={{ color: '#aaa' }}>{image.paused ? 'Reanudar' : 'Pausar reintentos'}</Text></TouchableOpacity>}
    </View>}
  </View>;
}
