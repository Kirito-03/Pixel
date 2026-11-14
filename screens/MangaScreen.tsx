import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../components/Header';
import { MangaCard, MangaRankingItem, MangaFilterChips, MangaFilter, MangaItemUI } from '../components/MangaComponents';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { mangaApi, Manga } from '../services/mangaApi';

export default function MangaScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 90 : (56 + insets.top);
  const navigation = useNavigation<any>();
  const { navigateByLabel } = useTabNavigation();

  const gutter = isSmallScreen ? 16 : width >= 1200 ? 32 : 24;
  const gap = isSmallScreen ? 12 : 16;
  const columns =
    width >= 1360 ? 6 : width >= 1100 ? 5 : width >= 820 ? 4 : width >= 560 ? 3 : 2;
  const containerWidth = Math.min(width, 1440);
  const cardWidth = Math.floor((containerWidth - gutter * 2 - (columns - 1) * gap) / columns);

  const [activeFilter, setActiveFilter] = useState<MangaFilter>('Todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<Manga[]>([]);
  const [popular, setPopular] = useState<Array<Manga & { rank: number }>>([]);

  const stableRating = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const base = 7.8 + (h % 180) / 100;
    return Math.max(7.8, Math.min(9.8, base));
  };

  const toUI = (m: Manga): MangaItemUI => {
    let chapterNum: number | string = 0;
    if (m.latest_chapter) {
      const parsed = parseFloat(m.latest_chapter);
      chapterNum = isNaN(parsed) ? m.latest_chapter : parsed;
    } else if (m.chapter_count) {
      chapterNum = m.chapter_count;
    }

    return {
      id: m.id,
      title: m.title,
      image: m.cover_url || '',
      status: m.status,
      rating: stableRating(m.id),
      chapters: chapterNum,
      updatedAt: m.updated_at || new Date().toISOString(),
    };
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setPage(1);
      try {
        const status = activeFilter === 'Todos' ? undefined : activeFilter;
        const q = search.trim();
        const limit = isSmallScreen ? 24 : 36;
        const [list, pop] = await Promise.all([
          mangaApi.list({
            page: 1,
            limit,
            status,
            search: q || undefined,
            order: 'updated',
          }),
          mangaApi.popular({ limit: 6 }).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        const rows = (list.items || list.data || []) as Manga[];
        setItems(rows);
        setHasMore(rows.length >= limit);
        setPopular((pop.items || []) as Array<Manga & { rank: number }>);
      } catch {
        if (cancelled) return;
        setItems([]);
        setHasMore(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 240);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeFilter, search, isSmallScreen]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const status = activeFilter === 'Todos' ? undefined : activeFilter;
      const q = search.trim();
      const limit = isSmallScreen ? 24 : 36;
      const list = await mangaApi.list({
        page: nextPage,
        limit,
        status,
        search: q || undefined,
        order: 'updated',
      });
      const rows = (list.items || list.data || []) as Manga[];
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...rows.filter((x) => !seen.has(x.id))];
      });
      setPage(nextPage);
      setHasMore(rows.length >= limit);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const mapped = useMemo(() => items.map(toUI), [items]);
  const featured = !search.trim() && activeFilter === 'Todos' && popular.length > 0 ? popular[0] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        black={theme === 'dark'}
        activeSection="Manga"
        onProfilePress={() => navigateByLabel('Perfil')}
        onSearchPress={() => navigateByLabel('Buscar')}
        onNavPress={navigateByLabel}
      />
      <View style={{ height: headerHeight }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: gutter, paddingBottom: Math.max(48, insets.bottom + 24) },
        ]}
      >
        <View style={styles.boundedContent}>
          {/* ── HERO DESTACADO ── */}
          {featured ? (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => navigation.navigate('MangaDetail', { id: featured.id })}
              style={[
                styles.heroCard,
                {
                  backgroundColor: colors.card,
                  borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              {featured.cover_url ? (
                <Image
                  source={{ uri: featured.cover_url }}
                  style={styles.heroBackdrop}
                  resizeMode="cover"
                  blurRadius={Platform.OS === 'web' ? 18 : 12}
                />
              ) : null}
              <LinearGradient
                colors={['rgba(10,10,14,0.68)', 'rgba(10,10,14,0.92)', '#0A0A0E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[styles.heroInner, isSmallScreen && styles.heroInnerMobile]}>
                {featured.cover_url ? (
                  <Image
                    source={{ uri: featured.cover_url }}
                    style={[styles.heroCover, isSmallScreen && styles.heroCoverMobile]}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={styles.heroCopy}>
                  <View style={styles.heroBadgeRow}>
                    <View style={styles.heroTopPill}>
                      <Ionicons name="flame" size={12} color="#FFF" />
                      <Text style={styles.heroTopPillText}>TOP #1 DESTACADO</Text>
                    </View>
                    <View style={styles.heroMetaPill}>
                      <Ionicons name="star" size={12} color="#FFD700" />
                      <Text style={styles.heroMetaPillText}>{stableRating(featured.id).toFixed(1)}</Text>
                    </View>
                    {featured.chapter_count ? (
                      <View style={styles.heroMetaPill}>
                        <Text style={styles.heroMetaPillText}>{featured.chapter_count} caps.</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.heroTitle, isSmallScreen && { fontSize: 22, lineHeight: 28 }]} numberOfLines={2}>
                    {featured.title}
                  </Text>
                  <Text style={styles.heroDesc} numberOfLines={isSmallScreen ? 2 : 3}>
                    {featured.description || 'Explora los capítulos disponibles en alta calidad desde MangaDex y sigue tu lectura al instante.'}
                  </Text>
                  <View style={styles.heroActions}>
                    <TouchableOpacity
                      style={styles.heroPrimaryBtn}
                      onPress={() => navigation.navigate('MangaDetail', { id: featured.id })}
                    >
                      <Ionicons name="book" size={16} color="#FFF" />
                      <Text style={styles.heroPrimaryBtnText}>Leer ahora</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* ── HEADER + BUSCADOR ── */}
          <View style={styles.toolbarHeader}>
            <View>
              <Text style={[styles.superTitle, { color: colors.primary }]}>BIBLIOTECA MANGADEX</Text>
              <Text style={[styles.mainTitle, { color: colors.text, fontSize: isSmallScreen ? 28 : 36 }]}>
                Manga
              </Text>
            </View>
            <View
              style={[
                styles.searchWrapper,
                {
                  backgroundColor: colors.card,
                  borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  width: isSmallScreen ? '100%' : 360,
                },
              ]}
            >
              <Ionicons name="search" size={18} color={colors.textMuted || '#888'} style={{ marginLeft: 14, marginRight: 10 }} />
              <TextInput
                style={[
                  styles.searchInput,
                  { color: colors.text },
                  Platform.OS === 'web'
                    ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderWidth: 0 } as any)
                    : {},
                ]}
                placeholder="Buscar manga por título..."
                placeholderTextColor={colors.textMuted || '#777'}
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch('')} style={{ paddingHorizontal: 12 }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted || '#777'} />
                </TouchableOpacity>
              ) : loading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 14 }} />
              ) : null}
            </View>
          </View>

          {/* ── POPULARES (RANKING) ── */}
          {!search.trim() && popular.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="trending-up" size={20} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Populares de la semana</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingScroll}>
                {popular.map((p, idx) => (
                  <View key={p.id} style={{ width: isSmallScreen ? 270 : 320 }}>
                    <MangaRankingItem
                      item={{
                        id: p.id,
                        title: p.title,
                        image: p.cover_url || '',
                        status: p.status,
                        rating: stableRating(p.id),
                        chapters: p.chapter_count || p.latest_chapter || 0,
                        rank: p.rank || idx + 1,
                        updatedAt: p.updated_at || '',
                      }}
                      isTop={idx === 0}
                      onPress={() => navigation.navigate('MangaDetail', { id: p.id })}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── FILTROS Y CATÁLOGO ── */}
          <View style={styles.section}>
            <View style={[styles.filtersWrapper, { borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <MangaFilterChips active={activeFilter} onChange={setActiveFilter} />
              </ScrollView>
              <Text style={[styles.resultsCount, { color: colors.textMuted }]}>{mapped.length} títulos</Text>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : mapped.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="book-outline" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No encontramos mangas para este filtro.</Text>
              </View>
            ) : (
              <>
                <View style={[styles.catalogGrid, { gap }]}>
                  {mapped.map((it) => (
                    <View key={it.id} style={{ width: cardWidth }}>
                      <MangaCard
                        item={it}
                        onPress={() => navigation.navigate('MangaDetail', { id: it.id })}
                      />
                    </View>
                  ))}
                </View>

                {hasMore ? (
                  <TouchableOpacity
                    style={[styles.loadMoreBtn, { backgroundColor: colors.card, borderColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' }]}
                    onPress={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Text style={[styles.loadMoreText, { color: colors.text }]}>Cargar más mangas</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.text} />
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 16, flexGrow: 1 },
  boundedContent: { width: '100%', maxWidth: 1440, alignSelf: 'center' },

  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 28,
    position: 'relative',
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 24,
  },
  heroInnerMobile: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
  },
  heroCover: {
    width: 132,
    aspectRatio: 2 / 3,
    borderRadius: 10,
    backgroundColor: '#1a1a22',
  },
  heroCoverMobile: {
    width: 92,
  },
  heroCopy: { flex: 1, gap: 10 },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  heroTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E50914',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroTopPillText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroMetaPillText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#FFF', fontSize: 28, fontWeight: '900', lineHeight: 34 },
  heroDesc: { color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 20 },
  heroActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  heroPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E50914',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  heroPrimaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  toolbarHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    marginBottom: 24,
  },
  superTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2.4, marginBottom: 4 },
  mainTitle: { fontWeight: '900', letterSpacing: -0.6 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', height: '100%' },

  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  rankingScroll: { gap: 12, paddingRight: 8 },

  filtersWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 20,
  },
  resultsCount: { fontSize: 12, fontWeight: '600' },

  catalogGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  loadMoreBtn: {
    marginTop: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700' },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
    borderRadius: 14,
    gap: 12,
  },
  emptyText: { fontSize: 14 },
  loaderContainer: { minHeight: 220, justifyContent: 'center', alignItems: 'center' },
});
