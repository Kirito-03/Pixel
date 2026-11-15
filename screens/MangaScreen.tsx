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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readingFormat } from '../utils/readingFormat';
import Header from '../components/Header';
import CatalogHero, { CatalogHeroItem } from '../components/CatalogHero';
import { MangaCard, MangaRankingItem, MangaFilterChips, MangaFilter, MangaItemUI } from '../components/MangaComponents';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { mangaApi, Manga } from '../services/mangaApi';

export default function MangaScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const headerHeight = isWeb ? 90 : (56 + insets.top);
  const navigation = useNavigation<any>();
  const { navigateByLabel } = useTabNavigation();

  const gutter = isSmallScreen ? 16 : 40;
  const gap = isSmallScreen ? 10 : 14;
  const columns =
    width >= 1360 ? 6 : width >= 1100 ? 5 : width >= 820 ? 4 : width >= 560 ? 3 : 2;
  const cardWidth = Math.floor((width - gutter * 2 - (columns - 1) * gap) / columns);

  const [activeFilter, setActiveFilter] = useState<MangaFilter>('Todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<Manga[]>([]);
  const [popular, setPopular] = useState<Array<Manga & { rank: number }>>([]);

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
      publicationType: readingFormat(m),
      image: m.cover_url || '',
      status: m.status,
      chapters: chapterNum,
      updatedAt: m.updated_at || new Date().toISOString(),
      year: m.year,
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
          mangaApi.popular({ limit: 5 }).catch(() => ({ items: [] })),
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
  const heroItems: CatalogHeroItem[] = useMemo(
    () =>
      popular.slice(0, 5).map((p) => ({
        key: p.id,
        title: p.title,
        poster: p.cover_url || undefined,
        label: readingFormat(p),
        description:
          p.description ||
          'Explora los capítulos disponibles y continúa tu lectura al instante.',
      })),
    [popular]
  );

  const showHero = !search.trim() && activeFilter === 'Todos' && heroItems.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        black={theme === 'dark'}
        activeSection="Manga"
        onProfilePress={() => navigateByLabel('Perfil')}
        onSearchPress={() => navigateByLabel('Buscar')}
        onNavPress={navigateByLabel}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: showHero ? (headerHeight + (isSmallScreen ? 8 : 14)) : (headerHeight + 12),
            paddingBottom: Math.max(48, insets.bottom + 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {showHero ? (
          <CatalogHero
            eyebrow="LECTURAS DESTACADAS"
            items={heroItems}
            onOpen={(id) => navigation.navigate('MangaDetail', { id })}
          />
        ) : null}

        <View style={[styles.mainContent, { paddingHorizontal: gutter, paddingTop: showHero ? 20 : 12 }]}>
          {/* ── CABECERA Y BUSCADOR ── */}
          <View
            style={[
              styles.topSection,
              {
                flexDirection: isSmallScreen ? 'column' : 'row',
                alignItems: isSmallScreen ? 'stretch' : 'center',
                gap: 16,
              },
            ]}
          >
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>Manga y más</Text>
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>MANHWA · MANHUA · MANGA</Text>
              </View>
            </View>

            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.card,
                  width: isSmallScreen ? '100%' : 380,
                },
              ]}
            >
              <Ionicons name="search" size={18} color={colors.textMuted || '#888'} />
              <TextInput
                accessibilityLabel="Buscar manga"
                placeholder="Buscar en esta sección…"
                placeholderTextColor={colors.textMuted || '#777'}
                value={search}
                onChangeText={setSearch}
                style={[
                  styles.searchInput,
                  { color: colors.text },
                  isWeb ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderWidth: 0 } as any) : {},
                ]}
                returnKeyType="search"
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* ── FILTROS ── */}
          <View style={styles.filtersRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <MangaFilterChips active={activeFilter} onChange={setActiveFilter} />
            </ScrollView>
          </View>

          {/* ── RECIÉN ACTUALIZADOS (GRID) ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recién actualizados</Text>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : mapped.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="book-outline" size={42} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No encontramos mangas para este filtro.
                </Text>
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
                    style={[styles.loadMoreBtn, { backgroundColor: colors.card }]}
                    onPress={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Text style={[styles.loadMoreText, { color: colors.text }]}>Cargar más</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.text} />
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>

          {/* ── POPULARES (RANKING) ── */}
          {!search.trim() && popular.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionBar} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Populares</Text>
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
                        chapters: p.chapter_count || p.latest_chapter || 0,
                        updatedAt: p.updated_at || '',
                        year: p.year,
                        rank: p.rank || idx + 1,
                      }}
                      isTop={idx === 0}
                      onPress={() => navigation.navigate('MangaDetail', { id: p.id })}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  mainContent: { width: '100%' },

  topSection: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 0.4 },
  badge: { paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },

  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  resultsCount: { fontSize: 12, fontWeight: '600' },

  section: { marginBottom: 36 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionBar: { width: 3, height: 18, backgroundColor: '#E50914' },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },

  catalogGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  rankingScroll: { gap: 12, paddingRight: 8 },

  loadMoreBtn: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700' },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 56,
    gap: 12,
  },
  emptyText: { fontSize: 14 },
  loaderContainer: { minHeight: 220, justifyContent: 'center', alignItems: 'center' },
});
