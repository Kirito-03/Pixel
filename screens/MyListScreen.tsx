import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../contexts/ProfileContext';
import { useMyList } from '../contexts/MyListContext';
import MovieModal from '../components/MovieModal';
import AnimeSeriesModalWrapper from '../components/AnimeSeriesModalWrapper';
import Header from '../components/Header';
import { ContinueWatchingCard, WatchListItem } from '../components/MyListComponents';
import ConfirmDialog from '../components/ConfirmDialog';
import { colors as staticColors } from '../theme';
import { ContentItem } from '../types';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { useTheme } from '../contexts/ThemeContext';
import { myListApi, MyListEntry } from '../services/myListApi';
import { continueWatchingApi, ContinueWatchingEntry } from '../services/continueWatchingApi';
import { progressApi } from '../services/progressApi';
import { getResumeTarget } from '../services/resumeTarget';

function normalizeImagePath(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return path;
}

export default function MyListScreen() {
  const { colors, theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 768;
  const { currentProfile, adultContentEnabled } = useProfile();
  const { refreshMyList, removeFromMyList } = useMyList();
  const { navigateByLabel } = useTabNavigation();
  const navigation = useNavigation<any>();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [startFromEpisodeId, setStartFromEpisodeId] = useState<number | null>(null);
  const [startFromTimeSeconds, setStartFromTimeSeconds] = useState<number | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [metaByAnimeId, setMetaByAnimeId] = useState<Map<number, MyListEntry>>(new Map());
  const [continueRows, setContinueRows] = useState<ContinueWatchingEntry[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState<{
    animeId: number;
    title: string;
    source: 'continue' | 'mylist';
    episodeId?: number | null;
  } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (currentProfile) loadMyList();
    }, [currentProfile])
  );

  const loadMyList = async () => {
    if (!currentProfile) return;
    setLoading(true);
    try {
      await refreshMyList();

      const cw = await continueWatchingApi.get(currentProfile.id);
      console.log('[MyListScreen][continue-watching]', { profileId: currentProfile.id, rows: cw });
      setContinueRows(cw);

      const entries = await myListApi.getMyList(currentProfile.id);
      const metaMap = new Map<number, MyListEntry>();
      for (const e of entries) {
        if (e.content_type === 'anime') metaMap.set(Number(e.content_id), e);
      }
      setMetaByAnimeId(metaMap);
      if (entries.length === 0) { setItems([]); return; }

      const detailPromises = entries.map(async (entry) => {
        try {
          if (entry.content_type === 'manga') {
            return {
              id: entry.content_id,
              type: 'manga',
              title: entry.anime_title || `Manga #${entry.content_id}`,
              overview: '',
              poster_path: normalizeImagePath(entry.poster_url),
              backdrop_path: normalizeImagePath(entry.banner_url),
              release_date: '',
              vote_average: 0,
              source: 'anilist',
            } as ContentItem;
          }
          if (entry.content_type !== 'anime') return null;
          return {
            id: Number(entry.content_id),
            type: 'anime',
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
        .filter((c): c is ContentItem => !!c);

      if (!adultContentEnabled) {
        validItems = validItems.filter(i => !(i.type === 'anime' && i.isAdult));
      }
      setItems(validItems);
    } catch (error) {
      setItems([]);
      setContinueRows([]);
    } finally {
      setLoading(false);
    }
  };

  const openConfirmRemove = (payload: { animeId: number; title: string; source: 'continue' | 'mylist'; episodeId?: number | null }) => {
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
    if (!animeId) return;

    const key = `anime:${animeId}`;
    setRemovingKey(key);
    try {
      console.log('[MyListScreen][remove][confirm]', { source: confirmPayload.source, animeId, profileId: currentProfile.id });
      if (confirmPayload.source === 'mylist') {
        await removeFromMyList(animeId, 'anime');
        setItems((prev) => prev.filter((i) => !(i.type === 'anime' && i.id === animeId)));
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
  const continueItems = continueRows
    .filter((row) => row.current_time > 0)
    .filter((row) => row.duration <= 0 || row.current_time < row.duration * 0.95)
    .slice(0, 6)
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
  const allItems = items;

  if (loading) {
    return (
      <View style={[styles.loadingView, { backgroundColor: colors.background }]}>
        <Header black={theme === 'dark'} activeSection="Mi Lista" onNavPress={navigateByLabel} />
        <ActivityIndicator size="large" color="#E50914" style={{ marginTop: 120 }} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Cargando Mi Lista...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        black={theme === 'dark'}
        activeSection="Mi Lista"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── PAGE HEADER ── */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Mi Lista</Text>
          <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
            {items.length} {items.length === 1 ? 'anime guardado' : 'animes guardados'}
          </Text>
        </View>

        {/* ── CONTINUAR VIENDO ── */}
        {continueItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="play-circle" size={20} color="#E50914" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Continuar viendo</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.continueRow}
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
          </View>
        )}

        {items.length === 0 ? (
          /* ── EMPTY STATE ── */
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={64} color={theme === 'dark' ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Tu lista está vacía</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Agrega animes o mangas a tu lista para verlos más tarde
            </Text>
          </View>
        ) : (
          /* ── TODOS LOS CONTENIDOS ── */
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list" size={20} color={colors.textMuted} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Todo tu contenido</Text>
            </View>

            <View style={isSmallScreen ? styles.listCol : styles.listGrid}>
              {allItems.map((item) => (
                (() => {
                  const meta = metaByAnimeId.get(Number(item.id)) || metaByAnimeId.get(item.id as any);
                  const currentEpisode = typeof meta?.episode_number === 'number' ? meta.episode_number : undefined;
                  const totalEpisodes = typeof meta?.total_episodes === 'number' ? meta.total_episodes : undefined;
                  const progress = Number(meta?.progress_percent ?? 0) / 100;
                  return (
                <View
                  key={`${item.type}:${item.id}`}
                  style={isSmallScreen ? { width: '100%' } : styles.listCell}
                >
                  <WatchListItem
                    item={item}
                    currentEpisode={currentEpisode}
                    totalEpisodes={totalEpisodes}
                    progress={progress}
                    removing={removingKey === `${item.type}:${item.id}`}
                    onPress={() => {
                      if (item.type === 'manga') {
                        navigation.navigate('MangaDetail', { id: item.id });
                      } else {
                        openModal(item);
                      }
                    }}
                    onRemove={() => openConfirmRemove({ animeId: item.id as any, title: item.title, source: 'mylist' })}
                  />
                </View>
                  );
                })()
              ))}
            </View>
          </View>
        )}

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
  scrollContent: { paddingTop: 80 },

  /* PAGE HEADER */
  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
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

  /* CONTINUE WATCHING ROW */
  continueRow: {
    gap: 14,
    paddingRight: 20,
  },

  /* ALL LIST */
  listCol: { flexDirection: 'column' },
  listGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  listCell: { flex: 1, minWidth: 320 },

  /* EMPTY */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
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
