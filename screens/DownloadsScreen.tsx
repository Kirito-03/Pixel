import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ContentItem } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import MovieCard from '../components/MovieCard';
import MovieModal from '../components/MovieModal';
import AnimeSeriesModal from '../components/AnimeSeriesModal';
import { colors, spacing } from '../theme';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import databaseService from '../services/databaseService';
import { getContentDetails } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Descargas'>;

type DownloadApiItem = {
  content_id: number;
  content_type: 'movie' | 'tv' | 'anime';
  status?: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  file_path?: string | null;
};

type AggregatedMeta = {
  content_id: number;
  content_type: 'movie' | 'tv' | 'anime';
  totalEpisodes?: number;
  totalSeasons?: number;
  estimatedSizeMB?: number;
};

type DisplayEntry = {
  content: ContentItem;
  meta: AggregatedMeta;
};

export default function DownloadsScreen({ }: Props) {
  const { currentProfile, adultContentEnabled } = useProfile();
  const navigation = useNavigation();
  const [items, setItems] = useState<DisplayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (currentProfile) {
        loadDownloads();
      }
    }, [currentProfile])
  );

  const loadDownloads = async () => {
    if (!currentProfile) return;
    setLoading(true);
    try {
      // 1) Traer descargas y agregarlas por contenido
      const downloadItems: DownloadApiItem[] = await databaseService.getDownloads(currentProfile.id);
      if (!Array.isArray(downloadItems) || downloadItems.length === 0) {
        setItems([]);
        return;
      }

      const groups = new Map<string, AggregatedMeta>();
      const EPISODE_SIZE_MB = 250; // estimación por episodio

      for (const item of downloadItems) {
        const key = `${item.content_id}:${item.content_type}`;
        const existing = groups.get(key) || {
          content_id: item.content_id,
          content_type: item.content_type,
          totalEpisodes: 0,
          totalSeasons: 0,
          estimatedSizeMB: 0,
        };

        let metaType: string | undefined;
        let parsed: any = null;
        if (item.file_path) {
          try {
            parsed = JSON.parse(item.file_path);
            metaType = parsed?.type;
          } catch { }
        }

        if (item.content_type === 'anime') {
          if (metaType === 'full_anime') {
            existing.totalSeasons = Number(parsed?.total_seasons || existing.totalSeasons || 0);
            existing.totalEpisodes = Number(parsed?.total_episodes || existing.totalEpisodes || 0);
            existing.estimatedSizeMB = (existing.totalEpisodes || 0) * EPISODE_SIZE_MB;
          } else if (metaType === 'season') {
            existing.totalSeasons = (existing.totalSeasons || 0) + 1;
            const eps = Number(parsed?.total_episodes || 0);
            existing.totalEpisodes = (existing.totalEpisodes || 0) + eps;
            existing.estimatedSizeMB = (existing.totalEpisodes || 0) * EPISODE_SIZE_MB;
          } else if (metaType === 'episode') {
            existing.totalEpisodes = (existing.totalEpisodes || 0) + 1;
            existing.estimatedSizeMB = (existing.estimatedSizeMB || 0) + EPISODE_SIZE_MB;
          } else {
            // sin metadatos -> contar como 1 episodio
            existing.totalEpisodes = (existing.totalEpisodes || 0) + 1;
            existing.estimatedSizeMB = (existing.estimatedSizeMB || 0) + EPISODE_SIZE_MB;
          }
        } else if (item.content_type === 'movie') {
          // Tomar estimación si viene en metadatos; si no, usar ~700MB
          const estimated = Number(parsed?.estimated_size_mb || 700);
          existing.estimatedSizeMB = Math.max(existing.estimatedSizeMB || 0, estimated);
        } else if (item.content_type === 'tv') {
          // Series: tratar episodios como anime si llegaran con metadatos
          if (metaType === 'episode') {
            existing.totalEpisodes = (existing.totalEpisodes || 0) + 1;
            existing.estimatedSizeMB = (existing.estimatedSizeMB || 0) + EPISODE_SIZE_MB;
          } else if (metaType === 'season') {
            existing.totalSeasons = (existing.totalSeasons || 0) + 1;
          }
        }

        groups.set(key, existing);
      }

      // 2) Obtener detalles de contenido únicos
      const entries: DisplayEntry[] = [];
      for (const [key, meta] of groups.entries()) {
        try {
          const type = meta.content_type;
          const source = type === 'anime' ? 'anilist' : 'tmdb';
          const content = await getContentDetails(Number(meta.content_id), type, source);
          if (!content) continue;
          if (!adultContentEnabled && content.type === 'anime' && content.isAdult) continue;
          entries.push({ content, meta });
        } catch { }
      }
      setItems(entries);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleContentPress = (item: ContentItem) => {
    setSelectedContent(item);
    setModalVisible(true);
  };

  const formatSize = (mb?: number): string => {
    if (!mb || mb <= 0) return '—';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
  };

  const renderItem = ({ item }: { item: DisplayEntry }) => (
    <View style={styles.itemContainer}>
      <MovieCard movie={item.content} onPress={() => handleContentPress(item.content)} />
      <View style={styles.metaRow}>
        {item.meta.content_type === 'anime' ? (
          <Text style={styles.metaText}>
            {(item.meta.totalEpisodes || 0) > 0 ? `${item.meta.totalEpisodes} episodio${(item.meta.totalEpisodes || 0) !== 1 ? 's' : ''}` : 'Anime'}
            {` • `}
            {`~${formatSize(item.meta.estimatedSizeMB)}`}
          </Text>
        ) : item.meta.content_type === 'movie' ? (
          <Text style={styles.metaText}>{`~${formatSize(item.meta.estimatedSizeMB)} • Película`}</Text>
        ) : (
          <Text style={styles.metaText}>{`~${formatSize(item.meta.estimatedSizeMB)} • Serie`}</Text>
        )}
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No hay descargas</Text>
      <Text style={styles.emptyText}>
        Cuando descargues series, películas o anime, aparecerán aquí. Por ahora mostramos los títulos
        de tu "Mi Lista" como una vista previa.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando descargas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.title}>Descargas</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              // Si hay una ruta previa en el stack, volvemos atrás.
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              // Si venimos directo a Downloads (sin historial), navega al tab 'Profile' dentro de 'Main'.
              (navigation as any).navigate('Principal', { screen: 'Perfil' });
            }}
            accessibilityLabel="Cerrar descargas"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Tus títulos disponibles sin conexión</Text>
        <Text style={styles.count}>
          {items.length} {items.length === 1 ? 'título' : 'títulos'}
        </Text>
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.meta.content_type}:${item.content.id}`}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />

      {selectedContent?.type === 'anime' ? (
        <AnimeSeriesModal
          content={selectedContent}
          visible={modalVisible}
          onClose={() => {
            setModalVisible(false);
            setSelectedContent(null);
          }}
        />
      ) : (
        <MovieModal
          content={selectedContent}
          visible={modalVisible}
          onClose={() => {
            setModalVisible(false);
            setSelectedContent(null);
          }}
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    marginTop: spacing.md,
    fontSize: 16,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textGray,
    marginBottom: spacing.xs,
  },
  count: {
    fontSize: 14,
    color: colors.textGray,
  },
  listContainer: {
    padding: spacing.md,
    paddingTop: 0,
  },
  itemContainer: {
    flex: 1,
    margin: spacing.xs,
  },
  metaRow: {
    marginTop: spacing.xs,
  },
  metaText: {
    fontSize: 12,
    color: colors.textGray,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textGray,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
});