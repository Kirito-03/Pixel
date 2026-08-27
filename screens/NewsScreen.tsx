import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { Linking } from 'react-native';
import { MOCK_TRENDING } from '../data/mockNews';
import { NewsHero, NewsCard, TrendingItem } from '../components/NewsComponents';
import Header from '../components/Header';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { newsApi, NewsArticle } from '../services/newsApi';

const LOCAL_FALLBACK_HERO: NewsArticle = {
  id: -1,
  title: 'Noticias Destacadas',
  slug: '__fallback-local__',
  excerpt: 'Actualizando noticias. Vuelve en breve para ver lo más reciente.',
  content: null,
  source_name: 'Pixel no Sekai',
  source_url: null,
  image_url: null,
  published_at: new Date().toISOString(),
  category: 'industria',
  tags: [],
  language: 'es',
  is_featured: true,
  external_url: null,
  has_valid_image: false,
  is_publishable: true,
  quality_score: 100,
  use_fallback_image: true,
};

function summarizeFromParts(title?: string | null, excerpt?: string | null, content?: string | null) {
  const text = String(excerpt || content || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 180);
  const fallback = String(title || '').replace(/\s+/g, ' ').trim();
  return fallback ? `${fallback.slice(0, 140)}...` : 'Sin resumen disponible.';
}

export default function NewsScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const navigation = useNavigation<any>();
  const { navigateByLabel } = useTabNavigation();
  const [blackHeader, setBlackHeader] = useState(theme === 'dark');
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<NewsArticle | null>(null);
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [trending, setTrending] = useState<Array<{ id: string; rank: number; title: string; description: string }>>([]);
  const [category, setCategory] = useState<string>('');

  const categories = useMemo(
    () => ['', 'estreno', 'temporada', 'película', 'tráiler', 'industria', 'manga', 'evento'],
    []
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const f = await newsApi.featured({ limit: 9 });
        const list = await newsApi.list({ category: category || undefined, page: 1, limit: 18 });
        const t = await newsApi.trending();
        if (cancelled) return;
        setFeatured(f.featured);

        const bySlug = new Map<string, NewsArticle>();
        const pushMany = (arr: NewsArticle[]) => {
          for (const row of arr || []) {
            const key = String(row?.slug || row?.id || '').trim();
            if (!key) continue;
            if (!bySlug.has(key)) bySlug.set(key, row);
          }
        };
        pushMany(list.data || []);
        pushMany(f.items || []);
        pushMany(t.items || []);
        if (f.featured) pushMany([f.featured]);
        setItems(Array.from(bySlug.values()));

        setTrending(
          ((t.items && t.items.length ? t.items : list.data) || []).slice(0, 4).map((a, idx) => ({
            id: String(a.slug || a.id),
            rank: idx + 1,
            title: a.title,
            description: summarizeFromParts(a.title, a.excerpt || null, a.content || null),
          }))
        );
      } catch {
        if (cancelled) return;
        setFeatured(LOCAL_FALLBACK_HERO);
        setItems([]);
        setTrending(MOCK_TRENDING.map((x) => ({ id: String(x.id), rank: x.rank, title: x.title, description: x.description })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    setBlackHeader(theme === 'dark');
  }, [theme]);

  const toNewsItem = (a: NewsArticle) => ({
    id: a.slug,
    title: a.title,
    description: summarizeFromParts(a.title, a.excerpt || null, a.content || null),
    image: a.image_url || '',
    badge: (a.category || 'Industria').replace(/^./, (c) => c.toUpperCase()),
    date: a.published_at || new Date().toISOString(),
    featured: a.is_featured,
    url: a.external_url,
  });

  const hero = featured ? toNewsItem(featured) : null;
  const grid = items.filter((n) => n.slug !== featured?.slug).map(toNewsItem);

  // En web 5 columnas, mobile 2 o 1
  const columns = isSmallScreen ? 1 : width < 1024 ? 3 : 5;

  // Chunks para el grid
  const chunks: typeof grid[] = [];
  for (let i = 0; i < grid.length; i += columns) {
    chunks.push(grid.slice(i, i + columns));
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        black={blackHeader}
        activeSection="Noticias"
        onProfilePress={() => navigateByLabel('Perfil')}
        onSearchPress={() => navigateByLabel('Buscar')}
        onNavPress={navigateByLabel}
      />
      <View style={{ height: Platform.OS === 'web' ? 90 : 0 }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── PAGE HEADER ── */}
        <SafeAreaView>
          <View style={styles.pageHeader}>
            <Text style={[styles.superTitle, { color: colors.primary }]}>ÚLTIMAS NOVEDADES</Text>
            <View style={styles.titleRow}>
              <Text style={[styles.pageTitleWhite, { color: colors.text }]}>NOTI</Text>
              <Text style={styles.pageTitleRed}>CIAS</Text>
            </View>
            <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>DEL MUNDO DEL ANIME Y MANGA</Text>
          </View>
        </SafeAreaView>

        {/* ── HERO ── */}
        {hero ? (
          <NewsHero
            item={hero as any}
            onPress={() => hero.url ? Linking.openURL(hero.url) : navigation.navigate('NewsDetail', { slug: String((featured as any)?.slug || hero.id) })}
          />
        ) : null}

        {/* ── CATEGORIES ── */}
        <View style={styles.categoryRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRowInner}>
            {categories.map((c) => {
              const active = c === category;
              const label = c ? c.toUpperCase() : 'TODO';
              return (
                <TouchableOpacity
                  key={c || 'all'}
                  activeOpacity={0.9}
                  onPress={() => setCategory(c)}
                  style={[styles.categoryChip, active && styles.categoryChipActive, { backgroundColor: active ? (theme === 'dark' ? 'rgba(229,9,20,0.2)' : 'rgba(229,9,20,0.1)') : 'transparent', borderColor: active ? '#E50914' : (theme === 'dark' ? '#333' : '#ccc') }]}
                >
                  <Text style={[styles.categoryChipText, { color: colors.textMuted }, active && [styles.categoryChipTextActive, { color: colors.text }]]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── GRID SECTION ── */}
        <View style={styles.section}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#E50914" />
            </View>
          ) : grid.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="newspaper-outline" size={46} color={theme === 'dark' ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.2)"} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Sin noticias</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Intenta otra categoría o vuelve más tarde</Text>
            </View>
          ) : (
            chunks.map((chunk, ci) => (
              <View key={ci} style={styles.gridRow}>
                {chunk.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item as any}
                    onPress={() => item.url ? Linking.openURL(item.url) : navigation.navigate('NewsDetail', { slug: String(item.id) })}
                  />
                ))}
                {chunk.length < columns &&
                  Array.from({ length: columns - chunk.length }).map((_, i) => (
                    <View key={`pad-${i}`} style={{ flex: 1 }} />
                  ))}
              </View>
            ))
          )}
        </View>

        {/* ── TENDENCIAS ── */}
        <View style={styles.section}>
          {/* Título de sección con ícono */}
          <View style={styles.sectionHeader}>
            <Ionicons name="trending-up" size={20} color="#E50914" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tendencias</Text>
          </View>

          {/* Lista en dos columnas en web */}
          <View style={isSmallScreen ? styles.trendingCol : styles.trendingGrid}>
            {(trending.length ? trending : MOCK_TRENDING.map((x) => ({ id: String(x.id), rank: x.rank, title: x.title, description: x.description }))).map(item => (
              <View
                key={item.id}
                style={isSmallScreen ? { width: '100%' } : styles.trendingCell}
              >
                <TrendingItem
                  rank={item.rank}
                  title={item.title}
                  description={item.description}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Espacio final */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    paddingTop: 10,
  },

  /* PAGE HEADER */
  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  superTitle: {
    color: '#E50914',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pageTitleWhite: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pageTitleRed: {
    color: '#E50914',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pageSubtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  /* SECTION */
  section: {
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  /* GRID */
  gridRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  categoryRow: {
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  categoryRowInner: {
    gap: 10,
    paddingRight: 12,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  categoryChipActive: {
    backgroundColor: 'rgba(229,9,20,0.22)',
    borderColor: 'rgba(229,9,20,0.35)',
  },
  categoryChipText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  loadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
  },

  /* TRENDING */
  trendingCol: {
    flexDirection: 'column',
  },
  trendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  trendingCell: {
    flex: 1,
    minWidth: 280,
  },
});
