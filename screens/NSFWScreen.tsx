import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../components/Header';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { MangaCard, MangaItemUI } from '../components/MangaComponents';
import EpisodePlayer from '../components/EpisodePlayer';

export default function NSFWScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 90 : (56 + insets.top);
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NSFWAnime[]>([]);
  const [selectedItem, setSelectedItem] = useState<NSFWAnime | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
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

  const handleItemPress = (item: NSFWAnime) => {
    setSelectedItem(item);
    setShowPlayer(true);
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
      <Header activeSection="Hentai" />
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#E50914" />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingTop: headerHeight + 20, paddingBottom: 100 }}>
          <Text style={[styles.title, { color: '#E50914' }]}>H Anime</Text>
          
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
        </ScrollView>
      )}

      {/* Episode Player Modal */}
      {showPlayer && selectedItem && (
        <Modal
          visible={showPlayer}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closePlayer}
        >
          <EpisodePlayer
            animeId={selectedItem.id}
            seasonId="hentai"
            episode={{
              id: selectedItem.slug,
              title: selectedItem.title,
              number: 1,
              thumbnail_url: selectedItem.poster_path,
              url: `https://hentaila.com/ver/${selectedItem.slug}`,
              duration: 0
            }}
            animeTitle={selectedItem.title}
            source="hentaila"
            onClose={closePlayer}
            onNextEpisode={() => {}}
            onPreviousEpisode={() => {}}
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
