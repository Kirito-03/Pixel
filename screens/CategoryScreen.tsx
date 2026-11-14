import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import MovieRow from '../components/MovieRow';
import { ContentItem } from '../types';
import MovieModal from '../components/MovieModal';
import CategoriesMenu from '../components/CategoriesMenu';
import { useProfile } from '../contexts/ProfileContext';
import {
  getPopularMovies,
  getTopRatedMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getMoviesByGenre,
  getPopularTVShows,
  getTopRatedTVShows,
  getOnTheAirTVShows,
  getAiringTodayTVShows,
  getTVShowsByGenre,
  GENRES
} from '../services/api';
import * as AniListService from '../services/anilistService';
import { animeToContentItem } from '../services/api';

type RootStackParamList = {
  Categoria: { categoryId: string; categoryName: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Categoria'>;

// Mapeo de categorías a géneros de TMDB
const categoryToGenreMap: { [key: string]: any } = {
  action: { movies: GENRES.ACTION, type: 'movie' },
  comedy: { movies: GENRES.COMEDY, tv: GENRES.COMEDY, type: 'both' },
  comedias: { movies: GENRES.COMEDY, tv: GENRES.COMEDY, type: 'both' },
  drama: { tv: GENRES.DRAMA, type: 'tv' },
  horror: { movies: GENRES.HORROR, type: 'movie' },
  terror: { movies: GENRES.HORROR, type: 'movie' },
  scifi: { movies: GENRES.SCIENCE_FICTION, tv: GENRES.SCIENCE_FICTION, type: 'both' },
  'sci-fi': { movies: GENRES.SCIENCE_FICTION, tv: GENRES.SCIENCE_FICTION, type: 'both' },
  romance: { movies: GENRES.ROMANCE, type: 'movie' },
  romances: { movies: GENRES.ROMANCE, type: 'movie' },
  anime: { movies: GENRES.ANIMATION, type: 'movie' },
  thriller: { movies: GENRES.THRILLER, type: 'movie' },
  thrillers: { movies: GENRES.THRILLER, type: 'movie' },
  fantasy: { movies: GENRES.FANTASY, type: 'both' },
  fantasia: { movies: GENRES.FANTASY, type: 'both' },
  documentaries: { movies: GENRES.DOCUMENTARY, type: 'movie' },
  documentales: { movies: GENRES.DOCUMENTARY, type: 'movie' },
  family: { movies: GENRES.FAMILY, type: 'movie' },
  music: { movies: GENRES.MUSIC, type: 'both' },
};

export default function CategoryScreen({ navigation, route }: Props) {
  const { categoryId, categoryName } = route.params;
  const { adultContentEnabled } = useProfile();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<any>({
    movies: [],
    topRated: [],
    upcoming: [],
    tvShows: [],
    topRatedTV: [],
  });
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showCategoriesMenu, setShowCategoriesMenu] = useState(false);
  const isAnimeCategory = categoryId === 'popular_anime' || categoryId === 'airing_anime' || categoryId === 'top_anime';
  const [animeItems, setAnimeItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    loadCategoryContent();
  }, [categoryId]);

  const loadCategoryContent = async () => {
    try {
      setLoading(true);
      if (isAnimeCategory) {
        let list: ContentItem[] = [];
        if (categoryId === 'popular_anime') {
          const res = await AniListService.getPopularAnime();
          list = res.map(animeToContentItem);
        } else if (categoryId === 'airing_anime') {
          const res = await AniListService.getAiringAnime();
          list = res.map(animeToContentItem);
        } else if (categoryId === 'top_anime') {
          const res = await AniListService.getTopRatedAnime();
          list = res.map(animeToContentItem);
        }
        setAnimeItems(list);
        return;
      }
      const categoryConfig = categoryToGenreMap[categoryId];

      if (!categoryConfig) {
        // Categorías especiales sin género específico
        await loadDefaultContent();
        return;
      }

      const contentData: any = {
        movies: [],
        topRated: [],
        upcoming: [],
        tvShows: [],
        topRatedTV: [],
      };

      // Cargar películas si aplica
      if (categoryConfig.type === 'movie' || categoryConfig.type === 'both') {
        if (categoryConfig.movies) {
          const [moviesData, topRatedData] = await Promise.all([
            getMoviesByGenre(categoryConfig.movies),
            getTopRatedMovies(),
          ]);
          contentData.movies = moviesData;
          contentData.topRated = topRatedData.filter((m: any) =>
            m.genre_ids?.includes(categoryConfig.movies)
          );
        }
      }

      // Cargar series si aplica
      if (categoryConfig.type === 'tv' || categoryConfig.type === 'both') {
        if (categoryConfig.tv) {
          const [tvData, topRatedTVData] = await Promise.all([
            getTVShowsByGenre(categoryConfig.tv),
            getTopRatedTVShows(),
          ]);
          contentData.tvShows = tvData;
          contentData.topRatedTV = topRatedTVData.filter((s: any) =>
            s.genre_ids?.includes(categoryConfig.tv)
          );
        }
      }

      setContent(contentData);
    } catch (error) {
      console.error('Error loading category content:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDefaultContent = async () => {
    try {
      // Para categorías sin género específico, cargar contenido general
      const [moviesData, tvData] = await Promise.all([
        getPopularMovies(),
        getPopularTVShows(),
      ]);

      setContent({
        movies: moviesData.slice(0, 10),
        topRated: [],
        upcoming: [],
        tvShows: tvData.slice(0, 10),
        topRatedTV: [],
      });
    } catch (error) {
      console.error('Error loading default content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContentPress = async (id: number, type: 'movie' | 'tv', item: any) => {
    try {
      const contentItem: ContentItem = {
        id,
        type,
        title: type === 'movie' ? item.title : item.name,
        overview: item.overview,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        release_date: type === 'movie' ? item.release_date : item.first_air_date,
        vote_average: item.vote_average,
        source: 'tmdb',
      };

      setSelectedContent(contentItem);
      setModalVisible(true);
    } catch (error) {
      console.error('Error loading content details:', error);
    }
  };

  const handleCategorySelect = (newCategoryId: string, newCategoryName: string) => {
    // Navegar a la nueva categoría reemplazando la pantalla actual
    navigation.replace('Categoria', { categoryId: newCategoryId, categoryName: newCategoryName });
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={28} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Categorías</Text>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="search" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Chip de categoría seleccionada */}
        <View style={styles.chipContainer}>
          <TouchableOpacity style={styles.closeChip} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={18} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.categoryChip}
            onPress={() => setShowCategoriesMenu(true)}
          >
            <Text style={styles.chipText}>{categoryName}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.text} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Contenido */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {isAnimeCategory && animeItems.length > 0 && (
          <MovieRow
            title={categoryName}
            movies={animeItems.filter((item: any) => adultContentEnabled || !item.isAdult)}
            onMoviePress={(id) => {
              const item = animeItems.find((m: any) => m.id === id);
              if (item) {
                setSelectedContent(item);
                setModalVisible(true);
              }
            }}
          />
        )}
        {/* Películas principales */}
        {!isAnimeCategory && content.movies.length > 0 && (
          <MovieRow
            title={`${categoryName} - Películas`}
            movies={content.movies.filter((item: any) => adultContentEnabled || !item.isAdult)}
            onMoviePress={(id) => {
              const movie = content.movies.find((m: any) => m.id === id);
              handleContentPress(id, 'movie', movie);
            }}
          />
        )}

        {/* Series */}
        {!isAnimeCategory && content.tvShows.length > 0 && (
          <MovieRow
            title={`${categoryName} - Series`}
            movies={content.tvShows.filter((item: any) => adultContentEnabled || !item.isAdult)}
            onMoviePress={(id) => {
              const show = content.tvShows.find((s: any) => s.id === id);
              handleContentPress(id, 'tv', show);
            }}
          />
        )}

        {/* Mejor valoradas */}
        {!isAnimeCategory && content.topRated.length > 0 && (
          <MovieRow
            title="Mejor Valoradas"
            movies={content.topRated.filter((item: any) => adultContentEnabled || !item.isAdult)}
            onMoviePress={(id) => {
              const movie = content.topRated.find((m: any) => m.id === id);
              handleContentPress(id, 'movie', movie);
            }}
          />
        )}

        {/* Series mejor valoradas */}
        {!isAnimeCategory && content.topRatedTV.length > 0 && (
          <MovieRow
            title="Series Mejor Valoradas"
            movies={content.topRatedTV.filter((item: any) => adultContentEnabled || !item.isAdult)}
            onMoviePress={(id) => {
              const show = content.topRatedTV.find((s: any) => s.id === id);
              handleContentPress(id, 'tv', show);
            }}
          />
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <MovieModal
        content={selectedContent}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />

      <CategoriesMenu
        visible={showCategoriesMenu}
        onClose={() => setShowCategoriesMenu(false)}
        onSelectCategory={handleCategorySelect}
        currentCategoryId={categoryId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.background,
    paddingTop: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginRight: 40,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  closeChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.textGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.textGray,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

