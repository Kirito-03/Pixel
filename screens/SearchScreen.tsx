import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, TouchableOpacity, Animated, ActivityIndicator, Platform, SafeAreaView } from 'react-native';
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
  const { adultContentEnabled, currentProfile } = useProfile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [suggestions, setSuggestions] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const typingTimer = useRef<any>(null);
  const latestQueryRef = useRef<string>('');

  // ESC en web → goBack
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigation.goBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigation]);

  // Animated values
  const focusAnim = useRef(new Animated.Value(0)).current;
  const suggestionsAnim = useRef(new Animated.Value(0)).current;
  const loadingRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Cargar últimas búsquedas por perfil
    const loadRecent = async () => {
      try {
        const profileId = currentProfile?.id;
        if (!profileId) {
          setRecentQueries([]);
          return;
        }
        const stored = await AsyncStorage.getItem(`recentSearches:${profileId}`);
        if (stored) {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr)) setRecentQueries(arr.slice(0, 5));
          else setRecentQueries([]);
        } else {
          setRecentQueries([]);
        }
      } catch (err) {
        console.warn('No se pudieron cargar las últimas búsquedas');
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
      // De-duplicar por minúsculas conservando la última ocurrencia
      const lower = q.toLowerCase();
      const filtered = list.filter(item => item.toLowerCase() !== lower);
      const updated = [q, ...filtered].slice(0, 5);
      setRecentQueries(updated);
      await AsyncStorage.setItem(`recentSearches:${profileId}`, JSON.stringify(updated));
    } catch (err) {
      console.warn('No se pudo guardar la búsqueda reciente');
    }
  };

  const clearSearch = () => {
    setQuery('');
    latestQueryRef.current = '';
    setSuggestions([]);
    setResults([]);
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  };

  const fetchSuggestions = async (text: string) => {
    // Evitar consultas excesivas: exigir mínimo 2 caracteres
    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      // Buscar y limitar a 8 sugerencias para evitar ruido
      const localQuery = text;
      const normalizedQuery = localQuery.trim().toLowerCase();
      const all = (await catalogService.searchAnime(normalizedQuery)).map(mapCatalogAnimeToContentItem);
      // Mantener títulos únicos por tipo para variedad
      const seen = new Set<string>();
      const unique = all.filter((item) => {
        const titleKey = (item.title || '').toString().toLowerCase();
        const key = `${titleKey}-${item.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);
      // Evitar sobrescribir resultados si el usuario ya cambió el texto
      if (latestQueryRef.current === localQuery) {
        setSuggestions(unique);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    }
  };

  const handleSearch = async (text: string) => {
    setQuery(text);
    latestQueryRef.current = text;
    // programar sugerencias en cada cambio de texto
    if (typingTimer.current) clearTimeout(typingTimer.current);
    // Reducir presión sobre AniList y evitar 429: aumentar debounce
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
        console.error('Error searching content:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    } else {
      setResults([]);
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
    // Buscar el item en los resultados actuales
    const contentItem = results.find(item => item.id === id);
    if (contentItem) {
      setSelectedContent(contentItem);
      setModalVisible(true);
    }
  };

  // Animación de focus
  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(focusAnim, {
      toValue: 1,
      useNativeDriver: false,
      friction: 5,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(focusAnim, {
      toValue: 0,
      useNativeDriver: false,
      friction: 5,
    }).start();
  };

  // Animación de sugerencias
  useEffect(() => {
    Animated.timing(suggestionsAnim, {
      toValue: suggestions.length > 0 ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [suggestions]);

  // Animación de loading
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(loadingRotate, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      loadingRotate.setValue(0);
    }
  }, [loading]);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.card, colors.primary],
  });

  const rotate = loadingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* ── TOP BAR ── */}
      <SafeAreaView>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.superTitle}>EXPLORA</Text>
            <View style={styles.titleRow}>
              <Text style={styles.pageTitleWhite}>BÚS</Text>
              <Text style={styles.pageTitleRed}>QUEDA</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <Animated.View style={[styles.inputWrapper, { borderColor, borderWidth: 2 }]}>
        <Ionicons
          name="search"
          size={20}
          color={isFocused ? colors.primary : colors.textGray}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.input}
          placeholder="Buscar anime..."
          placeholderTextColor={colors.textGray}
          value={query}
          onChangeText={handleSearch}
          onSubmitEditing={({ nativeEvent }) => recordRecentSearch(nativeEvent.text)}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {loading && (
          <Animated.View style={[styles.loadingIndicator, { transform: [{ rotate }] }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </Animated.View>
        )}
        {query.length > 0 && !loading && (
          <TouchableOpacity
            accessibilityLabel="Limpiar búsqueda"
            style={styles.clearButton}
            onPress={clearSearch}
          >
            <Ionicons name="close-circle" size={20} color={colors.textGray} />
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Sugerencias bajo el campo de búsqueda con animación */}
      {suggestions.length > 0 && (
        <Animated.View
          style={[
            styles.suggestionsContainer,
            {
              opacity: suggestionsAnim,
              transform: [
                {
                  translateY: suggestionsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <FlatList
            data={suggestions}
            keyExtractor={(item) => `${item.source}-${item.type}-${item.id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionRow}
                onPress={() => handleSuggestionPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionContent}>
                  <Ionicons name="search" size={16} color={colors.textGray} style={styles.suggestionIcon} />
                  <Text style={styles.suggestionText}>{item.title}</Text>
                </View>
                <View style={styles.suggestionBadge}>
                  <Text style={styles.suggestionType}>{item.type.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </Animated.View>
      )}

      {/* Últimas búsquedas */}
      {recentQueries.length > 0 && (
        <View style={styles.recentContainer}>
          <Text style={styles.recentTitle}>Últimas búsquedas</Text>
          {recentQueries.map((text, idx) => (
            <TouchableOpacity
              key={`${text}-${idx}`}
              style={styles.recentRow}
              onPress={() => {
                setQuery(text);
                setSuggestions([]);
                handleSearch(text);
                recordRecentSearch(text);
              }}
            >
              <Ionicons name="time-outline" size={16} color="#666" style={{ marginRight: 10 }} />
              <Text style={styles.recentText}>{text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <FlatList
        data={results}
        numColumns={3}
        columnWrapperStyle={styles.columns}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <MovieCard movie={item} onPress={() => handleMoviePress(item.id)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color="#444" style={{ marginBottom: 16 }} />
            <Text style={styles.empty}>
              {query ? 'No se encontraron resultados.' : 'Busca tus series o películas favoritas.'}
            </Text>
          </View>
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
    backgroundColor: colors.background,
  },

  /* TOP BAR */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 10,
  },
  headerTitleContainer: {
    flex: 1,
  },
  superTitle: {
    color: '#888',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pageTitleWhite: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pageTitleRed: {
    color: '#E50914',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#111',
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFF',
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
  },
  loadingIndicator: {
    marginRight: spacing.sm,
  },
  clearButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsContainer: {
    marginHorizontal: 20,
    marginBottom: spacing.sm,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  recentContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  recentTitle: {
    color: '#666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  suggestionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  suggestionIcon: {
    marginRight: spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  suggestionText: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  suggestionBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 2,
  },
  suggestionType: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  recentText: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: spacing.lg,
  },
  columns: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
});

