import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import EpisodePlayer from '../components/EpisodePlayer';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { HentaiCard } from '../components/HentaiComponents';
import HentaiSeriesModal from '../components/HentaiSeriesModal';

const FILTERS = ['Todos', 'Nuevos caps', 'Finalizado'];

export default function NSFWScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 90 : (56 + insets.top);
  const { navigateByLabel } = useTabNavigation();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NSFWAnime[]>([]);
  
  // Navigation & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('Todos');

  // Modals state
  const [selectedAnime, setSelectedAnime] = useState<NSFWAnime | null>(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  
  // Player state
  const [showPlayer, setShowPlayer] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<number>(1);
  const [fetchingVideo, setFetchingVideo] = useState(false);

  useEffect(() => {
    loadContent();
  }, [activeFilter]);

  const loadContent = async () => {
    setLoading(true);
    const data = await nsfwApi.getLatest(searchQuery, activeFilter);
    setItems(data);
    setLoading(false);
  };

  const handleSearchSubmit = () => {
    loadContent();
  };

  const handleCardPress = (item: NSFWAnime) => {
    setSelectedAnime(item);
    setShowSeriesModal(true);
  };

  const handlePlayEpisode = async (slug: string, episodeNumber: number) => {
    if (fetchingVideo) return;
    setFetchingVideo(true);
    
    const servers = await nsfwApi.getServers(slug, episodeNumber);
    if (servers && servers.length > 0) {
      setPlayingUrl(servers[0].url);
      setPlayingEpisode(episodeNumber);
      setShowPlayer(true);
    } else {
      Alert.alert("Error", "No se encontraron servidores de video para este episodio.");
    }
    
    setFetchingVideo(false);
  };

  const closePlayer = () => {
    setShowPlayer(false);
    setPlayingUrl(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: '#111' }]}>
      <Header 
        activeSection="Hentai"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingTop: headerHeight + 20, paddingBottom: 100 }}>
        
        {/* Encabezado y Buscador */}
        <View style={styles.topSection}>
          <Text style={[styles.title, { color: '#E50914' }]}>H Anime</Text>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar hentai..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
          </View>
        </View>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersWrapper} contentContainerStyle={styles.filtersContainer}>
          {FILTERS.map(f => (
            <TouchableOpacity 
              key={f} 
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        {loading || fetchingVideo ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#E50914" />
            {fetchingVideo && <Text style={{color: '#fff', marginTop: 10}}>Buscando servidores de video...</Text>}
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>El catálogo está vacío o no hay resultados.</Text>
            <Text style={styles.emptySubtext}>Intenta con otra búsqueda o filtro.</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {items.map(item => (
              <View key={item.id + item.slug} style={styles.cardWrapper}>
                <HentaiCard
                  item={item}
                  onPress={() => handleCardPress(item)}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Series Details Modal */}
      <HentaiSeriesModal
        visible={showSeriesModal}
        onClose={() => setShowSeriesModal(false)}
        anime={selectedAnime}
        onPlayEpisode={handlePlayEpisode}
      />

      {/* Episode Player Modal */}
      {showPlayer && playingUrl && selectedAnime && (
        <Modal
          visible={showPlayer}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closePlayer}
        >
          <EpisodePlayer
            animeId={parseInt(selectedAnime.id) || 99999}
            seasonNumber={1}
            episode={{
              id: selectedAnime.slug,
              title: selectedAnime.title,
              number: playingEpisode,
              thumbnail_url: selectedAnime.poster_path,
              url: playingUrl,
              duration: 0
            }}
            animeTitle={selectedAnime.title}
            onClose={closePlayer}
            hasNextEpisode={false}
            hasPreviousEpisode={false}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderContainer: {
    marginTop: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  topSection: {
    flexDirection: Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 ? 'row' : 'column',
    justifyContent: 'space-between',
    alignItems: Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 ? 'center' : 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 15,
    gap: 15
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    width: Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 768 ? 300 : '100%',
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    height: '100%',
    outlineStyle: 'none'
  } as any,
  filtersWrapper: {
    marginBottom: 20,
    maxHeight: 50
  },
  filtersContainer: {
    paddingHorizontal: 16,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333'
  },
  filterChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderColor: '#E50914'
  },
  filterText: {
    color: '#999',
    fontWeight: '600'
  },
  filterTextActive: {
    color: '#E50914'
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 8
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
  },
  cardWrapper: {
    padding: 6,
    width: Platform.OS === 'web' ? '12.5%' : '50%',
    minWidth: 140,
  }
});
