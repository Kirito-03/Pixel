import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { artworkLayout, panoramaLayout } from '../utils/animeArtwork';

const dimensions = new Map<string, { width: number; height: number }>();

export default function AnimeArtwork({ banner, poster, position, alignTop = false, topOffset = 0, cover = false, backgroundColor = '#050505', preservePanorama = false }: { banner?: string; poster?: string; position?: string; alignTop?: boolean; topOffset?: number; cover?: boolean; backgroundColor?: string; preservePanorama?: boolean }) {
  const [failedBanner, setFailedBanner] = useState(false);
  const uri = !failedBanner && banner ? banner : poster || '';
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [intrinsic, setIntrinsic] = useState<{ uri: string; width: number; height: number } | null>(null);
  useEffect(() => setFailedBanner(false), [banner, poster]);
  useEffect(() => {
    let active = true;
    const cached = dimensions.get(uri);
    if (cached) setIntrinsic({ uri, ...cached });
    else if (uri) Image.getSize(uri, (width, height) => {
      if (!width || !height) return;
      if (dimensions.size >= 100) dimensions.delete(dimensions.keys().next().value!);
      dimensions.set(uri, { width, height });
      if (active) setIntrinsic({ uri, width, height });
    }, () => { if (active && uri === banner) setFailedBanner(true); });
    return () => { active = false; };
  }, [uri, banner]);
  const innerHeight = Math.max(0, frame.height - topOffset);
  const layout = intrinsic?.uri === uri ? artworkLayout({ width: frame.width, height: innerHeight }, intrinsic, position, cover) : null;
  const panorama = preservePanorama && intrinsic?.uri === uri ? panoramaLayout({ width: frame.width, height: innerHeight }, intrinsic) : null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor }]} onLayout={event => setFrame(event.nativeEvent.layout)}>
      <View style={{ position: 'absolute', top: topOffset, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {uri && panorama ? <Image accessible={false} source={{ uri }} resizeMode="cover" blurRadius={24} style={[StyleSheet.absoluteFillObject, { opacity: 0.55 }]} /> : null}
        {uri && layout ? (
          <Image
            source={{ uri }}
            accessible={false}
            resizeMode="stretch"
            style={[{ position: 'absolute' }, panorama || layout, panorama && Platform.OS === 'web' ? ({ maskImage: 'linear-gradient(to bottom, transparent, black 12%, black 82%, transparent)' } as any) : null, !panorama && alignTop && layout.height < innerHeight ? { top: 0 } : null]}
            onError={() => { if (uri === banner) setFailedBanner(true); }}
          />
        ) : null}
      </View>
    </View>
  );
}
