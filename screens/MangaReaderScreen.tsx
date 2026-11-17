import { useProfile } from '../contexts/ProfileContext';
import { createReaderChromeController } from '../utils/readerChrome';
import { useReaderChrome } from '../contexts/ReaderChromeContext';
import Loader from '../components/Loader';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import Header from '../components/Header';
import ReaderImage from '../components/ReaderImage';
import NativeMangaPages from '../components/NativeMangaPages';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { mangaApi, MangaChapter } from '../services/mangaApi';
import { saveMangaProgress } from '../utils/mangaProgress';
import { mangaChapterKey, getMangaReaderContext } from '../utils/mangaChapterNavigation';
import { loadReaderPages, readerRetryDelay } from '../utils/readerRetry';

type RouteParams = { id?: string; mangaId?: string; chapterId?: string; chapterKey?: string; language?: string; selectedLanguage?: string; chapters?: MangaChapter[]; mangaTitle?: string };
const STEP = 6;
function safeDecode(raw = '') { try { return decodeURIComponent(raw).trim(); } catch { return raw.trim(); } }
function sanitizeChapters(value: unknown): MangaChapter[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') : [];
}

export default function MangaReaderScreen() {
  const navigation = useNavigation<any>(), route = useRoute<any>();
  const focused = useIsFocused();
  const { currentProfile } = useProfile();
  const { navigateByLabel } = useTabNavigation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setReading, setBottomVisible } = useReaderChrome();
  const chromeController = useRef(createReaderChromeController());
  const topProgress = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const headerHeight = (width < 768 ? 56 : 64) + insets.top;
  useFocusEffect(React.useCallback(() => {
    if (Platform.OS === 'web') return;
    setReading(true); setBottomVisible(true);
    return () => { setReading(false); setBottomVisible(true); };
  }, [setReading, setBottomVisible]));
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  const params = (route.params || {}) as RouteParams;
  const mangaId = String(params.mangaId || params.id || '').trim();
  const legacyChapterId = safeDecode(String(params.chapterId || ''));
  const remembered = getMangaReaderContext(mangaId);
  const [titleState, setTitleState] = useState({ id: mangaId, title: remembered?.title || params.mangaTitle || 'Manga' });
  const mangaTitle = titleState.id === mangaId ? titleState.title : remembered?.title || params.mangaTitle || 'Manga';
  const preferredLanguage = params.selectedLanguage === 'en' ? 'en' : 'es';
  const [chapterState, setChapterState] = useState(() => ({ id: mangaId, list: sanitizeChapters(remembered?.chapters || params.chapters) }));
  const chapters = chapterState.id === mangaId ? chapterState.list : remembered?.chapters || [];
  const chapterId = legacyChapterId || chapters.find(chapter => mangaChapterKey(chapter) === params.chapterKey)?.id || '';
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [pageState, setPageState] = useState<{ id: string; pages: string[] }>({ id: '', pages: [] });
  const pages = pageState.id === chapterId ? pageState.pages : [];
  const setPages = (value: string[]) => setPageState({ id: chapterId, pages: value });
  const [visibleCount, setVisibleCount] = useState(STEP);
  const [activePage, setActivePage] = useState(1);
  const [atTop, setAtTop] = useState(true);
  const [showFloatingTop, setShowFloatingTop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const active = foreground && focused;
  const listRef = useRef<any>(null);
  const loadedChapter = useRef('');
  const offsets = useRef<Record<number, number>>({});
  const chapterListAttempt = useRef(0);

  const index = useMemo(() => chapters.findIndex(chapter => chapter.id === chapterId), [chapters, chapterId]);
  const current = chapters[index];
  const previous = index >= 0 ? chapters[index + 1] : undefined;
  const next = index > 0 ? chapters[index - 1] : undefined;
  const chapterLabel = current?.chapter ? `Capítulo ${current.chapter}` : 'Capítulo';
  const visiblePages = pages.slice(0, visibleCount);
  const hasMore = visibleCount < pages.length;

  useEffect(() => { const sub = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => sub.remove(); }, []);
  useEffect(() => {
    let cancelled = false;
    mangaApi.getById(mangaId).then(data => { if (!cancelled && data?.title) setTitleState({ id: mangaId, title: data.title }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mangaId]);
  useEffect(() => {
    if (!mangaId || !active || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setChaptersLoading(true);
    mangaApi.chapters(mangaId, { limit: 500, preferredLanguage, allowEnglishFallback: true }).then(data => {
      if (cancelled) return;
      const list = sanitizeChapters(data.chapters || data.items);
      if (!list.length) throw new Error('empty');
      setChapterState({ id: mangaId, list }); chapterListAttempt.current = 0;
    }).catch(() => {
      if (cancelled) return;
      const attempt = ++chapterListAttempt.current;
      if (!chapterId) { setRetryAttempt(attempt); setMessage('Buscando los capítulos. Volveremos a intentarlo automáticamente.'); }
      timer = setTimeout(() => { if (!cancelled) setRetryKey(value => value + 1); }, readerRetryDelay(attempt));
    }).finally(() => { if (!cancelled) setChaptersLoading(false); });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [mangaId, preferredLanguage, retryKey, active, paused]);
  useEffect(() => {
    loadedChapter.current = '';
    chromeController.current = createReaderChromeController(); setBottomVisible(true);
    setPages([]); setVisibleCount(STEP); setActivePage(1); setAtTop(true); setShowFloatingTop(false); setPaused(false); setRetryAttempt(0); setMessage('');
    offsets.current = {};
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    listRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [chapterId]);
  useEffect(() => {
    if (!chapterId) { setLoading(chaptersLoading); if (!chaptersLoading) setMessage('No se encontró el capítulo. Vuelve a intentarlo.'); return; }
    if (!active || paused) { setLoading(false); return; }
    if (loadedChapter.current === chapterId) return;
    const controller = new AbortController();
    setLoading(true); setMessage('');
    loadReaderPages({ signal: controller.signal,
      request: () => mangaApi.chapterPages(chapterId, { signal: controller.signal }),
      onRetry: attempt => {
        if (controller.signal.aborted) return;
        setLoading(false); setRetryAttempt(attempt);
        setMessage('El origen está tardando. Volveremos a intentarlo automáticamente.');
      },
    }).then(result => {
      if (controller.signal.aborted || !result) return;
      loadedChapter.current = chapterId;
      setPages(result); setVisibleCount(Math.min(STEP, result.length)); setLoading(false); setMessage('');
    }).catch(() => {
      if (!controller.signal.aborted) { setLoading(false); setMessage('Este capítulo no está disponible. Puedes volver a intentarlo.'); setPaused(true); }
    });
    return () => controller.abort();
  }, [chapterId, retryKey, paused, active, chaptersLoading]);
  useEffect(() => {
    if (mangaId && chapterId && pages.length) void saveMangaProgress(mangaId, chapterId, current?.chapter, currentProfile?.id).catch(() => {});
  }, [mangaId, chapterId, current?.chapter, pages.length, currentProfile?.id]);

  const openChapter = (target?: MangaChapter) => {
    if (!target || target.id === chapterId) return;
    navigation.setParams({ id: mangaId, chapterKey: mangaChapterKey(target), chapterId: undefined, mangaId: undefined, mangaTitle: undefined, language: undefined, selectedLanguage: undefined, chapters: undefined, currentIndex: undefined });
  };
  useEffect(() => {
    if (Platform.OS === 'web' && legacyChapterId && current) {
      navigation.setParams({ id: mangaId, chapterKey: mangaChapterKey(current), chapterId: undefined, mangaId: undefined, mangaTitle: undefined, language: undefined, selectedLanguage: undefined, chapters: undefined, currentIndex: undefined });
    }
  }, [legacyChapterId, current?.id]);
  const reload = () => { loadedChapter.current = ''; setPaused(false); setRetryKey(value => value + 1); };
  const loadMore = () => setVisibleCount(count => Math.min(count + STEP, pages.length));
  const scrollToTop = () => {
    setAtTop(true);
    setShowFloatingTop(false);
    setActivePage(1);
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    listRef.current?.scrollTo?.({ y: 0, animated: true });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  useEffect(() => {
    const animation = Animated.timing(topProgress, { toValue: atTop || !pages.length ? 1 : 0,
      duration: reduceMotion ? 0 : 240, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [atTop, !!pages.length, reduceMotion, topProgress]);
  const handleNativeScroll = (y: number) => {
    const chrome = chromeController.current(y);
    setAtTop(chrome.topVisible);
    setBottomVisible(chrome.bottomVisible);
  };
  const titleBar = (
    <View style={[styles.topBar, { marginTop: Platform.OS === 'web' ? (width < 768 ? 64 : 72) : 0 }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" onPress={() => navigation.goBack()} style={styles.backButton}><Ionicons name="arrow-back" color="#fff" size={22} /></TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.title} numberOfLines={1}>{mangaTitle}</Text><Text style={styles.hint}>{chapterLabel}{pages.length ? ` · Página ${activePage} de ${pages.length}` : ''}</Text></View>
    </View>
  );
  const chapterNavigation = (_location: string) => <View style={styles.chapterNavigation}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Capítulo anterior" disabled={!previous}
      onPress={() => openChapter(previous)} style={[styles.chapterButton, !previous && styles.disabled]}>
      <Ionicons name="arrow-back" color="#fff" size={18} /><View><Text style={styles.buttonText}>Anterior</Text><Text style={styles.buttonHint}>{previous ? `Capítulo ${previous.chapter || ''}` : 'Primer capítulo'}</Text></View>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Siguiente capítulo" disabled={!next}
      onPress={() => openChapter(next)} style={[styles.chapterButton, next && styles.nextButton, !next && styles.disabled]}>
      <View><Text style={styles.buttonText}>Siguiente capítulo</Text><Text style={styles.buttonHint}>{next ? `Capítulo ${next.chapter || ''}` : 'No hay más capítulos'}</Text></View><Ionicons name="arrow-forward" color="#fff" size={18} />
    </TouchableOpacity>
  </View>;
  const footer = hasMore ? <View style={styles.footer}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cargar más páginas" onPress={loadMore} style={styles.loadMore}><Text style={styles.buttonText}>Cargar más páginas</Text><Ionicons name="chevron-down" size={18} color="#fff" /></TouchableOpacity>
    <Text style={styles.hint}>Mostrando {visibleCount} de {pages.length} páginas</Text>
  </View> : <View style={styles.footer}>
    <Text style={styles.hint}>Fin del capítulo</Text>
    {chapterNavigation('final')}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ir al inicio del capítulo" onPress={scrollToTop} style={styles.scrollTopButton}>
      <Ionicons name="arrow-up" size={18} color="#fff" />
      <Text style={styles.buttonText}>Ir al inicio</Text>
    </TouchableOpacity>
  </View>;

  return <View style={styles.container}>
    {Platform.OS === 'web' ? <Header black activeSection="Manga" onNavPress={navigateByLabel} onSearchPress={() => navigateByLabel('Buscar')} onProfilePress={() => navigateByLabel('Perfil')} /> :
      <Animated.View pointerEvents={atTop || !pages.length ? 'auto' : 'none'}
        accessibilityElementsHidden={!atTop && !!pages.length} importantForAccessibility={!atTop && pages.length ? 'no-hide-descendants' : 'auto'}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, opacity: topProgress,
          transform: [{ translateY: topProgress.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }] }}>
        <Header black activeSection="Manga" onNavPress={navigateByLabel} onSearchPress={() => navigateByLabel('Buscar')} onProfilePress={() => navigateByLabel('Perfil')} />
        <View style={{ paddingTop: headerHeight + 16, backgroundColor: '#080808' }}>{titleBar}</View>
      </Animated.View>}

    {!pages.length ? <ScrollView contentContainerStyle={styles.stateContent}>
      {Platform.OS === 'web' ? titleBar : <View style={{ height: headerHeight + 100 }} />}
      {chapterNavigation('inicio')}
      <View style={styles.status}>
        {(!paused && active) && <Loader onDark />}
        {(!loading || paused || retryAttempt > 0) && <Text style={styles.statusTitle}>{paused ? 'Carga en pausa' : loading ? 'Preparando tu lectura' : 'Seguimos intentando cargar el capítulo'}</Text>}
        {(!loading || paused || retryAttempt > 0) && <Text style={styles.statusCopy}>{message || 'El origen todavía no entregó las páginas.'}</Text>}
        {retryAttempt > 0 && <Text style={styles.hint}>Reintento {retryAttempt} · los intervalos aumentan hasta 30 segundos</Text>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar capítulo" onPress={reload} style={styles.loadMore}><Text style={styles.buttonText}>Reintentar ahora</Text></TouchableOpacity>
        {!paused && <TouchableOpacity accessibilityRole="button" onPress={() => setPaused(true)} style={styles.pauseButton}><Text style={styles.hint}>Pausar reintentos</Text></TouchableOpacity>}
      </View>
    </ScrollView> : Platform.OS === 'web' ? <>
      <ScrollView ref={listRef} contentContainerStyle={styles.listContent} scrollEventThrottle={100}
        onScroll={event => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          setAtTop(contentOffset.y <= 24);
          setShowFloatingTop(contentOffset.y > 160);
          if (hasMore && contentSize.height - contentOffset.y - layoutMeasurement.height < layoutMeasurement.height) loadMore();
          const page = Object.entries(offsets.current).filter(([, y]) => y <= contentOffset.y + layoutMeasurement.height * 0.3).map(([key]) => Number(key)).pop();
          if (page !== undefined) setActivePage(page + 1);
        }}>
        {titleBar}
        {chapterNavigation('inicio')}
        {visiblePages.map((uri, page) => <View key={`${chapterId}-${page}`} onLayout={event => { offsets.current[page] = event.nativeEvent.layout.y; }}><ReaderImage uri={uri} page={page + 1} active={active} /></View>)}
        {footer}
      </ScrollView>
      {showFloatingTop && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Ir al inicio"
          onPress={scrollToTop}
          style={[styles.floatingTopButton, { right: width < 768 ? 14 : 24 }]}
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
          <Text style={styles.floatingTopText}>Inicio</Text>
        </TouchableOpacity>
      )}
    </> : <>
      <NativeMangaPages key={chapterId} pages={pages} previous={previous ? previous.chapter || '' : null} next={next ? next.chapter || '' : null}
        active={active} onPrevious={() => openChapter(previous)} onNext={() => openChapter(next)} onPage={setActivePage} onScroll={handleNativeScroll} topSpace={headerHeight + 100} bottomSpace={60 + insets.bottom} />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  topBar: { width: '100%', maxWidth: 1000, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1c' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  hint: { color: '#aaa', fontSize: 12, lineHeight: 18 },
  chapterNavigation: { width: '100%', maxWidth: 840, paddingHorizontal: 20, alignSelf: 'center', flexDirection: 'row', gap: 12, paddingVertical: 20 },
  chapterButton: { flex: 1, minWidth: 0, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#242424' },
  nextButton: { backgroundColor: '#E50914' }, disabled: { opacity: 0.38 },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, buttonHint: { color: '#ddd', fontSize: 11, marginTop: 3 },
  listContent: { paddingBottom: 32 }, stateContent: { flexGrow: 1, paddingBottom: 32 },
  status: { maxWidth: 600, width: '100%', alignSelf: 'center', minHeight: 350, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  statusTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  statusCopy: { color: '#bbb', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  loadMore: { minHeight: 48, backgroundColor: '#252525', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  scrollTopButton: { minHeight: 48, backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  floatingTopButton: { position: 'absolute', bottom: 24, zIndex: 50, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(20,20,20,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatingTopText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  pauseButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  footer: { width: '100%', maxWidth: 840, alignSelf: 'center', alignItems: 'center', paddingVertical: 24, gap: 12 },
});
