import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  ActivityIndicator,
  Platform,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';

interface HentaiSeriesModalProps {
  visible: boolean;
  onClose: () => void;
  anime: NSFWAnime | null;
  onPlayEpisode: (slug: string, episodeNumber: number) => void;
}

export default function HentaiSeriesModal({
  visible,
  onClose,
  anime,
  onPlayEpisode
}: HentaiSeriesModalProps) {
  const [details, setDetails] = useState<NSFWAnime | null>(null);
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && anime) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();

      fetchDetails();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }).start();
      setDetails(null);
    }
  }, [visible, anime]);

  const fetchDetails = async () => {
    if (!anime) return;
    setLoading(true);
    const data = await nsfwApi.getDetails(anime.slug);
    setDetails(data || anime);
    setLoading(false);
  };

  if (!visible || !anime) return null;

  const displayData = details || anime;
  const isWeb = Platform.OS === 'web';
  const { width, height } = Dimensions.get('window');
  
  const modalWidth = isWeb ? Math.min(width * 0.8, 900) : '100%';
  const modalHeight = isWeb ? Math.min(height * 0.9, 800) : '95%';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backgroundTouch} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.modalContainer, { width: modalWidth as any, height: modalHeight as any }]}>
          <TouchableOpacity style={[styles.closeButton, isWeb && { cursor: 'pointer' } as any]} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          
          <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
            <View style={styles.heroSection}>
              <View style={styles.posterWrapper}>
                <Image source={{ uri: displayData.poster_path }} style={styles.poster} resizeMode="cover" />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>18+</Text>
                </View>
              </View>
              
              <View style={styles.infoSection}>
                <Text style={styles.title}>{displayData.title}</Text>
                
                {displayData.genres && displayData.genres.length > 0 && (
                  <View style={styles.genresRow}>
                    {displayData.genres.map(g => (
                      <View key={g} style={styles.genreChip}>
                        <Text style={styles.genreText}>{g}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {loading ? (
                  <ActivityIndicator color="#E50914" style={{ marginTop: 20, alignSelf: 'flex-start' }} />
                ) : (
                  <>
                    <Text style={styles.synopsisHeader}>Sinopsis</Text>
                    <Text style={styles.synopsis}>
                      {displayData.synopsis ? displayData.synopsis : 'No hay sinopsis disponible.'}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View style={styles.episodesSection}>
              <Text style={styles.episodesHeader}>Episodios</Text>
              
              {loading ? (
                <ActivityIndicator color="#E50914" />
              ) : displayData.episodes && displayData.episodes.length > 0 ? (
                displayData.episodes.map((ep, idx) => (
                  <TouchableOpacity
                    key={ep.number}
                    style={[styles.episodeRow, isWeb && { cursor: 'pointer' } as any]}
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      onPlayEpisode(displayData.slug, ep.number);
                    }}
                  >
                    <View style={styles.episodeNumberBox}>
                      <Text style={styles.episodeNumberText}>{ep.number}</Text>
                    </View>
                    <View style={styles.episodeDetails}>
                      <Text style={styles.episodeTitle}>Episodio {ep.number}</Text>
                      <Text style={styles.episodeSubtitle}>Sub Español</Text>
                    </View>
                    <Ionicons name="play-circle-outline" size={28} color="#E50914" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noEpisodes}>No hay episodios disponibles.</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: '#141414',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
    marginTop: Platform.OS !== 'web' ? '10%' : 0
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 5
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 20,
    paddingTop: 40,
  },
  heroSection: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 20,
    marginBottom: 30
  },
  posterWrapper: {
    width: Platform.OS === 'web' ? 220 : 160,
    aspectRatio: 0.7,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222',
    position: 'relative'
  },
  poster: {
    width: '100%',
    height: '100%'
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#E50914',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12
  },
  infoSection: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15
  },
  genreChip: {
    backgroundColor: '#333',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16
  },
  genreText: {
    color: '#ccc',
    fontSize: 12
  },
  synopsisHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8
  },
  synopsis: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20
  },
  episodesSection: {
    marginTop: 10
  },
  episodesHeader: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 10
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10
  },
  episodeNumberBox: {
    width: 40,
    height: 40,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 15
  },
  episodeNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  episodeDetails: {
    flex: 1
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  episodeSubtitle: {
    color: '#999',
    fontSize: 12,
    marginTop: 4
  },
  noEpisodes: {
    color: '#999',
    fontStyle: 'italic'
  }
});
