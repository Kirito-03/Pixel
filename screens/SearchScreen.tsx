import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, TouchableOpacity, ActivityIndicator, Platform, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import MovieCard from '../components/MovieCard';
import MovieModal from '../components/MovieModal';
import { colors, spacing, shadows, borderRadius } from '../theme';
import { ContentItem } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { catalogService } from '../services/catalogService';

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const { currentProfile } = useProfile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [suggestions, setSuggestions] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const typingTimer = useRef<any>(null);
  const latestQueryRef = useRef<string>('');

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
    const loadRecent = async () => {
      try {
        const profileId = currentProfile?.id;
        if (!profileId) return setRecentQueries([]);
        const stored = await AsyncStorage.getItem(`recentSearches:${profileId}`);
        if (stored) {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr)) setRecentQueries(arr.slice(0, 5));
          else setRecentQueries([]);
        }
      } catch (err) {
        setRecentQueries([]);
      }
    };
    loadRecent();
  }, [currentProfile?.id]);

  const recordRecentSearch = async (text: string) => {
    const q = (text || '').trim();
    const profileId = currentProfile?.id;
    if (!profileId || q.length === 0) return;
    try {
      const stored = await AsyncStorage.getItem(`recentSearches:${profileId}`);
      const list: string[] = stored ? JSON.parse(stored) : [];
      const lower = q.toLowerCase();
      const filtered = list.filter(item => item.toLowerCase() !== lower);
      const updated = [q, ...filtered].slice(0, 5);
      setRecentQueries(updated);
      await AsyncStorage.setItem(`recentSearches:${profileId}`, JSON.stringify(updated));
    } catch (err) {}
  };

  const clearRecent = async () => {
    const profileId = currentProfile?.id;
    if (!profileId) return;
    try {
      await AsyncStorage.removeItem(`recentSearches:${profileId}`);
      setRecentQueries([]);
    } catch (err) {}
  };

  const clearSearch = () => {
    setQuery('');
    latestQueryRef.current = '';
    setSelectedGenre(null);
    setSuggestions([]);
    setResults([]);
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  };

  const fetchSuggestions = async (text: string) => {
    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const localQuery = text;
      const normalizedQuery = localQuery.trim().toLowerCase();
      const all = (await catalogService.searchAnime(normalizedQuery)).map(mapCatalogAnimeToContentItem);
      const seen = new Set<string>();
      const unique = all.filter((item) => {
        const titleKey = (item.title || '').toString().toLowerCase();
        if (seen.has(titleKey)) return false;
        seen.add(titleKey);
        return true;
      }).slice(0, 8);
      if (latestQueryRef.current === localQuery) {
        setSuggestions(unique);
      }
    } catch (error) {
      setSuggestions([]);
    }
  };

  const handleSearch = async (text: string) => {
    setQuery(text);
    setSelectedGenre(null);
    latestQueryRef.current = text;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => fetchSuggestions(text), 500);

    if (text.length > 2) {
      setLoading(true);
      try {
        const localQuery = text;
        const normalizedQuery = localQuery.trim().toLowerCase();
        const filtered = (await catalogService.searchAnime(normalizedQuery)).map(mapCatalogAnimeToContentItem);
        if (latestQueryRef.current === localQuery) {
          setResults(filtered);
        }
      } catch (error) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    } else {
      setResults([]);
    }
  };

  const handleGenrePress = async (genre: string) => {
    setQuery('');
    setSelectedGenre(genre);
    setSuggestions([]);
    setLoading(true);
    try {
      const response = await catalogService.getAnimeList({ genre, limit: 30 });
      const filtered = (response?.data || []).map(mapCatalogAnimeToContentItem);
      setResults(filtered);
    } catch (error) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionPress = (item: ContentItem) => {
    const text = item.title;
    setQuery(text);
    setSuggestions([]);
    handleSearch(text);
    recordRecentSearch(text);
  };

  const handleMoviePress = (id: number) => {
    const contentItem = results.find(item => item.id === id);
    if (contentItem) {
      setSelectedContent(contentItem);
      setModalVisible(true);
    }
  };

  const renderHighlight = (text: string, highlight: string) => {
    if (!highlight.trim()) return <Text style={styles.suggestionText}>{text}</Text>;
    // Escapar caracteres especiales para regex
    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    const parts = text.split(regex);
    return (
      <Text style={styles.suggestionText}>
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
  const inputPlatformStyles = Platform.OS === 'web' ? { outlineStyle: 'none' } : {};

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ zIndex: 100 }}>
        <View style={styles.megaHeaderContainer}>
          {/* Top mini-bar */}
          <View style={styles.topMiniBar}>
            <View style={styles.logoRow}>
              <Ionicons name="play" size={14} color="#E50914" style={{ marginRight: 6 }} />
              <Text style={styles.logoText}>
                PIXEL <Text style={styles.logoTextWhite}>NO SEKAI</Text>
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={12} color="#888" style={{ marginRight: 4 }} />
              <Text style={styles.closeBtnText}>CERRAR</Text>
            </TouchableOpacity>
          </View>
          
          {/* Giant Input */}
          <View style={styles.giantInputWrapper}>
            <Ionicons name="search" size={32} color="#E50914" style={{ marginRight: 20 }} />
            <TextInput
              style={[styles.giantInput, inputPlatformStyles as any]}
              placeholder="Buscar anime..."
              placeholderTextColor="#333"
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
                <Ionicons name="close-circle" size={24} color="#444" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.redDivider} />

          {/* Sugerencias Dropdown */}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsDropdown}>
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.suggestionItemRow}
                  onPress={() => handleSuggestionPress(item)}
                >
                  <View style={styles.suggestionLeft}>
                    {item.poster_path ? (
                      <Image source={{ uri: item.poster_path }} style={styles.suggestionThumb} />
                    ) : (
                      <View style={styles.suggestionThumbFallback} />
                    )}
                    <Ionicons name="search" size={14} color="#555" style={{ marginHorizontal: 12 }} />
                    {renderHighlight(item.title, query)}
                  </View>
                  <View style={styles.suggestionBadge}>
                    <Text style={styles.suggestionBadgeText}>ANIME</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* Main Content Area (Scrollable) */}
      <FlatList
        data={results}
        numColumns={Platform.OS === 'web' ? 5 : 3}
        key={Platform.OS === 'web' ? 'web' : 'mobile'} // Force render on column change
        contentContainerStyle={styles.mainContentScroll}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {recentQueries.length > 0 && !selectedGenre && query.length === 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderLeft}>
                    <View style={styles.redBar} />
                    <Text style={styles.sectionTitle}>ÚLTIMAS BÚSQUEDAS</Text>
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
                      <Ionicons name="time-outline" size={14} color="#666" style={{ marginRight: 8 }} />
                      <Text style={styles.recentChipText}>{text}</Text>
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
                    <Text style={styles.sectionTitle}>EXPLORAR POR GÉNERO</Text>
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
                      <Text style={styles.genreCardText}>{genre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {results.length > 0 && (
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.redBar} />
                  <Text style={styles.sectionTitle}>
                    {selectedGenre ? `RESULTADOS PARA: ${selectedGenre.toUpperCase()}` : 'RESULTADOS'}
                  </Text>
                </View>
              </View>
            )}
          </>
        }
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <MovieCard movie={item} onPress={() => handleMoviePress(item.id)} />
        )}
        columnWrapperStyle={results.length > 0 ? styles.gridColumns : undefined}
        ListEmptyComponent={
          ((query.length > 2 || selectedGenre) && !loading && results.length === 0) ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#222" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>No se encontraron resultados</Text>
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

function mapCatalogAnimeToContentItem(anime: any): ContentItem {
  return {
    id: Number(anime.id),
    type: 'anime',
    title: anime.title || 'Sin título',
    overview: anime.description || '',
    poster_path: anime.poster_url || '',
    backdrop_path: anime.banner_url || anime.poster_url || '',
    release_date: anime.release_date || '',
    vote_average: typeof anime.rating === 'number' ? anime.rating : 0,
    source: 'anilist',
    genres: Array.isArray(anime.genres) ? anime.genres : [],
  };
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
    zIndex: 100, // para asegurar que las sugerencias floten por encima
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
    top: '100%',
    left: 40,
    right: 40,
    backgroundColor: 'rgba(5, 5, 5, 0.98)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#222',
    maxHeight: 400,
    zIndex: 999,
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
  gridColumns: {
    justifyContent: 'flex-start', // Let them pack naturally
    marginBottom: 20,
    gap: 15, // Using flex gap instead of space-between
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
