import Loader from './Loader';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { NewsArticle } from '../services/newsApi';

type FeedColors = { background: string; card: string; text: string; textMuted: string; primary: string; divider: string };
type Props = {
  items: NewsArticle[]; featured: NewsArticle | null; loading: boolean;
  category: string; categories: string[]; colors: FeedColors; bottomInset: number;
  onCategoryChange: (category: string) => void; onOpen: (article: NewsArticle) => void;
};
const categoryLabels: Record<string, string> = { '': 'Todo', estreno: 'Estrenos', temporada: 'Temporadas', película: 'Películas', tráiler: 'Tráilers', industria: 'Industria', manga: 'Manga', evento: 'Eventos' };
function shortDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  return new Date(value).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}
function Thumbnail({ article, featured = false, colors }: { article: NewsArticle; featured?: boolean; colors: FeedColors }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [article.image_url]);
  return <View style={[featured ? styles.featureImage : styles.thumbnail, { backgroundColor: colors.card }]}>
    {article.image_url && article.has_valid_image !== false && !article.use_fallback_image && !failed ? <Image accessible={false} source={{ uri: article.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} /> :
      <View accessible={false} style={[styles.fallbackIcon, { borderColor: colors.textMuted }]}>
        <View style={{ flexDirection: 'row', gap: 4 }}><View style={{ width: 10, height: 9, backgroundColor: colors.primary }} /><View style={{ flex: 1, gap: 4 }}><View style={[styles.fallbackLine, { backgroundColor: colors.textMuted }]} /><View style={[styles.fallbackLine, { backgroundColor: colors.textMuted }]} /></View></View>
        <View style={[styles.fallbackLine, { backgroundColor: colors.textMuted, marginTop: 4 }]} />
      </View>}
  </View>;
}
function Metadata({ article, colors }: { article: NewsArticle; colors: FeedColors }) {
  return <View style={styles.metadata}>
    <Text style={[styles.category, { color: colors.primary }]} numberOfLines={1}>{categoryLabels[article.category || 'industria'] || article.category || 'Noticias'}</Text>
    {article.published_at ? <Text style={[styles.date, { color: colors.textMuted }]}>{shortDate(article.published_at)}</Text> : null}
  </View>;
}

export default function AndroidNewsFeed({ items, featured, loading, category, categories, colors, bottomInset, onCategoryChange, onOpen }: Props) {
  const { width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(Math.min(width, 1120));
  const columns = measuredWidth >= 720 ? 2 : 1;
  const itemWidth = Math.max(0, (measuredWidth - 32 - (columns - 1) * 16) / columns);
  const highlight = !category && featured && featured.id > 0 ? featured : null;
  const stories = useMemo(() => {
    const seen = new Set<string>();
    return items.filter(article => {
      const key = String(article.slug || article.id);
      if (seen.has(key) || (highlight && key === String(highlight.slug || highlight.id))) return false;
      seen.add(key);
      return !category || article.category === category;
    });
  }, [items, highlight?.slug, highlight?.id, category]);

  return <View style={styles.feed} onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)}>
    <View style={styles.heading}>
      <View style={[styles.accent, { backgroundColor: colors.primary }]} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Noticias</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Anime y manga, al día</Text>
    </View>
    <View style={styles.filters}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filterContent}>
        {categories.map(value => <Pressable key={value || 'all'} hitSlop={{ top: 4, bottom: 4 }} accessibilityRole="button"
          accessibilityLabel={`Filtrar noticias: ${categoryLabels[value] || value}`} accessibilityState={{ selected: category === value }}
          onPress={() => onCategoryChange(value)} style={({ pressed }) => [styles.filter, { backgroundColor: category === value ? colors.primary : colors.card, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.filterText, { color: category === value ? '#fff' : colors.textMuted }]}>{categoryLabels[value] || value}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
    <FlatList key={`news-${columns}-${category}`} data={stories} numColumns={columns} showsVerticalScrollIndicator={false}
      keyExtractor={article => String(article.slug || article.id)} columnWrapperStyle={columns > 1 ? styles.columns : undefined}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(20, bottomInset), flexGrow: stories.length ? undefined : 1 }}
      initialNumToRender={8} maxToRenderPerBatch={6} windowSize={7}
      ListHeaderComponent={<>
        {highlight && <Pressable accessibilityRole="button" accessibilityLabel={`Noticia destacada: ${highlight.title}`} onPress={() => onOpen(highlight)}
          style={({ pressed }) => [styles.feature, { backgroundColor: colors.card, borderLeftColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
          <View style={styles.featureCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>DESTACADA</Text>
            <Text style={[styles.featureTitle, { color: colors.text }]} numberOfLines={3}>{highlight.title}</Text>
            <Text style={[styles.date, { color: colors.textMuted }]}>{shortDate(highlight.published_at)}</Text>
          </View>
          <Thumbnail article={highlight} featured colors={colors} />
        </Pressable>}
        {stories.length > 0 && <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textMuted }]}>{category ? categoryLabels[category] || category : 'Últimas noticias'}</Text>}
      </>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Leer noticia: ${item.title}`}
        onPress={() => onOpen(item)} style={({ pressed }) => [styles.story, { width: itemWidth, borderBottomColor: colors.divider, backgroundColor: pressed ? colors.card : 'transparent' }]}>
        <Thumbnail article={item} colors={colors} />
        <View style={styles.storyCopy}>
          <Metadata article={item} colors={colors} />
          <Text style={[styles.storyTitle, { color: colors.text }]} numberOfLines={3}>{item.title}</Text>
        </View>
        <Text accessible={false} style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </Pressable>}
      ListEmptyComponent={<View style={styles.empty}>
        {loading ? <Loader /> : <>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No hay noticias disponibles</Text>
          <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>Prueba otra categoría o vuelve más tarde.</Text>
          {category ? <Pressable accessibilityRole="button" onPress={() => onCategoryChange('')} style={[styles.reset, { backgroundColor: colors.card }]}><Text style={{ color: colors.text }}>Ver todas</Text></Pressable> : null}
        </>}
      </View>} />
  </View>;
}

const styles = StyleSheet.create({
  feed: { flex: 1, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, columnGap: 10, rowGap: 4 },
  accent: { width: 3, height: 24 }, title: { fontSize: 25, lineHeight: 32, fontWeight: '800' }, subtitle: { fontSize: 12, flexShrink: 1 },
  filters: { paddingBottom: 12 }, filterContent: { paddingHorizontal: 16, gap: 8 },
  filter: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' }, filterText: { fontSize: 12, fontWeight: '600' },
  feature: { minHeight: 144, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderLeftWidth: 3, marginBottom: 16 },
  featureCopy: { flex: 1, minWidth: 0, gap: 7 }, eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  featureTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' }, featureImage: { width: 100, height: 112, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, paddingBottom: 4 },
  columns: { gap: 16 }, story: { minHeight: 104, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  thumbnail: { width: 86, height: 76, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  fallbackIcon: { width: 34, height: 28, borderWidth: 1, padding: 5, opacity: 0.65 }, fallbackLine: { height: 2 },
  storyCopy: { flex: 1, minWidth: 0, gap: 6 }, metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
  category: { fontSize: 10, fontWeight: '700', flexShrink: 1 }, date: { fontSize: 10 }, storyTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  chevron: { fontSize: 22, width: 10 }, empty: { flexGrow: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' }, emptyCopy: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  reset: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
});
