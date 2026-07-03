import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { catalogService, CatalogAnime } from '../services/catalogService';
import { animeToContentItem } from '../services/api';
import Header from '../components/Header';
import { useTabNavigation } from '../hooks/useTabNavigation';
import MovieModal from '../components/MovieModal';
import { ContentItem } from '../types';
import axios from 'axios';

export default function AiringScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const gap = 12;
  const desiredItemWidth = width < 768 ? (width * 0.3) : 160;
  const numColumns = Math.max(3, Math.floor((width - 40) / (desiredItemWidth + gap)));
  const itemWidth = (width - 40 - gap * (numColumns - 1)) / numColumns;

  const { navigateByLabel } = useTabNavigation();
  const [activeTab, setActiveTab] = useState<'local' | 'calendar'>('local');
  const [animes, setAnimes] = useState<CatalogAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [calendarDay, setCalendarDay] = useState<string>('monday');
  const [calendarData, setCalendarData] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (activeTab === 'local') {
      fetchAiringAnimes();
    } else {
      fetchCalendar(calendarDay);
    }
  }, [activeTab, calendarDay]);

  const fetchCalendar = async (day: string) => {
    try {
      setCalendarLoading(true);
      const res = await axios.get(`https://api.jikan.moe/v4/schedules?filter=${day}`);
      setCalendarData(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCalendarLoading(false);
    }
  };

  const fetchAiringAnimes = async () => {
    try {
      setLoading(true);
      setError(null);
      // "Airing" es mapeado desde "RELEASING" en AniList
      const res = await catalogService.getAnimeList({ status: 'Airing', limit: 100 });
      setAnimes(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Error cargando animes en emisión');
    } finally {
      setLoading(false);
    }
  };

  const mapCatalogAnimeToContentItem = (anime: CatalogAnime): ContentItem => ({
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
    status: anime.status || '',
  });

  const handleMoviePress = (anime: CatalogAnime) => {
    const item = mapCatalogAnimeToContentItem(anime);
    setSelectedContent(item);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: CatalogAnime }) => {
    return (
      <TouchableOpacity
        style={[styles.card, { width: itemWidth, marginRight: gap, height: itemWidth * 1.5 + 40 }]}
        activeOpacity={0.8}
        onPress={() => handleMoviePress(item)}
      >
        <Image
          source={{ uri: item.poster_url || 'https://via.placeholder.com/300x450' }}
          style={[styles.poster, { height: itemWidth * 1.5 }]}
          resizeMode="cover"
        />
        <View style={styles.episodesBadge}>
          <Text style={styles.episodesText}>{item.total_episodes || '?'} Eps</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCalendarItem = ({ item }: { item: any }) => {
    return (
      <View style={[styles.card, { width: itemWidth, marginRight: gap, height: itemWidth * 1.5 + 40 }]}>
        <Image
          source={{ uri: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/300x450' }}
          style={[styles.poster, { height: itemWidth * 1.5 }]}
          resizeMode="cover"
        />
        <View style={styles.episodesBadge}>
          <Text style={styles.episodesText}>{item.score ? `★ ${item.score}` : 'N/A'}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
    );
  };

  const DAYS = [
    { id: 'monday', label: 'Lun' },
    { id: 'tuesday', label: 'Mar' },
    { id: 'wednesday', label: 'Mié' },
    { id: 'thursday', label: 'Jue' },
    { id: 'friday', label: 'Vie' },
    { id: 'saturday', label: 'Sáb' },
    { id: 'sunday', label: 'Dom' },
  ];

  return (
    <View style={styles.container}>
      <Header 
        activeSection="Emisión" 
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      {/* Espacio extra en la parte superior porque Header es absoluto */}
      <View style={{ height: 90 }} />

      <View style={styles.headerTitleContainer}>
        <Ionicons name="radio-outline" size={28} color={colors.primary} />
        <Text style={styles.pageTitle}>Emisión</Text>
      </View>
      
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'local' && styles.tabBtnActive]}
          onPress={() => setActiveTab('local')}
        >
          <Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>Ver Disponibles</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'calendar' && styles.tabBtnActive]}
          onPress={() => setActiveTab('calendar')}
        >
          <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>Calendario Global</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'calendar' && (
        <View style={styles.daysContainer}>
          {DAYS.map(d => (
            <TouchableOpacity 
              key={d.id} 
              style={[styles.dayBtn, calendarDay === d.id && styles.dayBtnActive]}
              onPress={() => setCalendarDay(d.id)}
            >
              <Text style={[styles.dayText, calendarDay === d.id && styles.dayTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeTab === 'local' && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textGray} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchAiringAnimes}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : animes.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="tv-outline" size={48} color={colors.textGray} />
            <Text style={styles.errorText}>No hay animes en emisión actualmente.</Text>
          </View>
        ) : (
          <FlatList
            data={animes}
            renderItem={renderItem}
            key={numColumns}
            keyExtractor={(item) => item.id.toString()}
            numColumns={numColumns}
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {activeTab === 'calendar' && (
        calendarLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={calendarData}
            renderItem={renderCalendarItem}
            key={numColumns} // Force re-render on resize
            keyExtractor={(item) => item.mal_id?.toString() || Math.random().toString()}
            numColumns={numColumns}
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {selectedContent && (
        <MovieModal
          visible={modalVisible}
          content={selectedContent}
          onClose={() => setModalVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 10,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.card,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textGray,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: '#fff',
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  dayBtn: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dayBtnActive: {
    backgroundColor: colors.cardLight,
  },
  dayText: {
    color: colors.textGray,
    fontSize: 12,
    fontWeight: 'bold',
  },
  dayTextActive: {
    color: colors.text,
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 20,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  episodesBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  episodesText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: colors.textGray,
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardLight,
  },
  retryText: {
    color: colors.text,
    fontWeight: '600',
  },
});
