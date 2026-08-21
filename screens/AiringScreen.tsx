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
import { getCurrentBaseURL } from '../services/databaseService';
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
  
  const currentDayStr = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
  const [calendarDay, setCalendarDay] = useState<string>(currentDayStr);
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
      // Llamamos al backend proxy para evitar CORS en web
      const baseURL = getCurrentBaseURL() || 'http://localhost:3001';
      const res = await axios.get(`${baseURL}/api/schedules?filter=${day}`);
      setCalendarData(res.data.data || []);
    } catch (err) {
      console.error('[AiringScreen] Error cargando calendario:', err);
    } finally {
      setCalendarLoading(false);
    }
  };

  const fetchAiringAnimes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await catalogService.getAnimeList({ status: 'Airing', limit: 100 });
      // Deduplicate by id
      const uniqueAnimes: CatalogAnime[] = [];
      const seenIds = new Set<string>();
      for (const item of (res.data || [])) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          uniqueAnimes.push(item);
        }
      }
      setAnimes(uniqueAnimes);
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

  const mapJikanToContentItem = (item: any): ContentItem => ({
    id: Number(item.mal_id),
    type: 'anime',
    title: item.title || 'Sin título',
    overview: item.synopsis || '',
    poster_path: item.images?.jpg?.large_image_url || '',
    backdrop_path: item.images?.jpg?.large_image_url || '',
    release_date: '',
    vote_average: item.score || 0,
    source: 'jikan',
    genres: [],
    status: item.status || '',
  });

  const handleCalendarPress = (item: any) => {
    const content = mapJikanToContentItem(item);
    setSelectedContent(content);
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: CatalogAnime }) => {
    return (
      <TouchableOpacity
        style={[styles.card, { width: itemWidth, marginRight: gap }]}
        activeOpacity={0.8}
        onPress={() => handleMoviePress(item)}
      >
        <View style={[styles.posterBox, { height: itemWidth * 1.5 }]}>
          <Image
            source={{ uri: item.poster_url || 'https://via.placeholder.com/300x450' }}
            style={styles.poster}
            resizeMode="cover"
          />
          <View style={styles.badgeTopLeft}>
            <Text style={styles.badgeText}>SUB</Text>
          </View>
          <View style={styles.badgeTopRight}>
            <Ionicons name="star" size={10} color="#fff" style={{ marginRight: 2 }} />
            <Text style={styles.badgeText}>{typeof item.rating === 'number' ? (item.rating / 10).toFixed(1) : 'N/A'}</Text>
          </View>
          <View style={styles.badgeBottomLeft}>
            <Text style={styles.epText}>{item.total_episodes ? `Ep ${item.total_episodes}` : 'Emisión'}</Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>Emisión actual</Text>
      </TouchableOpacity>
    );
  };

  const renderCalendarItem = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity
        style={[styles.card, { width: itemWidth, marginRight: gap }]}
        activeOpacity={0.8}
        onPress={() => handleCalendarPress(item)}
      >
        <View style={[styles.posterBox, { height: itemWidth * 1.5 }]}>
          <Image
            source={{ uri: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/300x450' }}
            style={styles.poster}
            resizeMode="cover"
          />
          <View style={styles.badgeTopLeft}>
            <Text style={styles.badgeText}>SUB</Text>
          </View>
          <View style={styles.badgeTopRight}>
            <Ionicons name="star" size={10} color="#fff" style={{ marginRight: 2 }} />
            <Text style={styles.badgeText}>{item.score ? item.score.toFixed(1) : 'N/A'}</Text>
          </View>
          <View style={styles.badgeBottomLeft}>
            <Text style={styles.epText}>{item.broadcast?.time || '00:00'}</Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{item.broadcast?.string || 'Emisión semanal'}</Text>
      </TouchableOpacity>
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
        <Text style={styles.superTitle}>EN VIVO</Text>
        <View style={styles.titleRow}>
          <Text style={styles.pageTitleWhite}>EMI</Text>
          <Text style={styles.pageTitleRed}>SIÓN</Text>
        </View>
        <Text style={styles.pageSubtitle}>CALENDARIO DE EMISIÓN SEMANAL</Text>
      </View>
      
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'local' && styles.tabBtnActive]}
          onPress={() => setActiveTab('local')}
        >
          <Ionicons name="list" size={16} color={activeTab === 'local' ? '#fff' : '#666'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>VER DISPONIBLES</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'calendar' && styles.tabBtnActiveCalendar]}
          onPress={() => setActiveTab('calendar')}
        >
          <Ionicons name="calendar-outline" size={16} color={activeTab === 'calendar' ? '#fff' : '#666'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>CALENDARIO GLOBAL</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'calendar' && (
        <View style={styles.daysContainer}>
          {DAYS.map(d => (
            <TouchableOpacity 
              key={d.id} 
              style={[styles.dayBtn, calendarDay === d.id && styles.dayBtnActive]}
              onPress={() => {
                setActiveTab('calendar');
                setCalendarDay(d.id);
              }}
            >
              <Text style={[styles.dayText, calendarDay === d.id && styles.dayTextActive]}>{d.label.toUpperCase()}</Text>
              {calendarDay === d.id && <View style={styles.activeDayDot} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
      
      {/* Indicador del Día / Sección Hoy */}
      <View style={styles.sectionHeaderBox}>
        <View style={styles.sectionHeaderDot} />
        <Text style={styles.sectionHeaderText}>
          {activeTab === 'calendar' 
            ? DAYS.find(d => d.id === calendarDay)?.label.toUpperCase() 
            : 'HOY'}
        </Text>
      </View>

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
            <ActivityIndicator size="large" color={'#E50914'} />
          </View>
        ) : calendarData.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="calendar-outline" size={48} color={'#666'} />
            <Text style={styles.errorText}>No hay animes programados para este día.</Text>
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
    paddingHorizontal: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#E50914',
    marginLeft: 20,
    paddingLeft: 16,
  },
  superTitle: {
    color: '#E50914',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pageTitleWhite: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pageTitleRed: {
    color: '#E50914',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  pageSubtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabBtnActive: {
    backgroundColor: '#E50914',
  },
  tabBtnActiveCalendar: {
    backgroundColor: '#E50914',
  },
  tabText: {
    color: '#666',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  tabTextActive: {
    color: '#fff',
  },
  daysContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dayBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    position: 'relative',
  },
  dayBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#E50914',
  },
  dayText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '800',
  },
  dayTextActive: {
    color: '#fff',
  },
  activeDayDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 4,
    height: 4,
    backgroundColor: '#E50914',
  },
  sectionHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionHeaderDot: {
    width: 6,
    height: 6,
    backgroundColor: '#E50914',
    marginRight: 8,
  },
  sectionHeaderText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 24,
  },
  posterBox: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    marginBottom: 8,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  badgeTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#E50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeBottomLeft: {
    position: 'absolute',
    bottom: 6,
    left: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  epText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
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
