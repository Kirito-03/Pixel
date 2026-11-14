import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useProfile } from '../contexts/ProfileContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { HentaiCard } from '../components/HentaiComponents';
import HentaiSeriesModal from '../components/HentaiSeriesModal';
import HentaiVideoPlayer from '../components/HentaiVideoPlayer';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { useTabNavigation } from '../hooks/useTabNavigation';

const FILTERS = ['Todos', 'Nuevos caps', 'Finalizado'] as const;

export default function NSFWScreen() {
  const { colors } = useTheme();
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

  // Navigation & Search state
  const [searchQuery, setSearchQuery] = useState('');
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
    async (overrides?: { search?: string; filter?: string }) => {
      if (!adultContentEnabled) {
        setLoading(false);
        return;
      }

      const query = overrides?.search !== undefined ? overrides.search : searchQuery;
      const filter = overrides?.filter !== undefined ? overrides.filter : activeFilter;
      const reqId = ++catalogRequestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const data = await nsfwApi.getLatest(query.trim(), filter);
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
    [adultContentEnabled, searchQuery, activeFilter]
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

  const handleSearchSubmit = () => {
    if (!adultContentEnabled) return;
    loadContent();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (adultContentEnabled) {
      loadContent({ search: '' });
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setActiveFilter('Todos');
    if (adultContentEnabled) {
      loadContent({ search: '', filter: 'Todos' });
    }
  };

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

  // Responsive grid bounded to max 1120px centered container
  const horizontalPadding = isSmallScreen ? 16 : 24;
  const effectiveWidth = Math.max(280, Math.min(width, 1120) - horizontalPadding * 2);
  const minCardWidth = isSmallScreen ? 140 : 170;
  const gridGap = 12;
  const numColumns = Math.max(2, Math.floor((effectiveWidth + gridGap) / (minCardWidth + gridGap)));
  const cardWidth = `${100 / numColumns}%`;

  const hasActiveFilters = searchQuery.trim().length > 0 || activeFilter !== 'Todos';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        activeSection="Hentai"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: headerHeight + 20,
          paddingBottom: Math.max(40, insets.bottom + 24),
          paddingHorizontal: horizontalPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainContent}>
          {!adultContentEnabled ? (
            <View
              style={[
                styles.stateCard,
                { backgroundColor: colors.card, borderColor: colors.glassBorder },
              ]}
            >
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
              {/* Encabezado y Buscador */}
              <View
                style={[
                  styles.topSection,
                  {
                    flexDirection: isSmallScreen ? 'column' : 'row',
                    alignItems: isSmallScreen ? 'stretch' : 'center',
                  },
                ]}
              >
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.text }]}>H Anime</Text>
                  <View style={[styles.ageBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.ageBadgeText, { color: '#FFFFFF' }]}>18+</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.searchContainer,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.glassBorder,
                      width: isSmallScreen ? '100%' : 320,
                    },
                  ]}
                >
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Ejecutar búsqueda"
                    onPress={handleSearchSubmit}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={isWeb ? ({ cursor: 'pointer' } as any) : undefined}
                  >
                    <Ionicons
                      name="search"
                      size={18}
                      color={colors.textMuted}
                      style={styles.searchIcon}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Buscar hentai..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearchSubmit}
                    returnKeyType="search"
                    accessibilityLabel="Buscar en catálogo 18+"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Limpiar búsqueda"
                      onPress={handleClearSearch}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={isWeb ? ({ cursor: 'pointer' } as any) : undefined}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Filtros */}
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
                          borderColor: isActive ? colors.primary : colors.glassBorder,
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
                <View
                  style={[
                    styles.inlineErrorBanner,
                    { backgroundColor: colors.card, borderColor: colors.primary },
                  ]}
                >
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

              {/* Contenido principal: Carga / Error / Vacío / Grid */}
              {loading ? (
                <View style={styles.stateContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>
                    Cargando catálogo...
                  </Text>
                </View>
              ) : error ? (
                <View
                  style={[
                    styles.stateCard,
                    { backgroundColor: colors.card, borderColor: colors.glassBorder },
                  ]}
                >
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
              ) : items.length === 0 ? (
                <View
                  style={[
                    styles.stateCard,
                    { backgroundColor: colors.card, borderColor: colors.glassBorder },
                  ]}
                >
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
                        accessibilityLabel="Limpiar filtros y búsqueda"
                        style={[
                          styles.secondaryBtn,
                          { borderColor: colors.glassBorder, backgroundColor: colors.surfaceElevated },
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
                <View style={styles.gridContainer}>
                  {items.map((item) => (
                    <View
                      key={`${item.id}-${item.slug}`}
                      style={[styles.cardWrapper, { width: cardWidth as any }]}
                    >
                      <HentaiCard item={item} onPress={() => handleCardPress(item)} />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Overlay no destructivo mientras se buscan servidores de video */}
      {fetchingVideo && (
        <View style={styles.fetchingOverlay}>
          <View
            style={[
              styles.fetchingBox,
              { backgroundColor: colors.card, borderColor: colors.glassBorder },
            ]}
          >
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
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 20,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    outlineStyle: 'none',
  } as any,
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  cardWrapper: {
    padding: 6,
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
