import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

export default function DiscoveryCard({ title, poster, width, caption, type = 'Anime', rating, onPress }: {
  title: string; poster?: string; width: number; caption?: string; type?: string; rating?: number; onPress: () => void;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false), [hovered, setHovered] = useState(false);
  React.useEffect(() => setFailed(false), [poster]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${type === 'Manga' ? 'Leer detalles de' : 'Ver'} ${title}`} onPress={onPress}
    onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={[s.card, { width }, hovered && Platform.OS === 'web' && { transform: [{ translateY: -3 }] }]}>
    <View style={[s.art, { height: width * 1.42, backgroundColor: colors.card }]}>
      {poster && !failed ? <Image source={{ uri: poster }} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <Ionicons name={type === 'Manga' ? 'book-outline' : 'film-outline'} size={30} color={colors.textMuted} />}
      {!!rating && rating > 0 && <View style={s.score}><Ionicons name="star" size={10} color="#d8caa3" /><Text style={s.scoreText}>{rating.toFixed(1)}</Text></View>}
    </View>
    <Text numberOfLines={2} style={[s.title, { color: colors.text }]}>{title}</Text>
    <Text numberOfLines={1} style={[s.caption, { color: colors.textMuted }]}>{caption || type}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  card: { minWidth: 0, marginBottom: 20 }, art: { overflow: 'hidden', borderRadius: 3, justifyContent: 'center', alignItems: 'center' },
  score: { position: 'absolute', right: 7, bottom: 7, flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4, backgroundColor: 'rgba(14,18,20,0.85)', borderRadius: 3 },
  scoreText: { color: '#eee', fontSize: 10, fontWeight: '600' }, title: { fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 10, minHeight: 38 }, caption: { fontSize: 11, lineHeight: 16, marginTop: 3 },
});
