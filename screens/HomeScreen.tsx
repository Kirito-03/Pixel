import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Dimensions, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList, MovieDetail, ContentItem, AnimeDetail } from '../types';
import { colors } from '../theme';
import Header from '../components/Header';
import FeaturedCarousel from '../components/FeaturedCarousel';
import MovieRow from '../components/MovieRow';
import MovieModal from '../components/MovieModal';
import { getResumeTarget } from '../services/resumeTarget';
import { useProfile } from '../contexts/ProfileContext';
import { useMyList } from '../contexts/MyListContext';
import { catalogService, CatalogAnime } from '../services/catalogService';
import { useTabNavigation } from '../hooks/useTabNavigation';
import ConsentModal from '../components/ConsentModal';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

export default function HomeScreen({ navigation }: Props) {
    const { currentProfile, adultContentEnabled } = useProfile();
    const { addToMyList: addToMyListContext } = useMyList();
    const { navigateByLabel } = useTabNavigation();

    const [contentSections, setContentSections] = useState<{ [key: string]: ContentItem[] }>({});
    const [featuredMovies, setFeaturedMovies] = useState<(MovieDetail | AnimeDetail)[]>([]);
    const [featuredItems, setFeaturedItems] = useState<ContentItem[]>([]); // Sección "Destacados"
    const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [startFromEpisodeId, setStartFromEpisodeId] = useState<number | null>(null);
    const [startFromTimeSeconds, setStartFromTimeSeconds] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [blackHeader, setBlackHeader] = useState(false);
    const [contentFilter, setContentFilter] = useState<'all' | 'movies' | 'series' | 'anime'>('anime');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const scrollViewRef = useRef<ScrollView>(null);
    const { height: screenHeight } = Dimensions.get('window');
    
    // INFINITE SCROLL STATE
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const loadingMoreRef = useRef<boolean>(false);
    const loadedRowKeysRef = useRef<Set<string>>(new Set());
    const [extraRows, setExtraRows] = useState<{ key: string; title: string; items: ContentItem[] }[]>([]);
    const [genreSequenceIndex, setGenreSequenceIndex] = useState(0);

    // List of dynamic genres to load infinitely (Netflix style)
    const GENRE_POOL = ['Action', 'Romance', 'Comedy', 'Sci-Fi', 'Fantasy', 'Slice of Life', 'Drama', 'Adventure'];

    const CATEGORY_LABELS: Record<string, string> = {
        airing: 'En emisión',
        finished: 'Finalizados',
        upcoming: 'Próximos lanzamientos',
    };

    // Accent colors por sección para variedad visual
    const SECTION_ACCENTS: Record<string, string> = {
        airing: colors.primary,          // rojo
        featured: '#FFD700',             // dorado
        finished: '#00C853',             // verde
        upcoming: '#448AFF',             // azul
    };

    const mapCatalogAnimeToContentItem = (anime: CatalogAnime): ContentItem => ({
        id: Number(anime.id),
        type: 'anime',
        title: anime.title || 'Sin título',
        overview: anime.description || '',
        poster_path: anime.poster_url || '',
        backdrop_path: anime.banner_url || anime.poster_url || '',
        release_date: anime.release_date || '',
        vote_average: typeof anime.rating === 'number' ? anime.rating : (parseFloat(anime.rating as unknown as string) || 0),
        source: 'anilist',
        genres: Array.isArray(anime.genres) ? anime.genres : [],
        status: anime.status || '',
    });

    const mapCatalogAnimeToAnimeDetail = (anime: CatalogAnime): AnimeDetail => {
        const releaseYear = anime.release_date ? new Date(anime.release_date).getFullYear() : 0;
        return {
            id: Number(anime.id),
            title: {
                romaji: anime.title || 'Sin título',
                english: anime.title_english || undefined,
                native: anime.title_japanese || anime.title || 'Sin título',
            },
            description: anime.description || '',
            coverImage: {
                large: anime.poster_url || '',
                medium: anime.poster_url || '',
            },
            bannerImage: anime.banner_url || undefined,
            startDate: { year: Number.isFinite(releaseYear) ? releaseYear : 0 },
            averageScore: typeof anime.rating === 'number' ? anime.rating * 10 : ((parseFloat(anime.rating as unknown as string) || 0) * 10),
            episodes: typeof anime.total_episodes === 'number' ? anime.total_episodes : undefined,
            status: anime.status || 'UNKNOWN',
            genres: Array.isArray(anime.genres) ? anime.genres : [],
            format: 'TV',
            source: 'anilist',
            studios: { nodes: [] },
            characters: { nodes: [] },
            recommendations: { nodes: [] },
        } as any;
    };

    const buildFeaturedItems = (
        airing: ContentItem[],
        finished: ContentItem[],
        upcoming: ContentItem[]
    ): ContentItem[] => {
        const allItems = [...airing, ...finished, ...upcoming];

        // Eliminar duplicados por id
        const seen = new Set<number>();
        const unique = allItems.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        // Score compuesto para ordenar
        const scoreItem = (item: ContentItem & { status?: string; total_episodes?: number }) => {
            let score = 0;
            const rating = typeof item.vote_average === 'number' ? item.vote_average : 0;
            score += rating * 10;

            if (typeof (item as any).total_episodes === 'number' && (item as any).total_episodes > 0) {
                score += 15;
            }

            if (item.release_date) {
                const year = new Date(item.release_date).getFullYear();
                const currentYear = new Date().getFullYear();
                if (year >= currentYear - 1) score += 8;
                if (year >= currentYear) score += 5;
            }

            return score;
        };

        return unique
            .sort((a, b) => scoreItem(b as any) - scoreItem(a as any))
            .slice(0, 12); 
    };

    useEffect(() => {
        loadContent();
    }, []);

    const loadContent = async () => {
        try {
            setLoading(true);
            const sections = await catalogService.getHomeSections();

            const newContentSections: { [key: string]: ContentItem[] } = {
                airing: sections.airing.map(mapCatalogAnimeToContentItem),
                finished: sections.finished.map(mapCatalogAnimeToContentItem),
                upcoming: sections.upcoming.map(mapCatalogAnimeToContentItem),
            };

            const featuredBase = newContentSections.airing.length
                ? sections.airing
                : (sections.finished.length ? sections.finished : sections.upcoming);

            setFeaturedMovies(featuredBase.slice(0, 5).map(mapCatalogAnimeToAnimeDetail));

            // Construir sección Destacados
            const featured = buildFeaturedItems(
                newContentSections.airing,
                newContentSections.finished,
                newContentSections.upcoming
            );
            setFeaturedItems(featured);
            setContentSections(newContentSections);
        } catch (error) {
            console.error('Critical error loading content:', error);
            Alert.alert('Error', 'No se pudo cargar el contenido. Por favor, intente de nuevo más tarde.');
        } finally {
            setLoading(false);
        }
    };

    const addToMyList = async (contentId: number) => {
        if (!currentProfile) {
            Alert.alert('Error', 'No hay un perfil seleccionado.');
            return;
        }
        try {
            await addToMyListContext(contentId, 'movie');
            Alert.alert('Éxito', 'Agregado a "Mi Lista".');
        } catch (error: any) {
            console.error('Error adding to my list:', error);
            if (error?.response?.status === 409 || error?.message?.includes('duplicate')) {
                Alert.alert('Información', 'Este título ya está en tu lista.');
            } else {
                Alert.alert('Error', 'No se pudo agregar a "Mi Lista".');
            }
        }
    };

    const handleScroll = (event: any) => {
        const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
        setBlackHeader(contentOffset.y > 10);
        
        // Infinite scroll logic
        const paddingToBottom = 150;
        const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
        if (isAtBottom && !isLoadingMore && contentFilter === 'anime') {
            loadMoreGenres();
        }
    };

    const handleContentPress = (item: ContentItem) => {
        setSelectedContent(item);
        setModalVisible(true);
    };

    const handleProfilePress = () => navigation.getParent()?.navigate('Perfil' as never);
    const handleSearchPress = () => navigation.getParent()?.navigate('Buscar' as never);

    const handleFilterChange = (filter: 'series' | 'movies' | 'all' | 'anime') => {
        setContentFilter(filter);
        setSelectedCategory(null);
        setExtraRows([]);
        setGenreSequenceIndex(0);
        loadedRowKeysRef.current = new Set();
    };

    // Load new genre rows infinitely
    const loadMoreGenres = async () => {
        try {
            if (loadingMoreRef.current) return;
            loadingMoreRef.current = true;
            setIsLoadingMore(true);

            if (genreSequenceIndex >= GENRE_POOL.length) {
                // If we ran out of genres, maybe loop or stop
                setIsLoadingMore(false);
                return;
            }

            const batchSize = 2; // Load 2 genres at a time
            const newExtraRows: { key: string; title: string; items: ContentItem[] }[] = [];

            for (let i = 0; i < batchSize; i++) {
                const currentIndex = genreSequenceIndex + i;
                if (currentIndex >= GENRE_POOL.length) break;
                
                const genre = GENRE_POOL[currentIndex];
                const response = await catalogService.getAnimeList({ genre, limit: 15 });
                const items = (response?.data || []).map(mapCatalogAnimeToContentItem);

                if (items.length > 0) {
                    const rowKey = `genre_${genre}`;
                    if (!loadedRowKeysRef.current.has(rowKey)) {
                        newExtraRows.push({
                            key: rowKey,
                            title: `Animes de ${genre}`,
                            items: items,
                        });
                        loadedRowKeysRef.current.add(rowKey);
                    }
                }
            }

            setGenreSequenceIndex(prev => prev + batchSize);

            if (newExtraRows.length > 0) {
                setExtraRows(prev => [...prev, ...newExtraRows]);
            }
        } catch (error) {
            console.error('Error loading more genres:', error);
        } finally {
            setIsLoadingMore(false);
            loadingMoreRef.current = false;
        }
    };



    const handleCategorySelect = (categoryId: string, categoryName: string) => {
        navigation.navigate('Categoria', { categoryId, categoryName });
    };

    const shouldShowCategory = (categoryId: string) => {
        if (contentFilter === 'all') return true;
        if (contentFilter === 'movies') return false;
        if (contentFilter === 'series') return false;
        if (contentFilter === 'anime') {
            return categoryId === 'airing' || categoryId === 'finished' || categoryId === 'upcoming';
        }
        return false;
    };

    const filterContent = (content: ContentItem[]): ContentItem[] => {
        const byType = content.filter(item => {
            if (contentFilter === 'all') return true;
            if (contentFilter === 'movies') return item.type === 'movie';
            if (contentFilter === 'series') return item.type === 'tv';
            if (contentFilter === 'anime') return item.type === 'anime';
            return true;
        });
        return byType.filter(item => {
            if (item.type === 'anime' && !adultContentEnabled) {
                return !item.isAdult;
            }
            return true;
        });
    };

    if (loading) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const handleContentNavigation = (contentItem: ContentItem) => {
        handleContentPress(contentItem);
    };

    const handleWatchAnime = async (contentItem: ContentItem) => {
        if (!currentProfile) {
            handleContentPress(contentItem);
            return;
        }
        try {
            const target = await getResumeTarget(Number(contentItem.id), Number(currentProfile.id));
            setStartFromEpisodeId(target.episodeId ?? null);
            setStartFromTimeSeconds(target.resumeTime ?? 0);
        } catch {
            setStartFromEpisodeId(null);
            setStartFromTimeSeconds(null);
        }
        handleContentPress(contentItem);
    };

    const hasAnyContent = contentSections.airing?.length ||
        contentSections.finished?.length ||
        contentSections.upcoming?.length;

    return (
        <View style={styles.container}>
            <Header
                black={blackHeader}
                activeSection="Inicio"
                onProfilePress={() => navigateByLabel('Perfil')}
                onSearchPress={() => navigateByLabel('Buscar')}
                onFilterChange={handleFilterChange}
                onCategorySelect={handleCategorySelect}
                onNavPress={navigateByLabel}
            />
            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Carousel */}
                {featuredMovies.length > 0 && (
                    <FeaturedCarousel
                        movies={featuredMovies}
                        onWatch={(movie) => {
                            // "Reproducir" — abre el modal del anime que tiene el player de episodios
                            if ('release_date' in movie) {
                                handleContentNavigation({
                                    id: movie.id,
                                    type: 'movie',
                                    title: movie.title,
                                    overview: movie.overview,
                                    poster_path: movie.poster_path,
                                    backdrop_path: movie.backdrop_path,
                                    release_date: movie.release_date,
                                    vote_average: movie.vote_average,
                                    source: 'tmdb'
                                });
                            } else {
                                handleWatchAnime(mapCatalogAnimeToContentItem({
                                    id: movie.id,
                                    title: (movie as any).title?.romaji || (movie as any).title?.native || '',
                                    description: (movie as any).description || '',
                                    poster_url: (movie as any).coverImage?.large || '',
                                    banner_url: (movie as any).bannerImage || '',
                                    rating: (movie as any).averageScore ? (movie as any).averageScore / 10 : 0,
                                    release_date: '',
                                    genres: (movie as any).genres || [],
                                    status: (movie as any).status || '',
                                } as any));
                            }
                        }}
                        onMoreInfo={(movie) => {
                            // "Más información" — mismo modal, que ya muestra los detalles del anime
                            if ('release_date' in movie) {
                                handleContentPress({
                                    id: movie.id,
                                    type: 'movie',
                                    title: movie.title,
                                    overview: movie.overview,
                                    poster_path: movie.poster_path,
                                    backdrop_path: movie.backdrop_path,
                                    release_date: movie.release_date,
                                    vote_average: movie.vote_average,
                                    source: 'tmdb'
                                });
                            } else {
                                handleContentPress(mapCatalogAnimeToContentItem({
                                    id: movie.id,
                                    title: (movie as any).title?.romaji || (movie as any).title?.native || '',
                                    description: (movie as any).description || '',
                                    poster_url: (movie as any).coverImage?.large || '',
                                    banner_url: (movie as any).bannerImage || '',
                                    rating: (movie as any).averageScore ? (movie as any).averageScore / 10 : 0,
                                    release_date: '',
                                    genres: (movie as any).genres || [],
                                    status: (movie as any).status || '',
                                } as any));
                            }
                        }}
                    />
                )}

                {/* Espaciado entre hero y secciones */}
                <View style={styles.sectionsWrapper}>

                    {/* Sección: En emisión */}
                    {shouldShowCategory('airing') &&
                        contentSections.airing?.length > 0 &&
                        filterContent(contentSections.airing).length > 0 && (
                            <MovieRow
                                key="airing"
                                title="En emisión"
                                accentColor={SECTION_ACCENTS.airing}
                                movies={filterContent(contentSections.airing)}
                                onMoviePress={(id) => {
                                    const item = contentSections.airing.find(i => i.id === id);
                                    if (item) handleContentNavigation(item);
                                }}
                            />
                        )}

                    {/* Sección: Destacados (Top del catálogo) */}
                    {featuredItems.length > 0 && filterContent(featuredItems).length > 0 && (
                        <MovieRow
                            key="featured"
                            title="Destacados"
                            accentColor={SECTION_ACCENTS.featured}
                            movies={filterContent(featuredItems)}
                            onMoviePress={(id) => {
                                const item = featuredItems.find(i => i.id === id);
                                if (item) handleContentNavigation(item);
                            }}
                        />
                    )}

                    {/* Sección: Finalizados */}
                    {shouldShowCategory('finished') &&
                        contentSections.finished?.length > 0 &&
                        filterContent(contentSections.finished).length > 0 && (
                            <MovieRow
                                key="finished"
                                title="Finalizados"
                                accentColor={SECTION_ACCENTS.finished}
                                movies={filterContent(contentSections.finished)}
                                onMoviePress={(id) => {
                                    const item = contentSections.finished.find(i => i.id === id);
                                    if (item) handleContentNavigation(item);
                                }}
                            />
                        )}

                    {/* Sección: Todo el catálogo (upcoming) */}
                    {shouldShowCategory('upcoming') &&
                        contentSections.upcoming?.length > 0 &&
                        filterContent(contentSections.upcoming).length > 0 && (
                            <MovieRow
                                key="upcoming"
                                title="Todo el catálogo"
                                accentColor={SECTION_ACCENTS.upcoming}
                                movies={filterContent(contentSections.upcoming)}
                                onMoviePress={(id) => {
                                    const item = contentSections.upcoming.find(i => i.id === id);
                                    if (item) handleContentNavigation(item);
                                }}
                            />
                        )}

                    {/* Empty state */}
                    {!hasAnyContent && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>Aún no hay anime disponible</Text>
                            <Text style={styles.emptySubtitle}>Agrega contenido desde el panel de administrador.</Text>
                        </View>
                    )}

                    {/* Infinite Scroll Genre Rows */}
                    {extraRows.map((row) => (
                        <MovieRow
                            key={row.key}
                            title={row.title}
                            accentColor={colors.primary}
                            movies={filterContent(row.items)}
                            onMoviePress={(id) => {
                                const item = row.items.find(i => i.id === id);
                                if (item) handleContentNavigation(item);
                            }}
                        />
                    ))}

                    {isLoadingMore && (
                        <View style={styles.loadingMore}>
                            <ActivityIndicator size="small" color={colors.primary} />
                        </View>
                    )}
                </View>
            </ScrollView>

            <ConsentModal />

            {/* Modal para Mostrar/Ocultar detalles (compartido con Home y Catálogo) */}
            <MovieModal
                content={selectedContent}
                visible={modalVisible}
                startFromEpisodeId={startFromEpisodeId}
                startFromTimeSeconds={startFromTimeSeconds}
                onClose={() => {
                    setModalVisible(false);
                    setStartFromEpisodeId(null);
                    setStartFromTimeSeconds(null);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Platform.OS === 'web' ? 60 : 80,
    },
    sectionsWrapper: {
        paddingTop: 28,
    },
    loadingMore: {
        paddingVertical: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    emptyState: {
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    emptyTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 6,
    },
    emptySubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
});
