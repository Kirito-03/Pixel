import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nsfwApi, NSFWAnime } from '../services/nsfwApi';
import { useProfile } from '../contexts/ProfileContext';
import MyListButton from './MyListButton';
import { useTheme } from '../contexts/ThemeContext';

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
  onPlayEpisode,
}: HentaiSeriesModalProps) {
  const { colors } = useTheme();
  const { adultContentEnabled, currentProfile } = useProfile();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const isSmallScreen = width < 768;

  const [details, setDetails] = useState<NSFWAnime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const detailsRequestIdRef = useRef(0);
  const profileId = currentProfile?.id ?? null;

  const fetchDetails = useCallback(async () => {
    if (!anime || !adultContentEnabled) return;
    const reqId = ++detailsRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await nsfwApi.getDetails(anime.slug);
      if (reqId !== detailsRequestIdRef.current) return;
      if (data) {
        setDetails(data);
      } else {
        setDetails(anime);
        setError('No se pudieron cargar todos los detalles de la serie.');
      }
    } catch {
      if (reqId !== detailsRequestIdRef.current) return;
      setDetails(anime);
      setError('Ocurrió un error al cargar los detalles.');
    } finally {
      if (reqId === detailsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [anime, adultContentEnabled]);

  useEffect(() => {
    // Invalidate any in-flight request when visibility, anime, profile, or +18 guard changes.
    detailsRequestIdRef.current += 1;
    setImageError(false);

    if (!adultContentEnabled) {
      setDetails(null);
      setLoading(false);
      setError(null);
      if (visible) {
        onClose();
      }
      return;
    }

    if (visible && anime) {
      setDetails(null);
      fetchDetails();
    } else {
      setDetails(null);
      setLoading(false);
      setError(null);
    }
  }, [visible, anime?.slug, adultContentEnabled, profileId, fetchDetails, onClose]);

  if (!visible || !anime || !adultContentEnabled) return null;

  const displayData = details || anime;
  const episodes = Array.isArray(displayData.episodes) ? displayData.episodes : [];
  const firstEpisode = episodes.length > 0 ? episodes[0] : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.fullscreenOverlay, { backgroundColor: colors.background }]}>
        <StatusBar style="light" translucent />

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cerrar detalles"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[
            styles.closeButton,
            {
              top: isWeb ? 20 : Math.max(16, insets.top + 8),
              right: isWeb ? 24 : 16,
              backgroundColor: 'rgba(20, 20, 20, 0.85)',
              borderColor: colors.glassBorder,
            },
            isWeb && ({ cursor: 'pointer' } as any),
          ]}
          onPress={onClose}
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={[
            styles.scrollInner,
            {
              paddingTop: isWeb ? 36 : Math.max(24, insets.top + 16),
              paddingBottom: Math.max(40, insets.bottom + 24),
              paddingHorizontal: isSmallScreen ? 16 : 24,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.boundedContent}>
            <View
              style={[
                styles.heroSection,
                { flexDirection: isSmallScreen ? 'column' : 'row' },
              ]}
            >
              <View
                style={[
                  styles.posterWrapper,
                  {
                    width: isSmallScreen ? 160 : 220,
                    alignSelf: isSmallScreen ? 'center' : 'flex-start',
                    backgroundColor: colors.card,
                    borderColor: colors.glassBorder,
                  },
                ]}
              >
                {!displayData.poster_path || imageError ? (
                  <View style={[styles.posterFallback, { backgroundColor: colors.cardLight }]}>
                    <Ionicons name="film-outline" size={36} color={colors.textMuted} />
                    <Text style={[styles.posterFallbackText, { color: colors.textMuted }]}>18+</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: displayData.poster_path }}
                    style={styles.poster}
                    resizeMode="cover"
                    onError={() => setImageError(true)}
                  />
                )}
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>18+</Text>
                </View>
              </View>

              <View style={styles.infoSection}>
                <Text style={[styles.title, { color: colors.text, fontSize: isSmallScreen ? 22 : 30 }]}>
                  {displayData.title}
                </Text>

                {displayData.genres && displayData.genres.length > 0 && (
                  <View style={styles.genresRow}>
                    {displayData.genres.map((g) => (
                      <View
                        key={g}
                        style={[
                          styles.genreChip,
                          { backgroundColor: colors.surfaceElevated, borderColor: colors.glassBorder },
                        ]}
                      >
                        <Text style={[styles.genreText, { color: colors.textSecondary }]}>{g}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.actionRow}>
                  {firstEpisode && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Reproducir episodio ${firstEpisode.number}`}
                      style={[styles.playHeroBtn, isWeb && ({ cursor: 'pointer' } as any)]}
                      activeOpacity={0.85}
                      onPress={() => {
                        onClose();
                        onPlayEpisode(displayData.slug, firstEpisode.number);
                      }}
                    >
                      <Ionicons name="play" size={18} color="#000" />
                      <Text style={styles.playHeroBtnText}>
                        Reproducir Ep. {firstEpisode.number}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <MyListButton id={displayData.slug} type="h_anime" />
                </View>

                <Text style={[styles.synopsisHeader, { color: colors.text }]}>Sinopsis</Text>
                {loading ? (
                  <View style={styles.inlineLoadingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.inlineLoadingText, { color: colors.textMuted }]}>
                      Cargando sinopsis...
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.synopsis, { color: colors.textSecondary }]}>
                    {displayData.synopsis ? displayData.synopsis : 'No hay sinopsis disponible.'}
                  </Text>
                )}
              </View>
            </View>

            {error && (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: colors.card, borderColor: colors.glassBorder },
                ]}
              >
                <View style={styles.errorBannerLeft}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.primary} />
                  <Text style={[styles.errorBannerText, { color: colors.textSecondary }]}>{error}</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar carga de detalles"
                  style={[
                    styles.retryBtn,
                    { backgroundColor: colors.primary },
                    isWeb && ({ cursor: 'pointer' } as any),
                  ]}
                  onPress={fetchDetails}
                >
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.episodesSection}>
              <View style={[styles.episodesHeaderRow, { borderBottomColor: colors.divider }]}>
                <Text style={[styles.episodesHeader, { color: colors.text }]}>Episodios</Text>
                {!loading && (
                  <Text style={[styles.episodesCount, { color: colors.textMuted }]}>
                    {episodes.length} {episodes.length === 1 ? 'episodio' : 'episodios'}
                  </Text>
                )}
              </View>

              {loading ? (
                <View style={styles.episodesLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.episodesLoadingText, { color: colors.textMuted }]}>
                    Cargando episodios...
                  </Text>
                </View>
              ) : episodes.length > 0 ? (
                episodes.map((ep) => (
                  <TouchableOpacity
                    key={ep.number}
                    accessibilityRole="button"
                    accessibilityLabel={`Reproducir episodio ${ep.number}`}
                    style={[
                      styles.episodeRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.glassBorder,
                      },
                      isWeb && ({ cursor: 'pointer' } as any),
                    ]}
                    activeOpacity={0.75}
                    onPress={() => {
                      onClose();
                      onPlayEpisode(displayData.slug, ep.number);
                    }}
                  >
                    <View
                      style={[
                        styles.episodeNumberBox,
                        { backgroundColor: colors.surfaceElevated },
                      ]}
                    >
                      <Text style={[styles.episodeNumberText, { color: colors.text }]}>
                        {ep.number}
                      </Text>
                    </View>
                    <View style={styles.episodeDetails}>
                      <Text style={[styles.episodeTitle, { color: colors.text }]}>
                        Episodio {ep.number}
                      </Text>
                      <Text style={[styles.episodeSubtitle, { color: colors.textMuted }]}>
                        Sub Español
                      </Text>
                    </View>
                    <Ionicons name="play-circle-outline" size={28} color={colors.primary} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyEpisodes}>
                  <Ionicons name="film-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.noEpisodes, { color: colors.textMuted }]}>
                    No hay episodios disponibles.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullscreenOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 0,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
  },
  boundedContent: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  heroSection: {
    gap: 24,
    marginBottom: 28,
    paddingTop: 16,
  },
  posterWrapper: {
    aspectRatio: 0.7,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  posterFallbackText: {
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  infoSection: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
    marginBottom: 12,
    paddingRight: 44,
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 0,
    borderWidth: 0,
  },
  genreText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  playHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 0,
  },
  playHeroBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  synopsisHeader: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  synopsis: {
    fontSize: 14,
    lineHeight: 22,
  },
  inlineLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  inlineLoadingText: {
    fontSize: 13,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 0,
    borderWidth: 0,
    marginBottom: 20,
  },
  errorBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  episodesSection: {
    marginTop: 8,
  },
  episodesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0,
    paddingBottom: 10,
    marginBottom: 14,
  },
  episodesHeader: {
    fontSize: 20,
    fontWeight: '700',
  },
  episodesCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  episodesLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  episodesLoadingText: {
    fontSize: 13,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 0,
    borderWidth: 0,
    marginBottom: 10,
  },
  episodeNumberBox: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
    marginRight: 14,
  },
  episodeNumberText: {
    fontWeight: '700',
    fontSize: 15,
  },
  episodeDetails: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  episodeSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  emptyEpisodes: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  noEpisodes: {
    fontSize: 14,
  },
});
