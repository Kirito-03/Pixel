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
import { catalogSections, dailySelection } from '../utils/catalogSections';
import { useLocalDayKey } from '../hooks/useLocalDayKey';
import { catalogCategories, filterCatalog } from '../utils/catalogFilters';
import HentaiShelf from '../components/HentaiShelf';
import HentaiSeriesModal from '../components/HentaiSeriesModal';
import HentaiVideoPlayer from '../components/HentaiVideoPlayer';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { getAdjacentEpisodes } from '../utils/episodeNavigation';

const FILTERS = ['Todos', 'Nuevos caps', 'Finalizado'] as const;

export default function NSFWScreen() {
  const { colors } = useTheme();
  const day = useLocalDayKey();
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
  const [searchItems, setSearchItems] = useState<NSFWAnime[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
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
  const [playingEpisodes, setPlayingEpisodes] = useState<{ number: number }[]>([]);
  const [fetchingVideo, setFetchingVideo] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Monotonic request IDs to discard stale async responses on filter/profile/guard changes
  const catalogRequestIdRef = useRef(0);
  const videoRequestIdRef = useRef(0);
  const showPlayerRef = useRef(false);
  showPlayerRef.current = showPlayer;
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
    setPlayingEpisodes([]);
    setFetchingVideo(false);
    setPlayerError(null);
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

  useEffect(() => {
    let active = true;
    setSearchItems([]);
    setSearchError(null);
    if (!adultContentEnabled || !query.trim()) { setSearchLoading(false); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Query the saved database too, so older titles outside the browse rows remain findable.
        const found = await nsfwApi.getLatest(query.trim(), activeFilter);
        if (active) setSearchItems(Array.isArray(found) ? found : []);
      } catch { if (active) setSearchError('No se pudo completar la búsqueda. Intenta nuevamente.'); }
      finally { if (active) setSearchLoading(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query, activeFilter, adultContentEnabled, profileId, searchRevision]);

  const retryContent = () => query.trim() ? setSearchRevision(value => value + 1) : loadContent();

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
    videoRequestIdRef.current += 1;
    setFetchingVideo(false);
    setShowPlayer(false);
    setPlayingServers([]);
    setVideoError(null);
    setPlayerError(null);
    setPlayingEpisodes([]);
    setSelectedAnime(item);
    setShowSeriesModal(true);
  };

  const handlePlayEpisode = async (
    slug: string,
    episodeNumber: number,
    episodes?: { number: number }[]
  ) => {
    if (!adultContentEnabled) return;

    if (Array.isArray(episodes)) {
      setPlayingEpisodes(episodes);
    }

    const reqId = ++videoRequestIdRef.current;
    setFetchingVideo(true);
    setVideoError(null);
    setPlayerError(null);

    if (showPlayerRef.current) {
      setPlayingEpisode(episodeNumber);
      setPlayingServers([]);
    }

    try {
      const servers = await nsfwApi.getServers(slug, episodeNumber);
      if (reqId !== videoRequestIdRef.current) return;

      if (servers && servers.length > 0) {
        setPlayingServers(servers);
        setPlayingEpisode(episodeNumber);
        setShowPlayer(true);
      } else {
        const msg = 'No se encontraron servidores de video para este episodio.';
        if (showPlayerRef.current) {
          setPlayerError(msg);
        } else {
          setVideoError(msg);
          if (!isWeb) {
            Alert.alert('Error', msg);
          }
        }
      }
    } catch {
      if (reqId !== videoRequestIdRef.current) return;
      const msg = 'Ocurrió un error al buscar servidores de video.';
      if (showPlayerRef.current) {
        setPlayerError(msg);
      } else {
        setVideoError(msg);
        if (!isWeb) {
          Alert.alert('Error', msg);
        }
      }
    } finally {
      if (reqId === videoRequestIdRef.current) {
        setFetchingVideo(false);
      }
    }
  };

  const closePlayer = useCallback(() => {
    videoRequestIdRef.current += 1;
    setFetchingVideo(false);
    setPlayerError(null);
    setShowPlayer(false);
    setPlayingServers([]);
  }, []);

  const currentSeriesEpisodes = useMemo(() => {
    if (playingEpisodes.length > 0) return playingEpisodes;
    return Array.isArray(selectedAnime?.episodes) ? selectedAnime.episodes : [];
  }, [playingEpisodes, selectedAnime]);

  const { previous: previousEpisode, next: nextEpisode } = useMemo(
    () => getAdjacentEpisodes(currentSeriesEpisodes, playingEpisode),
    [currentSeriesEpisodes, playingEpisode]
  );

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
    const slug = route.params.slug;
    const selected = uniqueItems.find(item => item.slug === slug);
    if (selected) {
      setSelectedAnime(selected);
      setShowSeriesModal(true);
      navigation.setParams({ slug: undefined });
      return;
    }
    let active = true;
    // A saved title may be older than the latest browse batch.
    nsfwApi.getDetails(slug).then(found => {
      if (!active) return;
      if (found) { setSelectedAnime(found); setShowSeriesModal(true); }
      else setVideoError('Este título ya no está disponible en el catálogo.');
      navigation.setParams({ slug: undefined });
    }).catch(() => {
      if (active) { setVideoError('No se pudo abrir el título guardado. Intenta nuevamente.'); navigation.setParams({ slug: undefined }); }
    });
    return () => { active = false; };
  }, [route.params?.slug, uniqueItems, adultContentEnabled, loading, profileId, navigation]);

  const categories = useMemo(() => catalogCategories(uniqueItems), [uniqueItems]);
  const filteredItems = useMemo(() => {
    const pool = query.trim() ? [...new Map([...searchItems, ...uniqueItems].map(item => [item.slug || String(item.id), item])).values()] : uniqueItems;
    return filterCatalog(pool, query, category);
  }, [uniqueItems, searchItems, query, category]);
  const heroItems = useMemo(() => dailySelection(uniqueItems, day, 5).map(item => ({
    key: item.slug || String(item.id), title: item.title, poster: item.poster_path,
    banner: item.banner_path || item.banner_url || item.backdrop_path,
    description: item.synopsis,
  })), [uniqueItems, day]);
  const hasHero = adultContentEnabled && !loading && !error && heroItems.length > 0;
  const horizontalPadding = isSmallScreen ? 16 : 24;
  const hasActiveFilters = activeFilter !== 'Todos' || !!query.trim() || category !== null;
  const shelves = useMemo(() => {
    // Browse has four curated rows. Filtering/searching exposes every matching loaded title.
    const groups = hasActiveFilters
      ? [{ key: 'results', title: 'Resultados', items: filteredItems }]
      : catalogSections(uniqueItems, day);
    return groups.map((group, index) => ({ ...group, accentColor: index % 2 ? colors.accentBlue : colors.primary }));
  }, [filteredItems, uniqueItems, day, hasActiveFilters, colors.primary, colors.accentBlue]);

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
              {hasActiveFilters && !loading && !searchLoading && !searchError ? <View style={styles.resultSummary}>
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
              {loading || searchLoading ? (
                <View style={styles.stateContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>
                    {searchLoading ? 'Buscando en el catálogo…' : 'Cargando catálogo…'}
                  </Text>
                </View>
              ) : error || searchError ? (
                <View style={[styles.stateCard, { backgroundColor: colors.card }]}>
                  <Ionicons name="alert-circle-outline" size={44} color={colors.primary} />
                  <Text style={[styles.stateTitle, { color: colors.text }]}>
                    Error al cargar
                  </Text>
                  <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>{searchError || error}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Reintentar carga del catálogo"
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: colors.primary },
                      isWeb && ({ cursor: 'pointer' } as any),
                    ]}
                    onPress={retryContent}
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
                      onPress={retryContent}
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
      {fetchingVideo && !showPlayer && (
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
        visible={showSeriesModal && !showPlayer && !fetchingVideo && adultContentEnabled}
        onClose={() => {
          setShowSeriesModal(false);
          setSelectedAnime(null);
          setPlayingEpisodes([]);
        }}
        anime={selectedAnime}
        onPlayEpisode={handlePlayEpisode}
      />

      {/* Episode Player Modal */}
      {showPlayer && adultContentEnabled && selectedAnime && (
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
            hasPreviousEpisode={previousEpisode !== null}
            hasNextEpisode={nextEpisode !== null}
            previousEpisodeNumber={previousEpisode?.number ?? null}
            nextEpisodeNumber={nextEpisode?.number ?? null}
            onPreviousEpisode={
              previousEpisode
                ? () =>
                    handlePlayEpisode(
                      selectedAnime.slug,
                      previousEpisode.number,
                      currentSeriesEpisodes
                    )
                : undefined
            }
            onNextEpisode={
              nextEpisode
                ? () =>
                    handlePlayEpisode(
                      selectedAnime.slug,
                      nextEpisode.number,
                      currentSeriesEpisodes
                    )
                : undefined
            }
            loadingServers={fetchingVideo}
            error={playerError}
            onRetry={() =>
              handlePlayEpisode(
                selectedAnime.slug,
                playingEpisode,
                currentSeriesEpisodes
              )
            }
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
