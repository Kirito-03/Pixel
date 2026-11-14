import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { useRoute, useNavigation } from '@react-navigation/native';
import CatalogHero from '../components/CatalogHero';
import { catalogCategories, filterCatalog } from '../utils/catalogFilters';
import HentaiShelf from '../components/HentaiShelf';
import HentaiSeriesModal from '../components/HentaiSeriesModal';
import HentaiVideoPlayer from '../components/HentaiVideoPlayer';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { useTabNavigation } from '../hooks/useTabNavigation';

const FILTERS = ['Todos', 'Nuevos caps', 'Finalizado'] as const;
const SHELF_CHUNK_SIZE = 12;

export default function NSFWScreen() {
  const { colors } = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { adultContentEnabled, currentProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isSmallScreen = width < 768;
  const headerHeight = isWeb ? 90 : 56 + insets.top;
  const { navigateByLabel } = useTabNavigation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [items, setItems] = useState<NSFWAnime[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<string>('Todos');

  // Modals state
  const [selectedAnime, setSelectedAnime] = useState<NSFWAnime | null>(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);

  // Player state
  const [showPlayer, setShowPlayer] = useState(false);
  const [playingServers, setPlayingServers] = useState<{ server: string; url: string }[]>([]);
  const [playingEpisode, setPlayingEpisode] = useState<number>(1);
  const [fetchingVideo, setFetchingVideo] = useState(false);

  // Monotonic request IDs to discard stale async responses on filter/profile/guard changes
  const catalogRequestIdRef = useRef(0);
  const videoRequestIdRef = useRef(0);
  const profileId = currentProfile?.id ?? null;

  const loadContent = useCallback(
    async (overrides?: { filter?: string }) => {
      if (!adultContentEnabled) {
        setLoading(false);
        return;
      }

      const filter = overrides?.filter !== undefined ? overrides.filter : activeFilter;
      const reqId = ++catalogRequestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const data = await nsfwApi.getLatest(undefined, filter);
        if (reqId !== catalogRequestIdRef.current) return;
        setItems(Array.isArray(data) ? data : []);
      } catch {
        if (reqId !== catalogRequestIdRef.current) return;
        setError('No se pudo cargar el catálogo. Intenta nuevamente.');
        setItems([]);
      } finally {
        if (reqId === catalogRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [adultContentEnabled, activeFilter]
  );

  // Reset modals/player and discard in-flight requests on profile change or when +18 is disabled
  useEffect(() => {
    catalogRequestIdRef.current += 1;
    videoRequestIdRef.current += 1;

    setShowSeriesModal(false);
    setSelectedAnime(null);
    setShowPlayer(false);
    setPlayingServers([]);
    setFetchingVideo(false);
    setVideoError(null);
    setError(null);
    setItems([]);

    if (!adultContentEnabled) {
      setLoading(false);
      return;
    }

    loadContent();
    // Intentionally keyed on adultContentEnabled, profileId, and activeFilter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adultContentEnabled, profileId, activeFilter]);

  const handleResetFilters = () => {
    setQuery('');
    setCategory(null);
    setCategoriesOpen(false);
    if (activeFilter !== 'Todos') setActiveFilter('Todos');
  };

  useEffect(() => {
    setQuery('');
    setCategory(null);
    setCategoriesOpen(false);
  }, [profileId, adultContentEnabled]);

  const handleCardPress = (item: NSFWAnime) => {
    if (!adultContentEnabled) return;
    setVideoError(null);
    setSelectedAnime(item);
    setShowSeriesModal(true);
  };

  const handlePlayEpisode = async (slug: string, episodeNumber: number) => {
    if (!adultContentEnabled || fetchingVideo) return;

    const reqId = ++videoRequestIdRef.current;
    setFetchingVideo(true);
    setVideoError(null);

    try {
      const servers = await nsfwApi.getServers(slug, episodeNumber);
      if (reqId !== videoRequestIdRef.current) return;

      if (servers && servers.length > 0) {
        setPlayingServers(servers);
        setPlayingEpisode(episodeNumber);
        setShowPlayer(true);
      } else {
        const msg = 'No se encontraron servidores de video para este episodio.';
        setVideoError(msg);
        if (!isWeb) {
          Alert.alert('Error', msg);
        }
      }
    } catch {
      if (reqId !== videoRequestIdRef.current) return;
      const msg = 'Ocurrió un error al buscar servidores de video.';
      setVideoError(msg);
      if (!isWeb) {
        Alert.alert('Error', msg);
      }
    } finally {
      if (reqId === videoRequestIdRef.current) {
        setFetchingVideo(false);
      }
    }
  };

  const closePlayer = () => {
    setShowPlayer(false);
    setPlayingServers([]);
  };

  // Deduplicate items so no title repeats across shelves
  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    const result: NSFWAnime[] = [];
    for (const item of items) {
      const key = item.slug || String(item.id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }, [items]);

  useEffect(() => {
    if (!adultContentEnabled || loading || typeof route.params?.slug !== 'string') return;
    const selected = uniqueItems.find(item => item.slug === route.params.slug);
    if (!selected) return;
    setSelectedAnime(selected);
    setShowSeriesModal(true);
    navigation.setParams({ slug: undefined });
  }, [route.params?.slug, uniqueItems, adultContentEnabled, loading, navigation]);

  const categories = useMemo(() => catalogCategories(uniqueItems), [uniqueItems]);
  const filteredItems = useMemo(() => filterCatalog(uniqueItems, query, category), [uniqueItems, query, category]);
  const heroItems = useMemo(() => uniqueItems.slice(0, 5).map(item => ({
    key: item.slug || String(item.id), title: item.title, poster: item.poster_path,
    banner: item.banner_path || item.banner_url || item.backdrop_path,
    description: item.synopsis,
  })), [uniqueItems]);
  const hasHero = adultContentEnabled && !loading && !error && heroItems.length > 0;
  // Partition all unique items into disjoint horizontal shelves of 12 (no silent truncation)
  const shelves = useMemo(() => {
    const groups: { key: string; title: string; items: NSFWAnime[]; accentColor: string }[] = [];
    for (let i = 0; i < filteredItems.length; i += SHELF_CHUNK_SIZE) {
      const chunkIndex = Math.floor(i / SHELF_CHUNK_SIZE);
      const chunk = filteredItems.slice(i, i + SHELF_CHUNK_SIZE);
      let title = 'Novedades';
      let accentColor = colors.primary;

      if (chunkIndex === 1) {
        title = 'Más del catálogo';
        accentColor = colors.accentBlue;
      } else if (chunkIndex > 1) {
        title = `Más del catálogo (${chunkIndex})`;
        accentColor = chunkIndex % 2 === 0 ? colors.accentGreen : colors.primary;
      }

      groups.push({
        key: `shelf-${chunkIndex}`,
        title,
        items: chunk,
        accentColor,
      });
    }
    return groups;
  }, [filteredItems, colors.primary, colors.accentBlue, colors.accentGreen]);

  const horizontalPadding = isSmallScreen ? 16 : 24;
  const hasActiveFilters = activeFilter !== 'Todos' || !!query.trim() || category !== null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        black
        activeSection="Hentai"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: hasHero ? 0 : headerHeight + 20,
          paddingBottom: Math.max(40, insets.bottom + 24),
          paddingHorizontal: 0,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {hasHero ? <CatalogHero items={heroItems} onOpen={key => {
          const item = uniqueItems.find(entry => (entry.slug || String(entry.id)) === key);
          if (item) handleCardPress(item);
        }} /> : null}
        <View style={[styles.mainContent, { paddingHorizontal: horizontalPadding, paddingTop: hasHero ? 16 : 0 }]}>
          {!adultContentEnabled ? (
            <View style={[styles.stateCard, { backgroundColor: colors.card }]}>
              <Ionicons name="lock-closed-outline" size={48} color={colors.primary} />
              <Text style={[styles.stateTitle, { color: colors.text }]}>
                Contenido +18 desactivado
              </Text>
              <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>
                Esta sección está deshabilitada para el perfil actual. Puedes activarla desde la
                configuración de tu perfil.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Ir a Perfil"
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  isWeb && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => navigateByLabel('Perfil')}
              >
                <Ionicons name="person-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Ir a Perfil</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.topSection, { flexDirection: isSmallScreen ? 'column' : 'row', alignItems: isSmallScreen ? 'stretch' : 'center', gap: 20 }]}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.text }]}>H Anime</Text>
                  <View style={[styles.ageBadge, { backgroundColor: colors.primary }]}><Text style={[styles.ageBadgeText, { color: '#fff' }]}>18+</Text></View>
                </View>
                <View style={[styles.localTools, { width: isSmallScreen ? '100%' : 520 }]}>
                  <View style={[styles.searchBox, { backgroundColor: colors.card }]}>
                    <Ionicons name="search" size={18} color={colors.textMuted} />
                    <TextInput accessibilityLabel="Buscar en esta sección" placeholder="Buscar en esta sección…" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: colors.text }, isWeb && ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderWidth: 0 } as any)]} returnKeyType="search" />
                    {query ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Limpiar búsqueda de esta sección" onPress={() => setQuery('')} style={styles.clearSearch}><Ionicons name="close" size={20} color={colors.text} /></TouchableOpacity> : null}
                  </View>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Filtrar por categoría" accessibilityState={{ expanded: categoriesOpen }} onPress={() => setCategoriesOpen(open => !open)} style={[styles.categoryToggle, { backgroundColor: category ? colors.primary : colors.card }]}>
                    <Text style={{ color: category ? '#fff' : colors.text, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{category || 'Categorías'}</Text><Ionicons name={categoriesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={category ? '#fff' : colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
              {categoriesOpen ? <ScrollView style={{ maxHeight: 220, marginBottom: 20 }} keyboardShouldPersistTaps="handled">
                <View style={styles.categoryPanel}>
                  {[null, ...categories].map(label => <TouchableOpacity key={label ? `category:${label}` : '__all'} accessibilityRole="button" accessibilityLabel={label ? `Categoría ${label}` : 'Todas las categorías'} accessibilityState={{ selected: category === label }} onPress={() => { setCategory(label); setCategoriesOpen(false); }} style={[styles.filterChip, { backgroundColor: category === label ? colors.primary : colors.card }]}>
                    <Text style={{ color: category === label ? '#fff' : colors.text, fontSize: 13 }}>{label || 'Todas las categorías'}</Text>
                  </TouchableOpacity>)}
                </View>
                {!categories.length ? <Text style={{ color: colors.textMuted, marginTop: 12 }}>Este catálogo todavía no tiene categorías registradas.</Text> : null}
              </ScrollView> : null}
              {hasActiveFilters && !loading ? <View style={styles.resultSummary}>
                <Text style={{ color: colors.textMuted }}>{filteredItems.length} {filteredItems.length === 1 ? 'título' : 'títulos'}{category ? ` · ${category}` : ''}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Restablecer búsqueda y filtros" onPress={handleResetFilters}><Text style={{ color: colors.primary }}>Restablecer</Text></TouchableOpacity>
              </View> : null}

              {/* Filtros de estado */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filtersWrapper}
                contentContainerStyle={styles.filtersContainer}
              >
                {FILTERS.map((f) => {
                  const isActive = activeFilter === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      accessibilityRole="button"
                      accessibilityLabel={`Filtrar por ${f}`}
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isActive ? colors.primary : colors.card,
                        },
                        isWeb && ({ cursor: 'pointer' } as any),
                      ]}
                      onPress={() => setActiveFilter(f)}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          { color: isActive ? '#FFFFFF' : colors.textSecondary },
                        ]}
                      >
                        {f}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Banner de error al reproducir */}
              {videoError && (
                <View style={[styles.inlineErrorBanner, { backgroundColor: colors.card }]}>
                  <View style={styles.inlineErrorLeft}>
                    <Ionicons name="alert-circle-outline" size={20} color={colors.primary} />
                    <Text style={[styles.inlineErrorText, { color: colors.text }]}>
                      {videoError}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar aviso de error"
                    onPress={() => setVideoError(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={isWeb ? ({ cursor: 'pointer' } as any) : undefined}
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Contenido principal: Carga / Error / Vacío / Hero + Filas */}
              {loading ? (
                <View style={styles.stateContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>
                    Cargando catálogo...
                  </Text>
                </View>
              ) : error ? (
                <View style={[styles.stateCard, { backgroundColor: colors.card }]}>
                  <Ionicons name="alert-circle-outline" size={44} color={colors.primary} />
                  <Text style={[styles.stateTitle, { color: colors.text }]}>
                    Error al cargar
                  </Text>
                  <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>{error}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Reintentar carga del catálogo"
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: colors.primary },
                      isWeb && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={() => loadContent()}
                  >
                    <Ionicons name="refresh" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              ) : filteredItems.length === 0 ? (
                <View style={[styles.stateCard, { backgroundColor: colors.card }]}>
                  <Ionicons name="search-outline" size={44} color={colors.textMuted} />
                  <Text style={[styles.stateTitle, { color: colors.text }]}>
                    Sin resultados
                  </Text>
                  <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>
                    {hasActiveFilters
                      ? 'No se encontraron títulos con los filtros actuales.'
                      : 'El catálogo está vacío o no pudo obtener resultados en este momento.'}
                  </Text>
                  <View style={styles.stateActionsRow}>
                    {hasActiveFilters && (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Limpiar filtros"
                        style={[
                          styles.secondaryBtn,
                          { backgroundColor: colors.surfaceElevated },
                          isWeb && ({ cursor: 'pointer' } as any),
                        ]}
                        onPress={handleResetFilters}
                      >
                        <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                          Limpiar filtros
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Reintentar carga del catálogo"
                      style={[
                        styles.primaryBtn,
                        { backgroundColor: colors.primary },
                        isWeb && ({ cursor: 'pointer' } as any),
                      ]}
                      onPress={() => loadContent()}
                    >
                      <Ionicons name="refresh" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>Reintentar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  {/* Filas horizontales troceadas por 12 */}
                  <View style={styles.shelvesWrapper}>
                    {shelves.map((shelf) => (
                      <HentaiShelf
                        key={shelf.key}
                        title={shelf.title}
                        items={shelf.items}
                        accentColor={shelf.accentColor}
                        onItemPress={handleCardPress}
                      />
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Overlay no destructivo mientras se buscan servidores de video */}
      {fetchingVideo && (
        <View style={styles.fetchingOverlay}>
          <View style={[styles.fetchingBox, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.fetchingText, { color: colors.text }]}>
              Buscando servidores de video...
            </Text>
          </View>
        </View>
      )}

      {/* Series Details Modal */}
      <HentaiSeriesModal
        visible={showSeriesModal && adultContentEnabled}
        onClose={() => setShowSeriesModal(false)}
        anime={selectedAnime}
        onPlayEpisode={handlePlayEpisode}
      />

      {/* Episode Player Modal */}
      {showPlayer && adultContentEnabled && playingServers.length > 0 && selectedAnime && (
        <Modal
          visible={showPlayer}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closePlayer}
        >
          <HentaiVideoPlayer
            animeTitle={selectedAnime.title}
            episodeNumber={playingEpisode}
            servers={playingServers}
            onClose={closePlayer}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  mainContent: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  ageBadge: {
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filtersWrapper: {
    marginBottom: 20,
    maxHeight: 46,
  },
  filtersContainer: {
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 0,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  localTools: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, height: 48 },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontSize: 14 },
  clearSearch: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center' },
  categoryToggle: { maxWidth: 180, minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  categoryPanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 },
  shelvesWrapper: {
    marginTop: 4,
  },
  inlineErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 0,
    borderWidth: 0,
    marginBottom: 16,
    gap: 12,
  },
  inlineErrorLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 13,
  },
  stateContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  stateCard: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 44,
    paddingHorizontal: 24,
    marginTop: 16,
    borderRadius: 0,
    borderWidth: 0,
    gap: 10,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateSubtext: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
  },
  stateActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 0,
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
    borderWidth: 0,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fetchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    padding: 24,
  },
  fetchingBox: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 0,
    borderWidth: 0,
    alignItems: 'center',
    gap: 12,
  },
  fetchingText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
