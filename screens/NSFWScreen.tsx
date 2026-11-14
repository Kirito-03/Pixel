import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
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
import HentaiShelf from '../components/HentaiShelf';
import HentaiSeriesModal from '../components/HentaiSeriesModal';
import HentaiVideoPlayer from '../components/HentaiVideoPlayer';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { useTabNavigation } from '../hooks/useTabNavigation';

const FILTERS = ['Todos', 'Nuevos caps', 'Finalizado'] as const;
const SHELF_CHUNK_SIZE = 12;

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
  const [heroImageError, setHeroImageError] = useState(false);

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
    if (activeFilter !== 'Todos') {
      setActiveFilter('Todos');
    } else if (adultContentEnabled) {
      loadContent({ filter: 'Todos' });
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

  const heroItem = uniqueItems.length > 0 ? uniqueItems[0] : null;

  useEffect(() => {
    setHeroImageError(false);
  }, [heroItem?.poster_path]);

  // Partition all unique items into disjoint horizontal shelves of 12 (no silent truncation)
  const shelves = useMemo(() => {
    const groups: { key: string; title: string; items: NSFWAnime[]; accentColor: string }[] = [];
    for (let i = 0; i < uniqueItems.length; i += SHELF_CHUNK_SIZE) {
      const chunkIndex = Math.floor(i / SHELF_CHUNK_SIZE);
      const chunk = uniqueItems.slice(i, i + SHELF_CHUNK_SIZE);
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
  }, [uniqueItems, colors.primary, colors.accentBlue, colors.accentGreen]);

  const horizontalPadding = isSmallScreen ? 16 : 24;
  const hasActiveFilters = activeFilter !== 'Todos';

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
              {/* Encabezado de sección */}
              <View style={styles.topSection}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.text }]}>H Anime</Text>
                  <View style={[styles.ageBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.ageBadgeText, { color: '#FFFFFF' }]}>18+</Text>
                  </View>
                </View>
              </View>

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
              ) : uniqueItems.length === 0 ? (
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
                  {/* Hero / Encabezado destacado sin estiramiento ni autoplay */}
                  {heroItem && (
                    <View
                      style={[
                        styles.heroCard,
                        {
                          backgroundColor: colors.card,
                          padding: isSmallScreen ? 16 : 24,
                          gap: isSmallScreen ? 16 : 24,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.heroPosterBox,
                          {
                            width: isSmallScreen ? 108 : 176,
                            backgroundColor: colors.cardLight,
                          },
                        ]}
                      >
                        {!heroItem.poster_path || heroImageError ? (
                          <View
                            style={[
                              styles.heroPosterFallback,
                              { backgroundColor: colors.cardLight },
                            ]}
                          >
                            <Ionicons name="film-outline" size={32} color={colors.textMuted} />
                            <Text style={[styles.heroFallbackText, { color: colors.textMuted }]}>
                              18+
                            </Text>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: heroItem.poster_path }}
                            style={StyleSheet.absoluteFillObject}
                            resizeMode="cover"
                            onError={() => setHeroImageError(true)}
                          />
                        )}
                      </View>

                      <View style={styles.heroInfo}>
                        <View style={styles.heroMetaRow}>
                          <View style={[styles.ageBadge, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.ageBadgeText, { color: '#FFFFFF' }]}>18+</Text>
                          </View>
                          <Text style={[styles.heroEyebrow, { color: colors.textMuted }]}>
                            DESTACADO
                          </Text>
                          {Boolean(heroItem.type) && (
                            <Text style={[styles.heroType, { color: colors.textSecondary }]}>
                              {heroItem.type}
                            </Text>
                          )}
                        </View>

                        <Text
                          style={[
                            styles.heroTitle,
                            { color: colors.text, fontSize: isSmallScreen ? 20 : 28 },
                          ]}
                          numberOfLines={2}
                        >
                          {heroItem.title}
                        </Text>

                        {Boolean(heroItem.synopsis) && (
                          <Text
                            style={[styles.heroSynopsis, { color: colors.textSecondary }]}
                            numberOfLines={isSmallScreen ? 2 : 3}
                          >
                            {heroItem.synopsis}
                          </Text>
                        )}

                        {Array.isArray(heroItem.genres) && heroItem.genres.length > 0 && (
                          <View style={styles.heroGenresRow}>
                            {heroItem.genres.slice(0, 3).map((genre) => (
                              <View
                                key={genre}
                                style={[
                                  styles.heroGenreTag,
                                  { backgroundColor: colors.surfaceElevated },
                                ]}
                              >
                                <Text
                                  style={[styles.heroGenreText, { color: colors.textSecondary }]}
                                >
                                  {genre}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}

                        <View style={styles.heroActions}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Abrir ficha de ${heroItem.title}`}
                            style={[
                              styles.primaryBtn,
                              { backgroundColor: colors.primary },
                              isWeb && ({ cursor: 'pointer' } as any),
                            ]}
                            onPress={() => handleCardPress(heroItem)}
                          >
                            <Ionicons name="information-circle-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>Abrir ficha</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

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
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 0,
    marginBottom: 28,
  },
  heroPosterBox: {
    aspectRatio: 0.7,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  heroPosterFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  heroFallbackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroInfo: {
    flex: 1,
    gap: 10,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroType: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  heroSynopsis: {
    fontSize: 14,
    lineHeight: 20,
  },
  heroGenresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroGenreTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
    borderWidth: 0,
  },
  heroGenreText: {
    fontSize: 11,
    fontWeight: '600',
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
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
