import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NewsArticle } from '../services/newsApi';

const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
export default function WebNewsFeed({ items, featured, loading, loadingMore, error, category, categories, total, colors, onCategoryChange, onOpen, onMore, onRetry }: {
  items: NewsArticle[]; featured: NewsArticle | null; loading: boolean; loadingMore: boolean; error: string;
  category: string; categories: string[]; total: number; colors: any;
  onCategoryChange: (value: string) => void; onOpen: (item: NewsArticle) => void; onMore: () => void; onRetry: () => void;
}) {
  const { width } = useWindowDimensions();
  const small = width < 700;
  const columns = width >= 1100 ? 3 : small ? 1 : 2;
  const contentWidth = Math.min(1240, width - (small ? 40 : 80));
  const cardWidth = (contentWidth - (columns - 1) * 28) / columns;
  const hero = !category && featured && !featured.slug.startsWith('__fallback') ? featured : null;
  const rows = items.filter((item, i, all) => item.slug !== hero?.slug && all.findIndex(x => x.slug === item.slug) === i);
  const image = (item: NewsArticle, style: any) => item.image_url
    ? <Image source={{ uri: item.image_url }} style={style} resizeMode="cover" />
    : <View style={[style, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="newspaper-outline" size={32} color={colors.textMuted} /></View>;
  const meta = (item: NewsArticle) => <Text style={[s.meta, { color: colors.textMuted }]} numberOfLines={1}>{item.source_name || 'Noticias'}  ·  {date(item.published_at)}</Text>;
  return <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
    <View style={{ width: contentWidth, alignSelf: 'center' }}>
      <View style={s.heading}>
        <View style={{ flex: 1 }}><Text style={[s.eyebrow, { color: colors.textMuted }]}>ANIME, MANGA Y CULTURA JAPONESA</Text><Text style={[s.title, { color: colors.text }, small && { fontSize: 32 }]}>Noticias</Text></View>
        {!small && <Text style={[s.subtitle, { color: colors.textMuted }]}>Historias para seguir al día.</Text>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {categories.map(c => <TouchableOpacity key={c || 'all'} accessibilityRole="button" accessibilityState={{ selected: c === category }} onPress={() => onCategoryChange(c)} style={[s.filter, { borderBottomColor: c === category ? colors.text : 'transparent' }]}>
          <Text style={{ color: c === category ? colors.text : colors.textMuted, fontWeight: c === category ? '700' : '500', fontSize: 14 }}>{c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Todo'}</Text>
        </TouchableOpacity>)}
      </ScrollView>
      {loading ? <ActivityIndicator style={{ padding: 70 }} color={colors.textMuted} /> : <>
        {hero && <TouchableOpacity accessibilityRole="link" onPress={() => onOpen(hero)} style={[s.hero, small && { flexDirection: 'column' }]}>
          {image(hero, small ? { width: '100%', height: 200 } : { width: '56%', height: 310 })}
          <View style={[s.heroCopy, small ? { padding: 20 } : { padding: 32 }, { backgroundColor: colors.card }]}>
            <Text style={[s.eyebrow, { color: colors.textMuted }]}>{hero.category?.toUpperCase()} / DESTACADA</Text>
            <Text numberOfLines={4} style={[s.heroTitle, { color: colors.text }, small && { fontSize: 23, lineHeight: 29 }]}>{hero.title}</Text>
            {!small && <Text numberOfLines={2} style={[s.excerpt, { color: colors.textMuted }]}>{hero.excerpt}</Text>}
            {meta(hero)}
            <View style={s.read}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Leer en la fuente</Text><Ionicons name="arrow-forward" size={17} color={colors.text} /></View>
          </View>
        </TouchableOpacity>}
        <View style={s.sectionHeading}><Text style={[s.sectionTitle, { color: colors.text }]}>{category ? `Noticias de ${category}` : 'Lo más reciente'}</Text><Text style={[s.meta, { color: colors.textMuted }]}>{total} noticias</Text></View>
        <View style={s.grid}>{rows.map(item => <TouchableOpacity key={item.slug} accessibilityRole="link" onPress={() => onOpen(item)} style={[s.card, { width: cardWidth }, small && { flexDirection: 'row', gap: 16 }]}>
          {image(item, small ? { width: 104, height: 92 } : { width: '100%', height: Math.min(205, cardWidth * 0.53) })}
          <View style={[s.copy, small && { flex: 1, paddingTop: 0 }]}>
            <Text style={[s.category, { color: colors.textMuted }]}>{item.category}</Text>
            <Text numberOfLines={3} style={[s.cardTitle, { color: colors.text }, small && { fontSize: 16, lineHeight: 21 }]}>{item.title}</Text>
            {!small && <Text numberOfLines={2} style={[s.excerpt, { color: colors.textMuted }]}>{item.excerpt}</Text>}
            {meta(item)}
          </View>
        </TouchableOpacity>)}</View>
        {!rows.length && !hero && !error && <Text style={[s.empty, { color: colors.textMuted }]}>Todavía no hay noticias en esta categoría.</Text>}
      </>}
      {!!error && <View style={s.empty}><Text style={{ color: colors.textMuted }}>{error}</Text><TouchableOpacity onPress={onRetry} accessibilityRole="button" style={s.more}><Text style={{ color: colors.text }}>Reintentar</Text></TouchableOpacity></View>}
      {!loading && items.length < total && <TouchableOpacity accessibilityRole="button" disabled={loadingMore} accessibilityState={{ busy: loadingMore }} onPress={onMore} style={[s.more, { backgroundColor: colors.card }]}>
        {loadingMore ? <ActivityIndicator color={colors.text} /> : <><Text style={{ color: colors.text, fontWeight: '600' }}>Más noticias</Text><Ionicons name="arrow-down" size={16} color={colors.text} /></>}
      </TouchableOpacity>}
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({
  scroll: { paddingTop: 28, paddingBottom: 110 }, heading: { flexDirection: 'row', alignItems: 'flex-end', gap: 20, marginBottom: 20 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '600' }, title: { fontSize: 44, fontWeight: '700', marginTop: 8, letterSpacing: -1 }, subtitle: { fontSize: 14, marginBottom: 8 },
  filters: { gap: 26, marginBottom: 28 }, filter: { paddingVertical: 12, minHeight: 44, borderBottomWidth: 2 },
  hero: { flexDirection: 'row', overflow: 'hidden', marginBottom: 38 }, heroCopy: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 13 }, heroTitle: { fontSize: 27, lineHeight: 34, fontWeight: '700' },
  read: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 }, meta: { fontSize: 11, lineHeight: 16 }, excerpt: { fontSize: 14, lineHeight: 21 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, sectionTitle: { fontSize: 21, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 28 }, card: { marginBottom: 10 }, copy: { paddingTop: 14, gap: 8 }, category: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' }, cardTitle: { fontSize: 19, lineHeight: 25, fontWeight: '600' },
  more: { alignSelf: 'center', minHeight: 46, paddingHorizontal: 26, paddingVertical: 14, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', marginTop: 32 }, empty: { padding: 40, alignItems: 'center', textAlign: 'center' },
});
