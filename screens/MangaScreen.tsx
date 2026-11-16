import Loader from '../components/Loader';
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
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readingFormat } from '../utils/readingFormat';
import Header from '../components/Header';
import CatalogHero, { CatalogHeroItem } from '../components/CatalogHero';
import { MangaCard, MangaRankingItem, MangaFilter, MangaItemUI } from '../components/MangaComponents';
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
  const [publicationType, setPublicationType] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const formats = ['Todos', 'Manga', 'Manhwa', 'Manhua', 'Webtoon', 'Novela ligera', 'Novela', 'Cómic', 'One-shot', 'Doujinshi', 'Por clasificar'];
  const statusOptions: Array<{ label: string; value: MangaFilter }> = [
    { label: 'Todos', value: 'Todos' },
    { label: 'En emisión', value: 'En emisión' },
    { label: 'Finalizado', value: 'Finalizado' },
    { label: 'Hiatus', value: 'Hiatus' },
    { label: 'Cancelado', value: 'Cancelado' },
  ];
  const genreOptions = [
    'Acción', 'Aventura', 'Comedia', 'Drama', 'Fantasía', 'Romance', 'Ciencia Ficción',
    'Recuentos de la vida', 'Sobrenatural', 'Misterio', 'Terror', 'Psicológico',
    'Artes Marciales', 'Isekai', 'Reencarnación', 'Magia', 'Escolar', 'Seinen', 'Shounen', 'Shoujo',
  ];
  const activeFiltersCount = (activeFilter !== 'Todos' ? 1 : 0) + (publicationType ? 1 : 0) + (selectedGenre ? 1 : 0);
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
            publicationType: publicationType || undefined,
            genre: selectedGenre || undefined,
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
  }, [activeFilter, publicationType, selectedGenre, search, isSmallScreen]);

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
        publicationType: publicationType || undefined,
        genre: selectedGenre || undefined,
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

  const showHero = !search.trim() && activeFilter === 'Todos' && !publicationType && !selectedGenre && heroItems.length > 0;

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
            <View style={[styles.titleRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
              <Text style={[styles.title, { color: colors.text }]}>Lecturas</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Historias en viñetas y otros formatos para descubrir</Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                width: isSmallScreen ? '100%' : 'auto',
              }}
            >
              <View
                style={[
                  styles.searchBox,
                  {
                    backgroundColor: colors.card,
                    flex: isSmallScreen ? 1 : undefined,
                    width: isSmallScreen ? undefined : 320,
                    borderRadius: 4,
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

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Abrir categorías y filtros"
                onPress={() => setCategoriesOpen(true)}
                style={[
                  styles.categoriesBtn,
                  {
                    backgroundColor: activeFiltersCount > 0 ? colors.primary : colors.card,
                    borderColor: activeFiltersCount > 0 ? colors.primary : colors.divider,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={activeFiltersCount > 0 ? '#FFFFFF' : colors.text}
                />
                <Text
                  style={{
                    color: activeFiltersCount > 0 ? '#FFFFFF' : colors.text,
                    fontSize: 13,
                    fontWeight: '700',
                  }}
                >
                  Categorías{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeFiltersCount > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              {selectedGenre ? (
                <TouchableOpacity onPress={() => setSelectedGenre('')} style={[styles.activeTag, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Género: {selectedGenre} ✕</Text>
                </TouchableOpacity>
              ) : null}
              {publicationType ? (
                <TouchableOpacity onPress={() => setPublicationType('')} style={[styles.activeTag, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Formato: {publicationType === 'unknown' ? 'Por clasificar' : publicationType} ✕</Text>
                </TouchableOpacity>
              ) : null}
              {activeFilter !== 'Todos' ? (
                <TouchableOpacity onPress={() => setActiveFilter('Todos')} style={[styles.activeTag, { backgroundColor: colors.card, borderColor: colors.divider }]}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Estado: {activeFilter} ✕</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  setSelectedGenre('');
                  setPublicationType('');
                  setActiveFilter('Todos');
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Limpiar todo</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ── RECIÉN ACTUALIZADOS (GRID) ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recién actualizados</Text>
            </View>

            {loading ? (
              <View style={styles.loaderContainer}>
                <Loader />
              </View>
            ) : mapped.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="book-outline" size={42} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No encontramos lecturas para este filtro.
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
                        publicationType: readingFormat(p),
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

      <Modal
        visible={categoriesOpen}
        transparent
        animationType={isSmallScreen ? 'slide' : 'fade'}
        onRequestClose={() => setCategoriesOpen(false)}
      >
        <Pressable
          style={[
            styles.modalBackdrop,
            { justifyContent: isSmallScreen ? 'flex-end' : 'center', alignItems: 'center' },
          ]}
          onPress={() => setCategoriesOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.divider,
                width: isSmallScreen ? '100%' : Math.min(620, width - 48),
                maxHeight: isSmallScreen ? '82%' : '80%',
                borderRadius: isSmallScreen ? 0 : 12,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingBottom: isSmallScreen ? Math.max(20, insets.bottom + 12) : 20,
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Categorías de Lecturas</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cerrar categorías"
                onPress={() => setCategoriesOpen(false)}
                style={{ padding: 6 }}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 20 }}>
              <View style={{ gap: 10 }}>
                <Text style={[styles.groupTitle, { color: colors.textMuted }]}>ESTADO</Text>
                <View style={styles.chipWrap}>
                  {statusOptions.map((opt) => {
                    const selected = activeFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setActiveFilter(opt.value)}
                        style={[
                          styles.catChip,
                          {
                            backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                            borderColor: selected ? colors.primary : colors.divider,
                          },
                        ]}
                      >
                        <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13, fontWeight: selected ? '700' : '500' }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Text style={[styles.groupTitle, { color: colors.textMuted }]}>FORMATO</Text>
                <View style={styles.chipWrap}>
                  {formats.map((label) => {
                    const value = label === 'Todos' ? '' : label === 'Por clasificar' ? 'unknown' : label;
                    const selected = value === publicationType;
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => setPublicationType(value)}
                        style={[
                          styles.catChip,
                          {
                            backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                            borderColor: selected ? colors.primary : colors.divider,
                          },
                        ]}
                      >
                        <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13, fontWeight: selected ? '700' : '500' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Text style={[styles.groupTitle, { color: colors.textMuted }]}>GÉNERO</Text>
                <View style={styles.chipWrap}>
                  <TouchableOpacity
                    onPress={() => setSelectedGenre('')}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: !selectedGenre ? colors.primary : colors.surfaceElevated,
                        borderColor: !selectedGenre ? colors.primary : colors.divider,
                      },
                    ]}
                  >
                    <Text style={{ color: !selectedGenre ? '#FFFFFF' : colors.text, fontSize: 13, fontWeight: !selectedGenre ? '700' : '500' }}>
                      Todos
                    </Text>
                  </TouchableOpacity>
                  {genreOptions.map((g) => {
                    const selected = selectedGenre === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        onPress={() => setSelectedGenre(selected ? '' : g)}
                        style={[
                          styles.catChip,
                          {
                            backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                            borderColor: selected ? colors.primary : colors.divider,
                          },
                        ]}
                      >
                        <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13, fontWeight: selected ? '700' : '500' }}>
                          {g}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.divider }]}>
              <TouchableOpacity
                onPress={() => {
                  setActiveFilter('Todos');
                  setPublicationType('');
                  setSelectedGenre('');
                }}
                style={[styles.footerBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCategoriesOpen(false)}
                style={[styles.footerBtn, { backgroundColor: colors.primary, flex: 1 }]}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Ver resultados</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  categoriesBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  modalSheet: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: 38,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  footerBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
