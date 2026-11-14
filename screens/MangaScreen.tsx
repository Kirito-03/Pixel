import React, { useEffect, useMemo, useState, useRef } from 'react';
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
import Header from '../components/Header';
import {
  MangaCard,
  MangaRankingItem,
  MangaFilterChips,
  MangaFilter,
  MangaItemUI,
} from '../components/MangaComponents';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { mangaApi, Manga } from '../services/mangaApi';

const MAX_CONTENT_WIDTH = 1200;

export default function MangaScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const headerHeight = isWeb ? 84 : 56 + insets.top;
  const navigation = useNavigation<any>();
  const { navigateByLabel } = useTabNavigation();

  const containerWidth = Math.min(width, MAX_CONTENT_WIDTH);
  const gutter = isSmallScreen ? 16 : 32;
  const gap = isSmallScreen ? 12 : 16;
  const columns =
    width >= 1060 ? 5 : width >= 820 ? 4 : width >= 580 ? 3 : 2;
  const cardWidth = Math.floor(
    (containerWidth - gutter * 2 - (columns - 1) * gap) / columns
  );

  const [activeFilter, setActiveFilter] = useState<MangaFilter>('Todos');
  const [search, setSearch] = useState('');
  const queryKey = `${activeFilter}:${search}:${isSmallScreen}`;
  const queryRef = useRef(queryKey);
  queryRef.current = queryKey;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<Manga[]>([]);
  const [popular, setPopular] = useState<Array<Manga & { rank: number }>>([]);

  const toUI = (m: Manga): MangaItemUI => {
    let chapterNum: number | string = 0;
    if (m.latest_chapter) {
      const parsed = parseFloat(m.latest_chapter);
      chapterNum = Number.isNaN(parsed) ? m.latest_chapter : parsed;
    } else if (m.chapter_count) {
      chapterNum = m.chapter_count;
    }

    return {
      id: m.id,
      title: m.title,
      image: m.cover_url || '',
      status: m.status,
      chapters: chapterNum,
      updatedAt: m.updated_at || '',
      year: m.year,
    };
  };

  // Cargar populares por separado al montar; no bloquear el catálogo si falla
  useEffect(() => {
    let cancelled = false;
    mangaApi
      .popular({ limit: 5 })
      .then((pop) => {
        if (cancelled) return;
        setPopular((pop?.items || []) as Array<Manga & { rank: number }>);
      })
      .catch(() => {
        if (cancelled) return;
        setPopular([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHasMore(false);
    const run = async () => {
      setLoading(true);
      setError(null);
      setLoadMoreError(null);
      setPage(1);
      try {
        const status = activeFilter === 'Todos' ? undefined : activeFilter;
        const q = search.trim();
        const limit = isSmallScreen ? 24 : 35;
        const list = await mangaApi.list({
          page: 1,
          limit,
          status,
          search: q || undefined,
          order: 'updated',
        });
        if (cancelled) return;
        const rows = (list?.items || list?.data || []) as Manga[];
        const total =
          typeof list?.pagination?.total === 'number'
            ? list.pagination.total
            : null;
        setItems(rows);
        setTotalCount(total);
        setHasMore(
          total !== null
            ? rows.length < total && rows.length > 0
            : rows.length >= limit
        );
      } catch {
        if (cancelled) return;
        setItems([]);
        setTotalCount(null);
        setHasMore(false);
        setError('No pudimos cargar el catálogo de manga. Comprueba tu conexión e inténtalo de nuevo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 240);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeFilter, search, isSmallScreen, reloadKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const startedQuery = queryKey;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = page + 1;
      const status = activeFilter === 'Todos' ? undefined : activeFilter;
      const q = search.trim();
      const limit = isSmallScreen ? 24 : 35;
      const list = await mangaApi.list({
        page: nextPage,
        limit,
        status,
        search: q || undefined,
        order: 'updated',
      });
      const rows = (list?.items || list?.data || []) as Manga[];
      const total =
        typeof list?.pagination?.total === 'number'
          ? list.pagination.total
          : totalCount;

      if (queryRef.current !== startedQuery) return;
      const seen = new Set(items.map((x) => x.id));
      const merged = [...items, ...rows.filter((x) => !seen.has(x.id))];

      setItems(merged);
      setPage(nextPage);
      setTotalCount(total);
      setHasMore(
        total !== null
          ? merged.length < total && rows.length > 0
          : rows.length >= limit
      );
    } catch {
      if (queryRef.current !== startedQuery) return;
      setLoadMoreError('No se pudieron cargar más títulos.');
    } finally {
      setLoadingMore(false);
    }
  };

  const mapped = useMemo(() => items.map(toUI), [items]);

  const resultsLabel = useMemo(() => {
    if (loading) return 'Cargando…';
    if (error) return 'Error de carga';
    if (totalCount !== null && totalCount > mapped.length) {
      return `${mapped.length} de ${totalCount} títulos`;
    }
    const count = totalCount !== null ? totalCount : mapped.length;
    return `${count} ${count === 1 ? 'título' : 'títulos'}`;
  }, [loading, error, totalCount, mapped.length]);

  const borderColor =
    theme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

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
            paddingTop: headerHeight + 12,
            paddingBottom: Math.max(48, insets.bottom + 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.mainContent, { paddingHorizontal: gutter }]}>
          {/* ── CABECERA EDITORIAL COMPACTA Y BUSCADOR ── */}
          <View
            style={[
              styles.editorialHeader,
              {
                backgroundColor: colors.card,
                borderColor,
                flexDirection: isSmallScreen ? 'column' : 'row',
                alignItems: isSmallScreen ? 'stretch' : 'center',
              },
            ]}
          >
            <View style={styles.editorialCopy}>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrowDot} />
                <Text style={[styles.eyebrowText, { color: colors.primary }]}>
                  PIXEL NO SEKAI · MANGA
                </Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                Catálogo de Manga
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                Series actualizadas y lectura directa por capítulo.
              </Text>
            </View>

            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.background,
                  borderColor,
                  width: isSmallScreen ? '100%' : 340,
                },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={colors.textMuted || '#888'}
              />
              <TextInput
                accessibilityLabel="Buscar manga"
                placeholder="Buscar título en Manga…"
                placeholderTextColor={colors.textMuted || '#777'}
                value={search}
                onChangeText={setSearch}
                style={[
                  styles.searchInput,
                  { color: colors.text },
                  isWeb
                    ? ({
                        outlineStyle: 'none',
                        outlineWidth: 0,
                        boxShadow: 'none',
                        borderWidth: 0,
                      } as any)
                    : {},
                ]}
                returnKeyType="search"
              />
              {search ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar búsqueda"
                  onPress={() => setSearch('')}
                  style={styles.clearBtn}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* ── FILTROS HORIZONTALES Y CONTEO ── */}
          <View style={styles.filtersRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersScroll}
              style={{ flex: 1 }}
            >
              <MangaFilterChips active={activeFilter} onChange={setActiveFilter} />
            </ScrollView>
            <Text style={[styles.resultsCount, { color: colors.textMuted }]}>
              {resultsLabel}
            </Text>
          </View>

          {/* ── CATÁLOGO (GRID) ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {search.trim() ? 'Resultados' : 'Recién actualizados'}
              </Text>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : error ? (
              <View
                style={[
                  styles.stateCard,
                  { backgroundColor: colors.card, borderColor },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={38}
                  color={colors.primary}
                />
                <Text style={[styles.stateTitle, { color: colors.text }]}>
                  Error al cargar el catálogo
                </Text>
                <Text style={[styles.stateText, { color: colors.textMuted }]}>
                  {error}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar carga de manga"
                  style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setReloadKey((k) => k + 1)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={16} color="#FFF" />
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : mapped.length === 0 ? (
              <View
                style={[
                  styles.stateCard,
                  { backgroundColor: colors.card, borderColor },
                ]}
              >
                <Ionicons
                  name="book-outline"
                  size={38}
                  color={colors.textMuted}
                />
                <Text style={[styles.stateTitle, { color: colors.text }]}>
                  Sin resultados
                </Text>
                <Text style={[styles.stateText, { color: colors.textMuted }]}>
                  No encontramos mangas para este filtro o búsqueda.
                </Text>
                {(activeFilter !== 'Todos' || search.trim().length > 0) && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[
                      styles.secondaryActionBtn,
                      { borderColor },
                    ]}
                    onPress={() => {
                      setActiveFilter('Todos');
                      setSearch('');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.secondaryActionText, { color: colors.text }]}>
                      Restablecer filtros
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                <View style={[styles.catalogGrid, { gap }]}>
                  {mapped.map((it) => (
                    <View key={it.id} style={{ width: cardWidth }}>
                      <MangaCard
                        item={it}
                        onPress={() =>
                          navigation.navigate('MangaDetail', { id: it.id })
                        }
                      />
                    </View>
                  ))}
                </View>

                {loadMoreError ? (
                  <View style={styles.loadMoreErrorBox}>
                    <Text style={styles.loadMoreErrorText}>{loadMoreError}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                      onPress={loadMore}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.retryBtnText}>Reintentar</Text>
                    </TouchableOpacity>
                  </View>
                ) : hasMore ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[
                      styles.loadMoreBtn,
                      { backgroundColor: colors.card, borderColor },
                    ]}
                    onPress={loadMore}
                    disabled={loadingMore}
                    activeOpacity={0.85}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Text
                          style={[styles.loadMoreText, { color: colors.text }]}
                        >
                          {totalCount !== null
                            ? `Cargar más (${mapped.length} de ${totalCount})`
                            : 'Cargar más'}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={16}
                          color={colors.text}
                        />
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>

          {/* ── POPULARES (CARGADO POR SEPARADO) ── */}
          {!search.trim() && activeFilter === 'Todos' && popular.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionBar} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Populares
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rankingScroll}
              >
                {popular.map((p, idx) => (
                  <View key={p.id} style={{ width: isSmallScreen ? 264 : 300 }}>
                    <MangaRankingItem
                      item={{
                        id: p.id,
                        title: p.title,
                        image: p.cover_url || '',
                        status: p.status,
                        chapters: p.latest_chapter || p.chapter_count || 0,
                        rank: p.rank || idx + 1,
                        updatedAt: p.updated_at || '',
                        year: p.year,
                      }}
                      isTop={idx === 0}
                      onPress={() =>
                        navigation.navigate('MangaDetail', { id: p.id })
                      }
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
  mainContent: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },

  editorialHeader: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  editorialCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E50914',
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    minHeight: 42,
  },
  clearBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  filtersScroll: {
    paddingRight: 8,
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },

  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionBar: { width: 3, height: 18, backgroundColor: '#E50914' },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },

  catalogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  rankingScroll: { gap: 12, paddingRight: 8 },

  loadMoreBtn: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 8,
    borderWidth: 1,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700' },

  loadMoreErrorBox: {
    marginTop: 20,
    alignItems: 'center',
    gap: 10,
  },
  loadMoreErrorText: {
    color: '#ff9090',
    fontSize: 13,
    textAlign: 'center',
  },

  stateCard: {
    alignItems: 'center',
    paddingVertical: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 420,
  },
  retryBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    marginTop: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loaderContainer: {
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
