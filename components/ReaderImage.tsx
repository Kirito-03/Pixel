import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useReaderImage } from '../hooks/useReaderImage';

export interface ReaderImageProps { uri: string; page: number; active?: boolean; onReady?: () => void }
export default function ReaderImage({ uri, page, active, onReady }: ReaderImageProps) {
  const image = useReaderImage(uri, active);
  const { width } = useWindowDimensions();
  const [size, setSize] = useState({ uri: '', width: 0, height: 0 });
  const renderWidth = Math.min(width, 800);
  const ratio = size.uri === uri && size.width && size.height ? size.width / size.height : 0.72;
  return <View style={{ width: renderWidth, aspectRatio: ratio, alignSelf: 'center', backgroundColor: '#111' }}>
    {!image.failed && <Image key={`${uri}-${image.attempt}`} accessibilityLabel={`Página ${page}`}
      source={{ uri: image.source }} resizeMode="contain" resizeMethod="resize"
      style={StyleSheet.absoluteFill} onLoad={event => {
        const source = event.nativeEvent.source;
        if (source?.width > 0 && source?.height > 0) setSize({ uri, width: source.width, height: source.height });
        image.onLoad(); onReady?.();
      }} onError={image.onError} />}
    {!image.loaded && <View style={styles.status} pointerEvents="box-none">
      <ActivityIndicator color="#83bdb4" />
      <Text style={styles.text}>Página {page}{image.failed ? image.paused ? ' · En pausa' : ' · Reintentando la imagen…' : ''}</Text>
      {image.failed && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reintentar página ${page}`} onPress={image.retry} style={styles.button}><Text style={styles.text}>Reintentar ahora</Text></TouchableOpacity>}
      {image.failed && <TouchableOpacity accessibilityRole="button" onPress={() => image.setPaused(!image.paused)} style={styles.button}><Text style={styles.text}>{image.paused ? 'Reanudar' : 'Pausar reintentos'}</Text></TouchableOpacity>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  status: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 20 },
  text: { color: '#ccc', fontSize: 13, textAlign: 'center' },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#252525' },
});
