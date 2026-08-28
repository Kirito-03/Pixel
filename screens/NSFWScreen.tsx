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
import { MangaItemUI } from '../components/MangaComponents';
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
            {items.map((item) => (
              <MangaItemUI
                key={item.id + item.slug}
                manga={{
                  id: item.id,
                  title: item.title,
                  poster_path: item.poster_path,
                  type: 'hentai'
                } as any}
                onPress={() => handleItemPress(item)}
                isSmallScreen={true}
              />
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    justifyContent: 'flex-start',
  }
});
