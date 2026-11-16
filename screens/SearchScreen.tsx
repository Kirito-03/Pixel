import Loader from '../components/Loader';
import { readingFormat } from '../utils/readingFormat';
import React, { useRef, useState, useEffect } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform, SafeAreaView, useWindowDimensions, BackHandler, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import DiscoveryCard from '../components/DiscoveryCard';
import MovieModal from '../components/MovieModal';
import { ContentItem } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { searchHistoryStore } from '../services/searchHistoryStore';
import { catalogService } from '../services/catalogService';
import { useTheme } from '../contexts/ThemeContext';
import { universalSearch, animeSearchResult, type UniversalSearchResult } from '../services/universalSearch';

export default function SearchScreen() {
  const { colors, theme } = useTheme();
  const navigation = useNavigation<any>();
  const { currentProfile } = useProfile();
  const { user } = useAuth();
  const historyScope = `${user?.uid}:${currentProfile?.id}`;
  const historyScopeRef = useRef(historyScope);
  historyScopeRef.current = historyScope;
  const [historyNotice, setHistoryNotice] = useState('');
  const [kind, setKind] = useState<'all' | 'anime' | 'manga'>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniversalSearchResult[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);
  const [searchError, setSearchError] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const [retryIndex, setRetryIndex] = useState(0);

  const ALL_GENRES = [
    'Action', 'Romance', 'Comedy', 'Sci-Fi',
    'Fantasy', 'Adventure', 'Drama', 'Sports',
    'Slice of Life', 'Horror', 'Mystery', 'Supernatural'
  ];

  // ESC en web → goBack
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigation.goBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigation]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setRecentQueries([]); setHistoryNotice('');
    const profileId = currentProfile?.id;
    if (!profileId || !user?.uid) return;
    const start = async () => {
      try {
        const stop = await searchHistoryStore.watch(profileId, queries => {
          if (active) { setRecentQueries(queries); setHistoryNotice(''); }
        }, () => { if (active) setHistoryNotice('No se pudo sincronizar el historial. Comprueba tu conexión.'); }, user.uid);
        if (!active) { stop(); return; }
        unsubscribe = stop;
        const legacy = await AsyncStorage.getItem(`recentSearches:${profileId}`);
        let local: string[] = [];
        try { local = legacy ? JSON.parse(legacy) : []; } catch { /* Ignore malformed legacy cache. */ }
        if (!active) return;
        await searchHistoryStore.migrate(profileId, local, user.uid);
        if (active && legacy) await AsyncStorage.removeItem(`recentSearches:${profileId}`);
      } catch { if (active) setHistoryNotice('No se pudo sincronizar el historial. Comprueba tu conexión.'); }
    };
    void start();
    return () => { active = false; unsubscribe?.(); };
  }, [historyScope]);

  const recordRecentSearch = async (text: string) => {
    const profileId = currentProfile?.id;
    const scope = historyScope;
    if (!profileId || !user?.uid || !text.trim()) return;
    try {
      await searchHistoryStore.add(profileId, text, user.uid);
      if (historyScopeRef.current === scope) setHistoryNotice('');
    } catch { if (historyScopeRef.current === scope) setHistoryNotice('No se pudo guardar esta búsqueda en tu cuenta.'); }
  };
  const clearRecent = async () => {
    const profileId = currentProfile?.id;
    const scope = historyScope;
    if (!profileId || !user?.uid) return;
    try {
      await searchHistoryStore.clear(profileId, user.uid);
      if (historyScopeRef.current === scope) { setRecentQueries([]); setHistoryNotice(''); }
    } catch { if (historyScopeRef.current === scope) setHistoryNotice('No se pudo borrar el historial de tu cuenta.'); }
  };

  const clearSearch = () => {
    setQuery('');
    searchRequestRef.current += 1;
    setLoading(false);
    setSearchError('');
    setSearchNotice('');
    setSelectedGenre(null);
    setResults([]);
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  };

  useEffect(() => {
    if (selectedGenre) return;
    const requestId = ++searchRequestRef.current;
    const text = query.trim();
    let active = true;
    setSearchError('');
    setSearchNotice('');
    setResults([]);
    if (text.length < 2) { setLoading(false); return; }
    setLoading(true);
    typingTimer.current = setTimeout(async () => {
      try {
        const response = await universalSearch(text);
        if (!active || searchRequestRef.current !== requestId) return;
        setResults(response.items);
        setSearchNotice(response.unavailable.length ? `No se pudo consultar ${response.unavailable.join(' y ')}. Mostrando los resultados disponibles.` : '');
      } catch (error) {
        if (!active || searchRequestRef.current !== requestId) return;
        setSearchError(error instanceof Error ? error.message : 'No se pudo realizar la búsqueda.');
      } finally {
        if (active && searchRequestRef.current === requestId) setLoading(false);
      }
    }, 350);
    return () => { active = false; if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, [query, selectedGenre, currentProfile?.id, retryIndex]);

  const handleSearch = (text: string) => { setSelectedGenre(null); setQuery(text); };

  const handleGenrePress = async (genre: string) => {
    const requestId = ++searchRequestRef.current;
    setQuery('');
    setSelectedGenre(genre);
    setResults([]);
    setSearchError('');
    setSearchNotice('');
    setLoading(true);
    try {
      const response = await catalogService.getAnimeList({ genre, limit: 30 });
      if (searchRequestRef.current === requestId) setResults((response?.data || []).map(animeSearchResult));
    } catch {
      if (searchRequestRef.current === requestId) setSearchError('No se pudieron consultar los animes de este género.');
    } finally {
      if (searchRequestRef.current === requestId) setLoading(false);
    }
  };

  const handleResultPress = (item: UniversalSearchResult) => {
    setIsFocused(false);
    if (query.trim()) recordRecentSearch(query);
    if (item.kind === 'manga') {
      navigation.navigate('Manga', { screen: 'MangaDetail', params: { id: item.manga.id } });
      return;
    }
    setSelectedContent(item.content);
    setModalVisible(true);
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onBackPress = () => {
      if (modalVisible) return false;
      if (selectedGenre || query.length > 0) {
        clearSearch();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [selectedGenre, query, modalVisible]);

  // En web usamos outlineStyle none. En native lo ignoramos
  const inputPlatformStyles = Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderWidth: 0 } : {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const native = Platform.OS === 'android';
  const hPad = width < 768 ? 16 : 40;
  const contentWidth = Math.min(1200, width - hPad * 2);
  const numCols = width < 540 ? 2 : width < 900 ? 3 : 5;
  const gap = width < 768 ? 14 : 24;
  const cardWidth = (contentWidth - gap * (numCols - 1)) / numCols;
  const filteredResults = results.filter(item => selectedGenre || kind === 'all' || item.kind === kind);
  const genreLabels: Record<string, string> = { Action: 'Acción', 'Sci-Fi': 'Ciencia ficción', Fantasy: 'Fantasía', Adventure: 'Aventura', Drama: 'Drama', Sports: 'Deportes', 'Slice of Life': 'Vida cotidiana', Horror: 'Terror', Mystery: 'Misterio', Supernatural: 'Sobrenatural', Romance: 'Romance', Comedy: 'Comedia' };
  const headerPaddingTop = isWeb ? 24 : insets.top + 12;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { width: contentWidth, paddingTop: headerPaddingTop }]}>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: colors.textMuted }]}>{native ? 'ENCUENTRA TU PRÓXIMA HISTORIA' : 'DESCUBRE EN PIXEL'}</Text><Text style={[styles.pageTitle, { color: colors.text, fontSize: native ? 27 : width < 768 ? 30 : 38 }]}>{native ? 'Explorar' : 'Buscar anime y manga'}</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar búsqueda" onPress={() => navigation.goBack()} style={[styles.closeBtn, { backgroundColor: colors.card }]}><Ionicons name={native ? 'arrow-back' : 'close'} size={21} color={colors.text} /></TouchableOpacity>
        </View>
        <View style={[styles.inputBox, { backgroundColor: isFocused ? (theme === 'dark' ? '#1d2826' : '#e4eeeb') : colors.card, minHeight: native ? 52 : 64 }]}>
          <Ionicons name="search-outline" size={22} color={colors.textMuted} />
          <TextInput style={[styles.input, { color: colors.text, fontSize: native ? 17 : 22 }, inputPlatformStyles as any]}
            placeholder="Título, personaje o una nueva historia…" accessibilityLabel="Buscar anime y manga" placeholderTextColor={colors.textMuted}
            value={query} onChangeText={handleSearch} onSubmitEditing={({ nativeEvent }) => recordRecentSearch(nativeEvent.text)} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} autoFocus={!native} returnKeyType="search" />
          {!loading && query.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={clearSearch} style={{ padding: 8 }}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></TouchableOpacity>}
        </View>

      </View>
      {!!historyNotice && <Text accessibilityRole="alert" style={[styles.notice, { color: colors.textMuted, width: contentWidth }]}>{historyNotice}</Text>}
      <FlatList data={filteredResults} numColumns={numCols} key={`search-${numCols}`} style={{ width: contentWidth, alignSelf: 'center' }}
        contentContainerStyle={{ paddingTop: native ? 24 : 32, paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<>
          {!!searchError && <Text accessibilityRole="alert" style={[styles.notice, { color: colors.text }]}>{searchError}</Text>}
          {!!searchNotice && <Text style={[styles.notice, { color: colors.textMuted }]}>{searchNotice}</Text>}
          {(searchError || searchNotice) && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar búsqueda" onPress={() => selectedGenre ? handleGenrePress(selectedGenre) : setRetryIndex(value => value + 1)} style={[styles.retry, { backgroundColor: colors.card }]}><Text style={{ color: colors.text }}>Reintentar</Text></TouchableOpacity>}
          {!selectedGenre && !query.length && <>
            {recentQueries.length > 0 && <View style={styles.sectionBlock}><View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Búsquedas recientes</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Borrar búsquedas del perfil" onPress={clearRecent} style={{ padding: 10 }}><Text style={[styles.small, { color: colors.textMuted }]}>Borrar</Text></TouchableOpacity></View>
              <View style={styles.chips}>{recentQueries.map(text => <TouchableOpacity key={text} onPress={() => { handleSearch(text); recordRecentSearch(text); }} style={[styles.chip, { backgroundColor: colors.card }]}><Ionicons name="time-outline" size={15} color={colors.textMuted} /><Text style={{ color: colors.text, fontSize: 13 }}>{text}</Text></TouchableOpacity>)}</View>
            </View>}
            <View style={styles.sectionBlock}><View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Explora por género</Text>{!native && <Text style={[styles.small, { color: colors.textMuted }]}>Algo para cada estado de ánimo</Text>}</View>
              <View style={[styles.genresGrid, { gap: 12 }]}>{ALL_GENRES.map(genre => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Explorar ${genreLabels[genre] || genre}`} key={genre} activeOpacity={0.7} onPress={() => handleGenrePress(genre)}
                style={[styles.genre, { backgroundColor: colors.card, width: (contentWidth - (width < 768 ? 12 : 36)) / (width < 768 ? 2 : 4), minHeight: native ? 58 : 68 }]}>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: native ? 13 : 14, fontWeight: '500', flex: 1 }}>{genreLabels[genre] || genre}</Text><Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </TouchableOpacity>)}</View>
            </View>
          </>}
          {!!results.length && <>
            <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>{selectedGenre ? genreLabels[selectedGenre] || selectedGenre : 'Resultados'}</Text><Text style={[styles.small, { color: colors.textMuted }]}>{filteredResults.length} títulos</Text></View>
            {!selectedGenre ? <View style={styles.filters}>{(['all', 'anime', 'manga'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} onPress={() => setKind(value)} style={[styles.filter, { borderBottomColor: kind === value ? colors.text : 'transparent' }]}><Text style={{ color: kind === value ? colors.text : colors.textMuted, fontSize: 13, fontWeight: kind === value ? '700' : '400' }}>{value === 'all' ? 'Todo' : value === 'anime' ? 'Anime' : 'Manga'}</Text></TouchableOpacity>)}</View>
              : <TouchableOpacity accessibilityRole="button" onPress={clearSearch} style={styles.backGenres}><Ionicons name="arrow-back" size={15} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>Volver a géneros</Text></TouchableOpacity>}
          </>}
        </>}
        keyExtractor={item => item.key} renderItem={({ item }) => <DiscoveryCard width={cardWidth} title={item.title} poster={item.poster} type={item.kind === 'manga' ? readingFormat(item.manga) : 'Anime'} caption={item.kind === 'manga' ? `${readingFormat(item.manga)} · Leer capítulos` : 'Anime · Ver detalles'} onPress={() => handleResultPress(item)} />}
        columnWrapperStyle={{ gap }} ListEmptyComponent={loading ? <Loader /> : (query.trim().length >= 2 || selectedGenre) && !loading && !searchError ? <View style={styles.empty}><Ionicons name="search-outline" size={36} color={colors.textMuted} /><Text style={{ color: colors.textMuted }}>No encontramos títulos con esta selección.</Text></View> : null} />
      <MovieModal content={selectedContent} visible={modalVisible} onClose={() => setModalVisible(false)} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 }, header: { alignSelf: 'center', zIndex: 100, paddingBottom: 4 }, headingRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 22 }, eyebrow: { fontSize: 9, fontWeight: '600', letterSpacing: 1.4 }, pageTitle: { fontWeight: '600', letterSpacing: -0.8, marginTop: 8 },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 4 }, inputBox: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 4 }, input: { flex: 1, paddingVertical: 12, minWidth: 0 },
  small: { fontSize: 11 }, notice: { alignSelf: 'center', paddingVertical: 12, fontSize: 13, lineHeight: 20 }, retry: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, marginBottom: 20, borderRadius: 3 }, sectionBlock: { marginBottom: 32 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }, sectionTitle: { fontSize: 18, fontWeight: '600' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, chip: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 3 },
  genresGrid: { flexDirection: 'row', flexWrap: 'wrap' }, genre: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 3 }, filters: { flexDirection: 'row', gap: 28, marginBottom: 22 }, filter: { paddingVertical: 12, borderBottomWidth: 2 }, backGenres: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 20 }, empty: { paddingTop: 50, alignItems: 'center', gap: 16 },
});
