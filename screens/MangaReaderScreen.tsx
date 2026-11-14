import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Header from '../components/Header';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { mangaApi, MangaChapter } from '../services/mangaApi';

type PreferredLanguage = 'es' | 'es-la' | 'en';

type RouteParams = {
  id?: string;
  mangaId?: string;
  chapterId?: string;
  language?: string;
  selectedLanguage?: string;
  chapters?: MangaChapter[] | string;
  currentIndex?: number | string;
  mangaTitle?: string;
};

const STEP = 6;

function safeDecode(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

function normalizeLanguage(lang?: unknown): PreferredLanguage {
  const value = String(lang || '').trim().toLowerCase();
  if (value === 'es' || value === 'es-la' || value === 'en') {
    return value;
  }
  return 'es';
}

function sanitizeChapters(value: unknown): MangaChapter[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is MangaChapter =>
      Boolean(item && typeof item === 'object' && typeof (item as MangaChapter).id === 'string')
  );
}

function SkeletonPage() {
  return (
    <View style={styles.skeletonPage}>
      <ActivityIndicator size="small" color="rgba(255,255,255,0.45)" />
    </View>
  );
}

function ReaderImage({ uri }: { uri: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imgRatio, setImgRatio] = useState<number>(0.72);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let active = true;
    if (uri) {
      Image.getSize(
        uri,
        (w, h) => {
          if (active && w && h) setImgRatio(w / h);
        },
        () => {
          if (active) setFailed(true);
        }
      );
    }
    return () => {
      active = false;
    };
  }, [uri]);

  const imageWidth = Platform.OS === 'web' ? '100%' : width;

  return (
    <View style={[styles.imageWrap, { width: imageWidth, aspectRatio: imgRatio }]}>
      {!loaded && !failed ? <SkeletonPage /> : null}
      {failed ? (
        <View style={styles.errorPage}>
          <Ionicons name="alert-circle-outline" size={28} color="rgba(255,255,255,0.45)" />
          <Text style={styles.errorPageText}>No se pudo cargar esta página</Text>
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={[styles.pageImage, { width: '100%', height: '100%' }]}
          resizeMode={Platform.OS === 'android' ? 'cover' : 'contain'}
          resizeMethod="resize"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />
      )}
    </View>
  );
}

export default function MangaReaderScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { navigateByLabel } = useTabNavigation();
  const { width: viewportWidth } = useWindowDimensions();
  const params = (route?.params || {}) as RouteParams;
  const mangaId = String(params.mangaId || params.id || '').trim();
  const chapterId = safeDecode(params.chapterId);
  const preferredLanguage = normalizeLanguage(params.selectedLanguage || params.language);
  const mangaTitle = String(params.mangaTitle || '').trim() || 'Manga';

  const [chapters, setChapters] = useState<MangaChapter[]>(() => sanitizeChapters(params.chapters));
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(STEP);
  const [activePage, setActivePage] = useState(1);
  const [activeChapterId, setActiveChapterId] = useState(chapterId);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<string>>(null);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const first = viewableItems?.[0]?.index;
    if (typeof first === 'number') setActivePage(first + 1);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const chaptersSeqRef = useRef(0);
  const pagesSeqRef = useRef(0);

  const activeChapterIndex = useMemo(() => {
    const targetId = activeChapterId || chapterId;
    if (!targetId || !Array.isArray(chapters) || chapters.length === 0) return -1;
    return chapters.findIndex((c) => String(c?.id || '').trim() === targetId);
  }, [chapters, activeChapterId, chapterId]);

  const chapterLabel = useMemo(() => {
    const current = activeChapterIndex >= 0 ? chapters[activeChapterIndex] : undefined;
    if (!current) return 'Capítulo';
    return current.chapter ? `Cap. ${current.chapter}` : 'Capítulo';
  }, [chapters, activeChapterIndex]);

  const visiblePages = useMemo(() => pages.slice(0, visibleCount), [pages, visibleCount]);
  const hasMorePages = visibleCount < pages.length;
  const canPrevChapter = activeChapterIndex >= 0 && activeChapterIndex < chapters.length - 1;
  const canNextChapter = activeChapterIndex > 0;

  useEffect(() => {
    if (!mangaId) return;
    const seq = ++chaptersSeqRef.current;
    let cancelled = false;

    const loadChapters = async () => {
      try {
        const res = await mangaApi.chapters(mangaId, {
          limit: 300,
          preferredLanguage,
          allowEnglishFallback: true,
        });
        if (cancelled || chaptersSeqRef.current !== seq) return;
        const list = Array.isArray(res?.chapters)
          ? res.chapters
          : Array.isArray(res?.items)
            ? res.items
            : [];
        setChapters(sanitizeChapters(list));
      } catch {
        // Keep current safe chapters list on transient failure
      }
    };

    loadChapters();

    return () => {
      cancelled = true;
    };
  }, [mangaId, preferredLanguage]);

  useEffect(() => {
    const id = String(chapterId || '').trim();
    if (!id) {
      setLoading(false);
      setPages([]);
      setActiveChapterId('');
      return;
    }

    const seq = ++pagesSeqRef.current;
    let cancelled = false;

    const loadChapterPages = async () => {
      setLoading(true);
      setError('');
      setActiveChapterId(id);
      try {
        const data = await mangaApi.chapterPages(id);
        if (cancelled || pagesSeqRef.current !== seq) return;
        const incoming = Array.isArray(data?.pages) ? data.pages : [];
        setPages(incoming);
        setVisibleCount(Math.min(STEP, incoming.length || STEP));
        setActivePage(1);
        requestAnimationFrame(() => {
          if (cancelled || pagesSeqRef.current !== seq) return;
          listRef.current?.scrollToOffset?.({ animated: false, offset: 0 });
        });
      } catch (e: any) {
        if (cancelled || pagesSeqRef.current !== seq) return;
        setPages([]);
        setError(e?.message || 'No se pudo cargar el capítulo');
      } finally {
        if (!cancelled && pagesSeqRef.current === seq) {
          setLoading(false);
        }
      }
    };

    loadChapterPages();

    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const navigateToChapter = (target?: MangaChapter) => {
    const nextId = String(target?.id || '').trim();
    if (!nextId || nextId === (activeChapterId || chapterId)) return;
    if (typeof navigation?.setParams === 'function') {
      navigation.setParams({ chapterId: encodeURIComponent(nextId) });
    }
  };

  const openPrevChapter = () => {
    if (!canPrevChapter) return;
    navigateToChapter(chapters[activeChapterIndex + 1]);
  };

  const openNextChapter = () => {
    if (!canNextChapter) return;
    navigateToChapter(chapters[activeChapterIndex - 1]);
  };

  const onReachedEnd = () => {
    if (!hasMorePages) return;
    setVisibleCount((prev) => Math.min(prev + STEP, pages.length));
  };

  return (
    <View style={styles.container}>
      <Header
        black
        activeSection="Manga"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <View style={[styles.topBar, { marginTop: Platform.OS === 'web' ? (viewportWidth < 768 ? 64 : 72) : (viewportWidth < 768 ? 56 : 64) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>

          <View style={styles.chapterIndicator}>
            <Text style={styles.chapterTitle} numberOfLines={1}>{mangaTitle}</Text>
            <Text style={styles.chapterSubtitle}>
              {chapterLabel} · {activePage}/{Math.max(1, pages.length)}
            </Text>
          </View>

          <View style={styles.chapterActions}>
            <TouchableOpacity
              disabled={!canPrevChapter}
              onPress={openPrevChapter}
              style={[styles.navBtn, !canPrevChapter && styles.navBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Capítulo anterior"
            >
              <Ionicons name="chevron-up" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!canNextChapter}
              onPress={openNextChapter}
              style={[styles.navBtn, !canNextChapter && styles.navBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Capítulo siguiente"
            >
              <Ionicons name="chevron-down" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#E50914" />
          <View style={styles.skeletonList}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonPage key={i} />)}
          </View>
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={34} color="rgba(255,255,255,0.6)" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          ref={listRef}
          data={visiblePages}
          keyExtractor={(item, idx) => `${activeChapterId}-${idx}-${item}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <ReaderImage uri={item} />}
          onEndReached={onReachedEnd}
          onEndReachedThreshold={0.35}
          removeClippedSubviews
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListFooterComponent={
            hasMorePages ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                <Text style={styles.footerText}>Cargando más páginas...</Text>
              </View>
            ) : (
              <View style={styles.footerEnd}>
                <Text style={styles.footerText}>Fin del capítulo</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  safeArea: { paddingTop: 80, backgroundColor: '#050505' },
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  chapterIndicator: { flex: 1, minWidth: 0 },
  chapterTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
  chapterSubtitle: { color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: '700', marginTop: 1 },
  chapterActions: { flexDirection: 'row', gap: 6 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navBtnDisabled: { opacity: 0.35 },
  loadingWrap: { flex: 1, paddingHorizontal: 14, paddingTop: 24 },
  skeletonList: { marginTop: 16, gap: 10 },
  skeletonPage: {
    height: 420,
    borderRadius: 12,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 30,
    alignItems: 'stretch'
  },
  imageWrap: {
    width: '100%',
    maxWidth: 800, // Capped width on desktop/large screens
    overflow: 'hidden',
    backgroundColor: '#050505',
    alignSelf: 'center',
  },
  pageImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#050505',
  },
  errorPage: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorPageText: { color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 12 },
  footerLoading: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  footerEnd: { alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
  footerText: { color: 'rgba(255,255,255,0.58)', fontWeight: '700', fontSize: 12 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { color: 'rgba(255,255,255,0.68)', fontWeight: '700', fontSize: 13, paddingHorizontal: 18, textAlign: 'center' },
});

