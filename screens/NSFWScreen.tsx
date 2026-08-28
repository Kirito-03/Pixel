import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../components/Header';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { MangaCard, MangaItemUI } from '../components/MangaComponents';
import EpisodePlayer from '../components/EpisodePlayer';
import { useTabNavigation } from '../hooks/useTabNavigation';

export default function NSFWScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 90 : (56 + insets.top);
  const { navigateByLabel } = useTabNavigation();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NSFWAnime[]>([]);
  const [selectedItem, setSelectedItem] = useState<NSFWAnime | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [fetchingVideo, setFetchingVideo] = useState(false);
  const isSmallScreen = Platform.OS !== 'web' || typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    setLoading(true);
    const data = await nsfwApi.getLatest();
    setItems(data);
    setLoading(false);
  };

  const handleItemPress = async (item: NSFWAnime) => {
    if (fetchingVideo) return;
    setFetchingVideo(true);
    setSelectedItem(item);
    
    // El episodio suele ser el 1 (Hentaila normalmente tiene 1 episodio por entrada)
    const servers = await nsfwApi.getServers(item.slug, 1);
    
    if (servers && servers.length > 0) {
      setPlayingUrl(servers[0].url);
      setShowPlayer(true);
    } else {
      Alert.alert("Error", "No se encontraron servidores de video para este anime.");
      setSelectedItem(null);
    }
    
    setFetchingVideo(false);
  };

  const closePlayer = () => {
    setShowPlayer(false);
    setSelectedItem(null);
  };

  const columns = isSmallScreen ? 2 : 8;
  const chunks: NSFWAnime[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    chunks.push(items.slice(i, i + columns));
  }

  return (
    <View style={[styles.container, { backgroundColor: '#111' }]}>
      <Header 
        activeSection="Hentai"
        onNavPress={navigateByLabel}
        onSearchPress={() => navigateByLabel('Buscar')}
        onProfilePress={() => navigateByLabel('Perfil')}
      />
      {loading || fetchingVideo ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#E50914" />
          {fetchingVideo && <Text style={{color: '#fff', marginTop: 10}}>Buscando servidores de video...</Text>}
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingTop: headerHeight + 20, paddingBottom: 100 }}>
          <Text style={[styles.title, { color: '#E50914' }]}>H Anime</Text>
          
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>El catálogo está vacío.</Text>
              <Text style={styles.emptySubtext}>El bot sincronizará automáticamente los títulos pronto.</Text>
            </View>
          ) : (
            <View style={styles.gridContainer}>
              {chunks.map((row, rIdx) => (
                <View key={`row-${rIdx}`} style={styles.gridRow}>
                  {row.map((item) => (
                    <MangaCard
                      key={item.id + item.slug}
                      item={{
                        id: item.id,
                        title: item.title,
                        image: item.poster_path,
                        status: 'Finalizado',
                        rating: 0,
                        chapters: 1,
                        updatedAt: new Date().toISOString()
                      } as MangaItemUI}
                      onPress={() => handleItemPress(item)}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Episode Player Modal */}
      {showPlayer && selectedItem && playingUrl && (
        <Modal
          visible={showPlayer}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closePlayer}
        >
          <EpisodePlayer
            animeId={parseInt(selectedItem.id) || 99999}
            seasonNumber={1}
            episode={{
              id: selectedItem.slug,
              title: selectedItem.title,
              number: 1,
              thumbnail_url: selectedItem.poster_path,
              url: playingUrl,
              duration: 0
            }}
            animeTitle={selectedItem.title}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 16,
    marginBottom: 20,
    textTransform: 'uppercase'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40
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
    flex: 1,
    paddingHorizontal: 8,
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  }
});
