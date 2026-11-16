import Loader from '../components/Loader';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../contexts/AuthContext';
import { useMyList } from '../contexts/MyListContext';
import MovieModal from '../components/MovieModal';
import AnimeSeriesModalWrapper from '../components/AnimeSeriesModalWrapper';
import Header from '../components/Header';
import { ContinueWatchingCard, WatchListItem, SavedListItem } from '../components/MyListComponents';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContentItem } from '../types';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useTheme } from '../contexts/ThemeContext';
import { myListApi, MyListEntry, MyListContentType } from '../services/myListApi';
import { continueWatchingApi, ContinueWatchingEntry } from '../services/continueWatchingApi';
import { progressApi } from '../services/progressApi';
import { getResumeTarget } from '../services/resumeTarget';
import { getAllMangaProgress, MangaReadingProgress } from '../utils/mangaProgress';

function normalizeImagePath(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return path;
}

export default function MyListScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const insets = useSafeAreaInsets();
  const gutter = isSmallScreen ? 16 : width >= 1200 ? 32 : 24;
  const gap = isSmallScreen ? 12 : 16;
  const columns =
    width >= 1320 ? 5 : width >= 1040 ? 4 : width >= 720 ? 3 : 2;
  const containerWidth = Math.min(width, 1440);
  const cardWidth = Math.floor((containerWidth - gutter * 2 - (columns - 1) * gap) / columns);
  const continueScrollRef = useRef<ScrollView>(null);
  const [continueScrollX, setContinueScrollX] = useState(0);
  const [continueViewportWidth, setContinueViewportWidth] = useState(0);
  const [continueContentWidth, setContinueContentWidth] = useState(0);
  const { currentProfile, adultContentEnabled } = useProfile();
  const { user } = useAuth();
  const { refreshMyList, removeFromMyList } = useMyList();
  const { navigateByLabel } = useTabNavigation();
  const navigation = useNavigation<any>();

  const [items, setItems] = useState<SavedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('all');
  const [alphabetical, setAlphabetical] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [startFromEpisodeId, setStartFromEpisodeId] = useState<number | null>(null);
  const [startFromTimeSeconds, setStartFromTimeSeconds] = useState<number | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [metaByAnimeId, setMetaByAnimeId] = useState<Map<number, MyListEntry>>(new Map());
  const [mangaProgressById, setMangaProgressById] = useState<Record<string, MangaReadingProgress>>({});
  const [continueRows, setContinueRows] = useState<ContinueWatchingEntry[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<{
    animeId: string | number;
    contentType?: MyListContentType;
    title: string;
    source: 'continue' | 'mylist';
    episodeId?: number | null;
  } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const listRequest = useRef(0);
  const currentScope = `${user?.uid}:${currentProfile?.id}:${adultContentEnabled}`;
  const scopeRef = useRef(currentScope);
  scopeRef.current = currentScope;
  useEffect(() => { setKind('all'); setAlphabetical(false); setConfirmVisible(false); setConfirmPayload(null); setModalVisible(false); setSelectedContent(null); }, [currentScope]);

  useFocusEffect(
    useCallback(() => {
      getAllMangaProgress().then(setMangaProgressById).catch(() => {});
      if (currentProfile && user?.uid) loadMyList();
    }, [currentProfile, user?.uid, adultContentEnabled])
  );

  const loadMyList = async () => {
    if (!currentProfile) return;
    const request = ++listRequest.current;
    const scope = currentScope;
    if (items.length === 0) setLoading(true);
    setLoadError('');
    try {
      // Favorites remain usable when history is temporarily unavailable.
      const [entries, history] = await Promise.all([
        myListApi.getMyList(currentProfile.id, { includeAdult: adultContentEnabled }),
        continueWatchingApi.get(currentProfile.id).then(rows => ({ rows, failed: false })).catch(() => ({ rows: [] as ContinueWatchingEntry[], failed: true })),
      ]);
      if (request !== listRequest.current || scope !== scopeRef.current) return;
      setContinueRows(history.rows);
      if (history.failed) setLoadError('Tus guardados están disponibles; no pudimos cargar el progreso. Reintenta para actualizarlo.');
      const metaMap = new Map<number, MyListEntry>();
      for (const e of entries) {
        if (e.content_type === 'anime') {
          const watched = history.rows.find(row => row.anime_id === Number(e.content_id));
          metaMap.set(Number(e.content_id), watched ? { ...e, episode_id: watched.episode_id, episode_number: watched.episode_number,
            current_time: watched.current_time, duration: watched.duration, progress_percent: watched.progress_percent,
            season: watched.season, last_watched_at: watched.updated_at } : e);
        }
      }
      setMetaByAnimeId(metaMap);
      if (entries.length === 0) { setItems([]); setLoadedScope(scope); return; }

      const detailPromises = entries.map(async (entry) => {
        try {
          if (entry.content_type === 'manga' || entry.content_type === 'h_anime') {
            return {
              id: entry.content_id,
              type: entry.content_type,
              isAdult: entry.content_type === 'h_anime',
              title: entry.anime_title || `${entry.content_type === 'h_anime' ? 'H Anime' : 'Manga'} #${entry.content_id}`,
              overview: '',
              poster_path: normalizeImagePath(entry.poster_url),
              backdrop_path: normalizeImagePath(entry.banner_url),
              release_date: '',
              vote_average: 0,
              source: 'anilist',
            } as SavedListItem;
          }
          return {
            id: Number(entry.content_id),
            type: entry.content_type === 'movie' || entry.content_type === 'tv' ? entry.content_type : 'anime',
            title: entry.anime_title || `Anime #${entry.content_id}`,
            overview: '',
            poster_path: normalizeImagePath(entry.poster_url),
            backdrop_path: normalizeImagePath(entry.banner_url),
            release_date: '',
            vote_average: 0,
            source: 'anilist',
          } as ContentItem;
        } catch { return null; }
      });

      const details = await Promise.allSettled(detailPromises);
      let validItems = details
        .map(r => (r.status === 'fulfilled' ? r.value : null))
        .filter((c): c is SavedListItem => !!c);

      if (!adultContentEnabled) {
        validItems = validItems.filter(i => !(i.type === 'h_anime' || i.isAdult));
      }
      if (request === listRequest.current && scope === scopeRef.current) { setItems(validItems); setLoadedScope(scope); }
    } catch (error) {
      if (request !== listRequest.current || scope !== scopeRef.current) return;
      console.error('[MyListScreen] Error loading My List:', error);
      setLoadError('No pudimos cargar tus guardados. Comprueba la conexión e inténtalo de nuevo.');
      setItems([]);
      setContinueRows([]);
    } finally {
      if (request === listRequest.current && scope === scopeRef.current) setLoading(false);
    }
  };

  const openConfirmRemove = (payload: { animeId: string | number; contentType?: MyListContentType; title: string; source: 'continue' | 'mylist'; episodeId?: number | null }) => {
    console.log('[MyListScreen][remove][open]', payload);
    setConfirmPayload(payload);
    setConfirmError(null);
    setConfirmVisible(true);
  };

  const closeConfirm = () => {
    setConfirmVisible(false);
    setConfirmPayload(null);
    setConfirmError(null);
  };

  const confirmRemove = async () => {
    if (!currentProfile || !confirmPayload) return;
    const animeId = Number(confirmPayload.animeId);
    const contentId = confirmPayload.animeId;
    const contentType = confirmPayload.contentType || 'anime';
    if (confirmPayload.source === 'continue' && !animeId) return;
    const key = `${contentType}:${contentId}`;
    setRemovingKey(key);
    try {
      console.log('[MyListScreen][remove][confirm]', { source: confirmPayload.source, animeId, profileId: currentProfile.id });
      if (confirmPayload.source === 'mylist') {
        await removeFromMyList(contentId, contentType);
        setItems((prev) => prev.filter((i) => !(i.type === contentType && String(i.id) === String(contentId))));
        setMetaByAnimeId((prev) => {
          const next = new Map(prev);
          next.delete(animeId);
          return next;
        });
      }

      if (confirmPayload.source === 'continue') {
        const episodeIdToClear =
          (confirmPayload.episodeId ? Number(confirmPayload.episodeId) : 0) ||
          Number(continueRows.find((r) => Number(r.anime_id) === animeId)?.episode_id || 0);

        if (episodeIdToClear > 0) {
          await progressApi.save(currentProfile.id, {
            anime_id: animeId,
            episode_id: episodeIdToClear,
            current_time: 0,
            duration: 0,
          });
        }

        setContinueRows((prev) => prev.filter((r) => Number(r.anime_id) !== animeId));
      }

      closeConfirm();
    } catch {
      setConfirmError('No se pudo eliminar. Reintenta.');
    } finally {
      setRemovingKey(null);
    }
  };

  const openModal = (item: ContentItem) => {
    setStartFromEpisodeId(null);
    setStartFromTimeSeconds(null);
    setSelectedContent(item);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setStartFromEpisodeId(null);
    setStartFromTimeSeconds(null);
    setSelectedContent(null);
    if (currentProfile) {
      loadMyList();
    }
  };

  // ── Continuar viendo desde endpoint dedicado
  const continueItems = (loadedScope === currentScope ? continueRows : [])
    .filter((row) => row.current_time > 0 || row.position_known === false)
    .filter((row) => row.duration <= 0 || row.current_time < row.duration * 0.95)
    .slice(0, 30)
    .map((row) => {
      const item: ContentItem = {
        id: Number(row.anime_id),
        type: 'anime',
        title: row.title || `Anime #${row.anime_id}`,
        overview: '',
        poster_path: row.thumbnail || '',
        backdrop_path: row.thumbnail || '',
        release_date: '',
        vote_average: 0,
        source: 'anilist',
      };
      return { row, item };
    });
  const allItems = loadedScope === currentScope ? items.filter(item => adultContentEnabled || (item.type !== 'h_anime' && !item.isAdult)) : [];
  const matchesKind = (item: SavedListItem, value: string) => value === 'all' || (value === 'video' ? item.type === 'movie' || item.type === 'tv' : item.type === value);
  const listFilters = [
    { key: 'all', label: 'Todo' }, { key: 'anime', label: 'Anime' },
    { key: 'manga', label: 'Manga' }, { key: 'h_anime', label: 'H Anime' }, { key: 'video', label: 'Películas y series' },
  ].map(filter => ({ ...filter, count: allItems.filter(item => matchesKind(item, filter.key)).length }))
    .filter(filter => filter.key === 'all' || filter.count > 0);
  const visibleItems = useMemo(() => {
    const filtered = allItems.filter(item => matchesKind(item, kind));
    return alphabetical ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'es')) : filtered;
  }, [items, loadedScope, currentScope, kind, alphabetical]);


  if (loading) {
    return (
      <View style={[styles.loadingView, { backgroundColor: colors.background }]}>
        <Header black activeSection="Mi Lista" onNavPress={navigateByLabel} />
        <View style={{ marginTop: 120 }}><Loader /></View>
      </View>
    );
  }

  const showContinueLeft = !isSmallScreen && continueScrollX > 8;
  const showContinueRight =
    !isSmallScreen &&
    continueContentWidth > continueViewportWidth + 8 &&
    continueScrollX + continueViewportWidth < continueContentWidth - 8;

  const scrollContinueBy = (direction: -1 | 1) => {
    const step = Math.max(320, Math.floor((continueViewportWidth || 800) * 0.78));
    const nextX = Math.max(
      0,
      Math.min(
        Math.max(0, continueContentWidth - continueViewportWidth),
        continueScrollX + direction * step
      )
    );
    continueScrollRef.current?.scrollTo({ x: nextX, animated: true });
    setContinueScrollX(nextX);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        black
        activeSection="Mi Lista"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Platform.OS === 'web' ? 96 : insets.top + 80, paddingBottom: Math.max(40, insets.bottom + 24), paddingHorizontal: gutter }]}
      >
        <View style={styles.boundedContent}>
        <View style={styles.pageHeader}>
          <View style={styles.headingCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>TU COLECCIÓN</Text>
            <Text style={[styles.pageTitle, { color: colors.text, fontSize: isSmallScreen ? 32 : 44 }]}>Mi Lista</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
              Tus historias favoritas, listas para cuando quieras volver.
            </Text>
          </View>
        </View>

        {/* ── CONTINUAR VIENDO ── */}
        {continueItems.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { justifyContent: 'flex-start' }]}>
              <Ionicons name="play-circle" size={20} color="#E50914" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Continuar viendo</Text>
            </View>

            <View style={styles.continueCarouselWrap}>
              <ScrollView
                ref={continueScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.continueRow}
                scrollEventThrottle={16}
                onScroll={(e) => setContinueScrollX(e.nativeEvent.contentOffset.x)}
                onLayout={(e) => setContinueViewportWidth(e.nativeEvent.layout.width)}
                onContentSizeChange={(w) => setContinueContentWidth(w)}
              >
                {continueItems.map(({ row, item }) => (
                  (() => {
                    const meta = metaByAnimeId.get(item.id);
                    const currentEpisode = typeof row.episode_number === 'number' ? row.episode_number : (meta?.episode_number ?? 1);
                    const totalEpisodes = typeof meta?.total_episodes === 'number' ? meta.total_episodes : undefined;
                    const progress = Number(row.progress_percent ?? 0) / 100;
                    return (
                  <ContinueWatchingCard
                    key={`${item.type}:${item.id}`}
                    item={item}
                    currentEpisode={currentEpisode}
                    totalEpisodes={totalEpisodes}
                    progress={progress}
                    positionKnown={row.position_known}
                    onPress={() => {
                      (async () => {
                        let targetEpisodeId: number | null = row.episode_id ?? null;
                        let targetTime = typeof row.current_time === 'number' ? row.current_time : Number(row.current_time || 0);
                        if (currentProfile?.id) {
                          try {
                            const target = await getResumeTarget(Number(item.id), Number(currentProfile.id));
                            targetEpisodeId = target.episodeId ?? targetEpisodeId;
                            targetTime = Number(target.resumeTime || targetTime || 0);
                          } catch { }
                        }
                        setStartFromEpisodeId(targetEpisodeId);
                        setStartFromTimeSeconds(targetTime);
                        setSelectedContent(item);
                        setModalVisible(true);
                      })();
                    }}
                    onRemove={() => openConfirmRemove({ animeId: item.id, title: item.title, source: 'continue', episodeId: row.episode_id })}
                  />
                    );
                  })()
                ))}
              </ScrollView>

              {showContinueLeft && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Desplazar Continuar viendo a la izquierda"
                  onPress={() => scrollContinueBy(-1)}
                  style={[
                    styles.continueNavButton,
                    styles.continueNavLeft,
                    { backgroundColor: theme === 'dark' ? 'rgba(10,10,10,0.82)' : 'rgba(255,255,255,0.92)' },
                  ]}
                >
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </TouchableOpacity>
              )}

              {showContinueRight && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Desplazar Continuar viendo a la derecha"
                  onPress={() => scrollContinueBy(1)}
                  style={[
                    styles.continueNavButton,
                    styles.continueNavRight,
                    { backgroundColor: theme === 'dark' ? 'rgba(10,10,10,0.82)' : 'rgba(255,255,255,0.92)' },
                  ]}
                >
                  <Ionicons name="chevron-forward" size={22} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.libraryToolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={{ flex: 1 }}>
            {listFilters.map(filter => <TouchableOpacity key={filter.key} accessibilityRole="button" accessibilityLabel={`Mostrar ${filter.label}`}
              accessibilityState={{ selected: kind === filter.key }} onPress={() => setKind(filter.key)}
              style={[styles.filterButton, { backgroundColor: kind === filter.key ? colors.primary : colors.card }]}>
              <Text style={{ color: kind === filter.key ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>{filter.label}</Text>
              <Text style={{ color: kind === filter.key ? '#fff' : colors.textMuted, fontSize: 12 }}>{filter.count}</Text>
            </TouchableOpacity>)}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={alphabetical ? 'Ordenar por más recientes' : 'Ordenar por título'}
            onPress={() => setAlphabetical(value => !value)} style={[styles.sortButton, { backgroundColor: colors.card }]}>
            <Ionicons name="swap-vertical-outline" size={18} color={colors.text} />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{alphabetical ? 'A–Z' : 'Recientes'}</Text>
          </TouchableOpacity>
        </View>

        {loadError ? <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          <Text accessibilityRole="alert" style={[styles.emptyText, { color: colors.textSecondary }]}>{loadError}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar Mi Lista" onPress={loadMyList} style={[styles.emptyAction, { backgroundColor: colors.primary }]}><Text style={styles.emptyActionText}>Reintentar</Text></TouchableOpacity>
        </View> : null}
        {visibleItems.length === 0 ? (loadError ? null : <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
          <Ionicons name="bookmark-outline" size={42} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{allItems.length ? 'Sin guardados de este tipo' : 'Tu próxima historia empieza aquí'}</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{allItems.length ? 'Prueba otro filtro para ver tu colección.' : 'Guarda anime y manga desde sus detalles y encuéntralos aquí.'}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => allItems.length ? setKind('all') : navigateByLabel('Inicio')} style={[styles.emptyAction, { backgroundColor: colors.primary }]}><Text style={styles.emptyActionText}>{allItems.length ? 'Ver todo' : 'Explorar catálogo'}</Text></TouchableOpacity>
        </View>) : <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tus guardados</Text>
          </View>
          <View style={[styles.listGrid, { gap }]}>
              {visibleItems.map((item) => (
                (() => {
                  const meta = item.type === 'anime' ? metaByAnimeId.get(Number(item.id)) : undefined;
                  const currentEpisode = typeof meta?.episode_number === 'number' ? meta.episode_number : undefined;
                  const totalEpisodes = typeof meta?.total_episodes === 'number' ? meta.total_episodes : undefined;
                  const progress = Number(meta?.progress_percent ?? 0) / 100;
                  const mangaProg = item.type === 'manga' ? mangaProgressById[String(item.id)] : undefined;
                  const mangaChapterLabel = mangaProg
                    ? (mangaProg.chapterNumber ? `Último: Cap. ${mangaProg.chapterNumber}` : 'Leyendo')
                    : undefined;
                  return (
                <View
                  key={`${item.type}:${item.id}`}
                  style={{ width: cardWidth }}
                >
                  <WatchListItem
                    item={item}
                    currentEpisode={currentEpisode}
                    totalEpisodes={totalEpisodes}
                    mangaChapterLabel={mangaChapterLabel}
                    progress={progress}
                    removing={removingKey === `${item.type}:${item.id}`}
                    onPress={() => {
                      if (item.type === 'manga') {
                        navigation.navigate('Manga', { screen: 'MangaDetail', params: { id: String(item.id) } });
                      } else if (item.type === 'h_anime') {
                        navigation.navigate('Hentai', { slug: String(item.id) });
                      } else {
                        openModal(item as ContentItem);
                      }
                    }}
                    onRemove={() => openConfirmRemove({ animeId: item.id, contentType: item.type, title: item.title, source: 'mylist' })}
                  />
                </View>
                  );
                })()
              ))}
          </View>
        </View>}

        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODALES ── */}
      {selectedContent?.type === 'anime' ? (
        <AnimeSeriesModalWrapper
          content={selectedContent}
          visible={modalVisible}
          startFromEpisodeId={startFromEpisodeId}
          startFromTimeSeconds={startFromTimeSeconds}
          onClose={closeModal}
        />
      ) : (
        <MovieModal
          content={selectedContent}
          visible={modalVisible}
          onClose={closeModal}
        />
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title={confirmPayload?.source === 'continue' ? 'Quitar de Continuar viendo' : 'Eliminar de Mi Lista'}
        message={
          confirmPayload
            ? (confirmPayload.source === 'continue'
              ? `¿Quitar "${confirmPayload.title}" de Continuar viendo?`
              : `¿Eliminar "${confirmPayload.title}" de tu lista?`)
            : ''
        }
        errorText={confirmError}
        iconName={confirmPayload?.source === 'continue' ? 'eye-off-outline' : 'trash-outline'}
        cancelText="Cancelar"
        confirmText={confirmPayload?.source === 'continue' ? 'Quitar' : 'Eliminar'}
        destructive
        onCancel={closeConfirm}
        onConfirm={confirmRemove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  loadingView: { flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.4)', marginTop: 16, fontSize: 14 },
  scrollContent: { flexGrow: 1 },
  boundedContent: { width: '100%', maxWidth: 1376, alignSelf: 'center' },
  headingCopy: { flex: 1, minWidth: 180 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  collectionCount: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 14, alignSelf: 'flex-start' },
  countNumber: { fontSize: 20, fontWeight: '800' },
  libraryToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  filterRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  filterButton: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sortButton: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyAction: { minHeight: 44, paddingHorizontal: 20, justifyContent: 'center' },
  emptyActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  /* PAGE HEADER */
  pageHeader: {
    paddingTop: 16,
    paddingBottom: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 20,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  pageSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
  },

  /* SECTION */
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  /* CONTINUE WATCHING ROW */
  continueCarouselWrap: {
    position: 'relative',
  },
  continueRow: {
    gap: 14,
    paddingRight: 20,
  },
  continueNavButton: {
    position: 'absolute',
    top: 32,
    width: 38,
    height: 76,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.22)',
  },
  continueNavLeft: {
    left: 6,
  },
  continueNavRight: {
    right: 6,
  },

  /* ALL LIST */
  listGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },

  /* EMPTY */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 16,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
