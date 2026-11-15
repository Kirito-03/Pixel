import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform, SafeAreaView, Image, useWindowDimensions, BackHandler, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MovieCard from '../components/MovieCard';
import MovieModal from '../components/MovieModal';
import { colors, spacing, shadows, borderRadius } from '../theme';
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniversalSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<UniversalSearchResult[]>([]);
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
    setSuggestions([]);
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
    setSuggestions([]);
    setResults([]);
    if (text.length < 2) { setLoading(false); return; }
    setLoading(true);
    typingTimer.current = setTimeout(async () => {
      try {
        const response = await universalSearch(text);
        if (!active || searchRequestRef.current !== requestId) return;
        setResults(response.items);
        setSuggestions(response.items.slice(0, 8));
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
    setSuggestions([]);
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
    setSuggestions([]);
    setIsFocused(false);
    if (query.trim()) recordRecentSearch(query);
    if (item.kind === 'manga') {
      navigation.navigate('Manga', { screen: 'MangaDetail', params: { id: item.manga.id } });
      return;
    }
    setSelectedContent(item.content);
    setModalVisible(true);
  };

  const handleSuggestionPress = (item: UniversalSearchResult) => handleResultPress(item);

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

  const renderHighlight = (text: string, highlight: string) => {
    if (!highlight.trim()) return <Text style={[styles.suggestionText, { color: colors.text, flex: 1 }]} numberOfLines={2}>{text}</Text>;
    // Escapar caracteres especiales para regex
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    const parts = text.split(regex);
    return (
      <Text style={[styles.suggestionText, { color: colors.text, flex: 1 }]} numberOfLines={2}>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <Text key={i} style={{ color: '#E50914', fontWeight: 'bold' }}>
              {part}
            </Text>
          ) : (
            part
          )
        )}
      </Text>
    );
  };

  // En web usamos outlineStyle none. En native lo ignoramos
  const inputPlatformStyles = Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none', borderWidth: 0 } : {};
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const hPad = isWeb ? 40 : 16;
  const numCols = width < 540 ? 2 : width < 900 ? 3 : 5;
  // Calculamos el ancho de cada tarjeta restando el padding horizontal y los gaps
  const gap = 15;
  const availableWidth = width - (hPad * 2);
  const totalGapSpace = gap * (numCols - 1);
  const cardWidth = (availableWidth - totalGapSpace) / numCols;

  const inputSize = width >= 768 ? 36 : 24;
  // En Android: paddingTop = insets.top (altura status bar) + 12 extra
  const headerPaddingTop = isWeb ? 30 : insets.top + 12;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* SafeAreaView solo en web; en Android controlamos el padding manualmente con insets */}
      <View style={{ zIndex: 100, elevation: 100 }}>
        <View style={[styles.megaHeaderContainer, { paddingHorizontal: hPad, paddingTop: headerPaddingTop }]}>
          {/* Top mini-bar — solo en web */}
          {isWeb && (
            <View style={styles.topMiniBar}>
              <View style={styles.logoRow}>
                <Ionicons name="play" size={14} color="#E50914" style={{ marginRight: 6 }} />
                <Text style={styles.logoText}>
                  PIXEL <Text style={[styles.logoTextWhite, { color: colors.text }]}>NO SEKAI</Text>
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={12} color="#888" style={{ marginRight: 4 }} />
                <Text style={styles.closeBtnText}>CERRAR</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Giant Input */}
          <View style={styles.giantInputWrapper}>
            <Ionicons name="search" size={isWeb ? 32 : 22} color="#E50914" style={{ marginRight: isWeb ? 20 : 12 }} />
            <TextInput
              style={[styles.giantInput, { fontSize: inputSize, color: colors.text }, inputPlatformStyles as any]}
              placeholder="Buscar anime y manga..."
              accessibilityLabel="Buscar anime y manga"
              placeholderTextColor={colors.textMuted || '#555'}
              value={query}
              onChangeText={handleSearch}
              onSubmitEditing={({ nativeEvent }) => recordRecentSearch(nativeEvent.text)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoFocus
            />
            {loading && <ActivityIndicator size="small" color="#E50914" style={{ marginLeft: 10 }} />}
            {query.length > 0 && !loading && (
              <TouchableOpacity onPress={clearSearch} style={{ padding: 10 }}>
                <Ionicons name="close-circle" size={24} color={colors.textLight || "#444"} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.redDivider} />

          {/* Sugerencias — solo absolute en web */}
          {isWeb && suggestions.length > 0 && (
            <ScrollView style={[styles.suggestionsDropdown, { backgroundColor: theme === 'dark' ? '#0a0a0a' : '#fff', borderColor: theme === 'dark' ? '#222' : '#ddd' }]} keyboardShouldPersistTaps="handled">
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.suggestionItemRow}
                  onPress={() => handleSuggestionPress(item)}
                >
                  <View style={styles.suggestionLeft}>
                    {item.poster ? (
                      <Image source={{ uri: item.poster }} style={styles.suggestionThumb} />
                    ) : (
                      <View style={styles.suggestionThumbFallback} />
                    )}
                    <Ionicons name="search" size={14} color={colors.textMuted || "#555"} style={{ marginHorizontal: 12 }} />
                    {renderHighlight(item.title, query)}
                  </View>
                  <View style={styles.suggestionBadge}>
                    <Text style={styles.suggestionBadgeText}>{item.kind === 'manga' ? 'MANGA' : 'ANIME'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>





      {!!historyNotice && <Text accessibilityRole="alert" style={{ color: colors.textMuted, paddingHorizontal: hPad, paddingVertical: 10 }}>{historyNotice}</Text>}
      {/* Main Content Area (Scrollable) */}
      <FlatList
        data={results}
        numColumns={numCols}
        key={`search-${numCols}`}
        contentContainerStyle={[styles.mainContentScroll, { paddingHorizontal: hPad }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {searchError ? <Text accessibilityRole="alert" style={{ color: '#ff8080', marginBottom: 16 }}>{searchError}</Text> : null}
            {searchNotice ? <Text style={{ color: colors.textMuted, marginBottom: 16 }}>{searchNotice}</Text> : null}
            {searchError || searchNotice ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar búsqueda" disabled={loading} onPress={() => selectedGenre ? handleGenrePress(selectedGenre) : setRetryIndex(value => value + 1)} style={{ paddingVertical: 12 }}><Text style={{ color: colors.primary }}>Reintentar</Text></TouchableOpacity> : null}
            {/* Sugerencias en Android - Dentro de la lista para que scrollee natural sin desbordarse */}
            {!isWeb && suggestions.length > 0 && (
              <View style={[styles.suggestionsNative, { backgroundColor: theme === 'dark' ? '#0a0a0a' : '#fff', borderColor: theme === 'dark' ? '#1a1a1a' : '#ddd', marginBottom: 20 }]}>
                {suggestions.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.suggestionItemRow}
                    onPress={() => handleSuggestionPress(item)}
                  >
                    <View style={styles.suggestionLeft}>
                      {item.poster ? (
                        <Image source={{ uri: item.poster }} style={styles.suggestionThumb} />
                      ) : (
                        <View style={styles.suggestionThumbFallback} />
                      )}
                      <Ionicons name="search" size={14} color={colors.textMuted || "#555"} style={{ marginHorizontal: 12 }} />
                      {renderHighlight(item.title, query)}
                    </View>
                    <View style={styles.suggestionBadge}>
                      <Text style={styles.suggestionBadgeText}>{item.kind === 'manga' ? 'MANGA' : 'ANIME'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {recentQueries.length > 0 && !selectedGenre && query.length === 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.redBar} />
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ÚLTIMAS BÚSQUEDAS</Text>
                  </View>
                  <TouchableOpacity onPress={clearRecent}>
                    <Text style={styles.clearRecentText}>BORRAR</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.recentChipsContainer}>
                  {recentQueries.map((text, idx) => (
                    <TouchableOpacity
                      key={`${text}-${idx}`}
                      style={styles.recentChip}
                      onPress={() => {
                        setQuery(text);
                        setSelectedGenre(null);
                        setSuggestions([]);
                        handleSearch(text);
                        recordRecentSearch(text);
                      }}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textMuted || "#666"} style={{ marginRight: 8 }} />
                      <Text style={[styles.recentChipText, { color: colors.text }]}>{text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!selectedGenre && query.length === 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.redBar} />
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>EXPLORAR POR GÉNERO</Text>
                  </View>
                </View>
                <View style={styles.genresGrid}>
                  {ALL_GENRES.map((genre) => (
                    <TouchableOpacity
                      key={genre}
                      style={styles.genreCard}
                      onPress={() => handleGenrePress(genre)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.genreCardText, { color: colors.text }]}>{genre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {results.length > 0 && (
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.redBar} />
                  <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                    {selectedGenre ? `RESULTADOS PARA: ${selectedGenre.toUpperCase()}` : 'RESULTADOS'}
                  </Text>
                </View>
                {selectedGenre && (
                  <TouchableOpacity onPress={() => clearSearch()} style={{ padding: 6, backgroundColor: 'rgba(229,9,20,0.1)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(229,9,20,0.2)' }}>
                    <Text style={{ color: '#E50914', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>VOLVER A GÉNEROS</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        }
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          item.kind === 'anime'
            ? <MovieCard movie={item.content} onPress={() => handleResultPress(item)} cardWidth={cardWidth} />
            : <MangaSearchCard item={item} width={cardWidth} color={colors.text} onPress={() => handleResultPress(item)} />
        )}
        columnWrapperStyle={results.length > 0 ? { gap: 15, marginBottom: 20 } : undefined}
        ListEmptyComponent={
          ((query.trim().length >= 2 || selectedGenre) && !loading && !searchError && results.length === 0) ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={theme === 'dark' ? "#222" : "#ddd"} style={{ marginBottom: 16 }} />
              <Text style={[styles.emptyText, { color: colors.textMuted || '#444' }]}>No se encontraron resultados</Text>
            </View>
          ) : null
        }
      />

      <MovieModal
        content={selectedContent}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

function MangaSearchCard({ item, width, color, onPress }: { item: Extract<UniversalSearchResult, { kind: 'manga' }>; width: number; color: string; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Leer detalles de ${item.title}`} onPress={onPress} style={{ width, marginBottom: 12 }}>
    <View style={{ width, height: width * 1.5, backgroundColor: '#181818', justifyContent: 'center', alignItems: 'center' }}>
      {item.poster && !failed ? <Image source={{ uri: item.poster }} onError={() => setFailed(true)} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Ionicons name="book-outline" size={32} color="#888" />}
    </View>
    <Text style={{ color: '#E50914', fontSize: 10, fontWeight: '700', marginTop: 8 }}>MANGA</Text>
    <Text style={{ color, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{item.title}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  megaHeaderContainer: {
    paddingHorizontal: 40,
    paddingTop: 30,
    position: 'relative',
    zIndex: 100,
  },
  topMiniBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    color: '#E50914',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  logoTextWhite: {
    color: '#CCC',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 2,
  },
  closeBtnText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  giantInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 15,
  },
  giantInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 36,
    fontWeight: '700',
    padding: 0,
    margin: 0,
  },
  redDivider: {
    height: 1,
    backgroundColor: '#E50914',
    width: '100%',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: '100%' as any,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,10,10,0.99)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#222',
    maxHeight: 320,
    zIndex: 999,
    elevation: 20,
  },
  suggestionsNative: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderColor: '#1a1a1a',
  },
  suggestionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  suggestionThumb: {
    width: 24,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#111',
  },
  suggestionThumbFallback: {
    width: 24,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#111',
  },
  suggestionText: {
    color: '#DDD',
    fontSize: 15,
    fontWeight: '500',
  },
  suggestionBadge: {
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    backgroundColor: 'rgba(229, 9, 20, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
  },
  suggestionBadgeText: {
    color: '#E50914',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  mainContentScroll: {
    paddingHorizontal: 40,
    paddingTop: 40,
    paddingBottom: 80,
  },
  sectionBlock: {
    marginBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redBar: {
    width: 3,
    height: 14,
    backgroundColor: '#E50914',
    marginRight: 10,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  clearRecentText: {
    color: '#666',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  recentChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  recentChipText: {
    color: '#CCC',
    fontSize: 12,
    fontWeight: '500',
  },
  genresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  genreCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.2)',
  },
  genreCardText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: '#444',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
});
