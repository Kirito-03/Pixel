import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Dimensions, Alert, Platform, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList, MovieDetail, ContentItem, AnimeDetail } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import Loader from '../components/Loader';
import Header from '../components/Header';
import FeaturedCarousel from '../components/FeaturedCarousel';
import { prioritizeFeaturedArtwork } from '../utils/featuredArtwork';
import MovieRow from '../components/MovieRow';
import MovieModal from '../components/MovieModal';
import { getResumeTarget } from '../services/resumeTarget';
import { useProfile } from '../contexts/ProfileContext';
import { useMyList } from '../contexts/MyListContext';
import { catalogService, CatalogAnime } from '../services/catalogService';
import { useTabNavigation } from '../hooks/useTabNavigation';
import ConsentModal from '../components/ConsentModal';
import { isPublicCatalogItem } from '../utils/publicCatalog';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

export default function HomeScreen({ navigation }: Props) {
    const { currentProfile } = useProfile();
    const { addToMyList: addToMyListContext } = useMyList();
    const { navigateByLabel } = useTabNavigation();
    const { colors } = useTheme();

    const [contentSections, setContentSections] = useState<{ [key: string]: ContentItem[] }>({});
    const [featuredMovies, setFeaturedMovies] = useState<(MovieDetail | AnimeDetail)[]>([]);
    const [featuredItems, setFeaturedItems] = useState<ContentItem[]>([]); // Sección "Destacados"
    const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [startFromEpisodeId, setStartFromEpisodeId] = useState<number | null>(null);
    const [startFromTimeSeconds, setStartFromTimeSeconds] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [blackHeader, setBlackHeader] = useState(false);
    const [contentFilter, setContentFilter] = useState<'all' | 'movies' | 'series' | 'anime'>('anime');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const scrollViewRef = useRef<ScrollView>(null);
    const { height: screenHeight } = Dimensions.get('window');

    // Fila dinámica de género destacado rotativo
    const [featuredGenreRow, setFeaturedGenreRow] = useState<{ title: string; items: ContentItem[] } | null>(null);

    const CATEGORY_LABELS: Record<string, string> = {
        airing: 'En emisión',
        finished: 'Finalizados',
        upcoming: 'Recomendados',
    };

    // Accent colors por sección para variedad visual
    const SECTION_ACCENTS: Record<string, string> = {
        airing: colors.primary,          // rojo
        featured: '#FFD700',             // dorado
        finished: '#00C853',             // verde
        upcoming: '#448AFF',             // azul
        genre: '#E040FB',                // violeta
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
        trailer_id: anime.trailer_id,
        trailer_site: anime.trailer_site,
        trailer_checked_at: anime.trailer_checked_at,
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
            trailer: anime.trailer_id ? { id: anime.trailer_id, site: anime.trailer_site || 'youtube' } : undefined,
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

        // Barajar aleatoriamente para que "Destacados" no sea idéntico a ninguna otra fila
        const shuffled = unique.sort(() => 0.5 - Math.random());

        return shuffled.slice(0, 28);
    };

    const homeMounted=useRef(true),homeLoaded=useRef(false),homeGeneration=useRef(0);
    useEffect(() => {
        homeMounted.current=true;
        const unsubscribe=catalogService.subscribeHome(()=>{if(homeMounted.current)void loadContent();});
        void loadContent();
        return()=>{homeMounted.current=false;homeGeneration.current++;unsubscribe();};
    }, []);

    const [refreshingSection, setRefreshingSection] = useState(false);
    const refreshSection = async () => { setRefreshingSection(true); try { await loadContent(true); } finally { setRefreshingSection(false); } };
    const loadContent = async (force = false) => {
        const generation=++homeGeneration.current;
        const active=()=>homeMounted.current&&generation===homeGeneration.current;
        try {
            if(!homeLoaded.current)setLoading(true);
            setLoadError(false);
            const sections = await catalogService.getHomeSections(force);
            if(!active())return;
            homeLoaded.current=true;

            const newContentSections: { [key: string]: ContentItem[] } = {
                airing: sections.airing.map(mapCatalogAnimeToContentItem),
                finished: sections.finished.map(mapCatalogAnimeToContentItem),
                upcoming: sections.upcoming.map(mapCatalogAnimeToContentItem),
            };

            if (sections.featuredGenre && sections.featuredGenre.items?.length > 0) {
                setFeaturedGenreRow({
                    title: sections.featuredGenre.title,
                    items: sections.featuredGenre.items.map(mapCatalogAnimeToContentItem),
                });
            } else {
                setFeaturedGenreRow(null);
            }

            const featuredBase = newContentSections.airing.length
                ? sections.airing
                : (sections.finished.length ? sections.finished : sections.upcoming);

            // Barajar aleatoriamente para que siempre sean diferentes
            const shuffledFeatured = [...featuredBase].sort(() => 0.5 - Math.random());
            setFeaturedMovies(prioritizeFeaturedArtwork(shuffledFeatured).slice(0, 5).map(mapCatalogAnimeToAnimeDetail));

            // Construir sección Destacados
            const featured = buildFeaturedItems(
                newContentSections.airing,
                newContentSections.finished,
                newContentSections.upcoming
            );
            setFeaturedItems(featured);
            const featuredIds = new Set(featured.map(item => item.id));
            for (const key of Object.keys(newContentSections)) {
                const uniqueSection = newContentSections[key].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
                const withoutFeatured = uniqueSection.filter(item => !featuredIds.has(item.id));
                newContentSections[key] = withoutFeatured.length >= 28 ? withoutFeatured : uniqueSection;
            }
            setContentSections(newContentSections);
        } catch (error) {
            if(!active())return;
            if(!homeLoaded.current){setLoadError(true);Alert.alert('Error', 'No se pudo cargar el contenido. Por favor, intente de nuevo más tarde.');}
        } finally {
            if(active())setLoading(false);
        }
    };

    const addToMyList = async (contentId: number) => {
        if (!currentProfile) {
            Alert.alert('Error', 'No hay un perfil seleccionado.');
            return;
        }
        try {
            await addToMyListContext(contentId, 'anime');
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
        const { contentOffset } = event.nativeEvent;
        setBlackHeader(contentOffset.y > 10);
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
        return byType.filter(isPublicCatalogItem);
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Loader />
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
        <View style={[styles.container, { backgroundColor: colors.background }]}>
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
                refreshControl={<RefreshControl refreshing={refreshingSection} onRefresh={refreshSection} />}
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

                    {/* Sección: Recomendados (rating / destacados) */}
                    {shouldShowCategory('upcoming') &&
                        contentSections.upcoming?.length > 0 &&
                        filterContent(contentSections.upcoming).length > 0 && (
                            <MovieRow
                                key="upcoming"
                                title="Recomendados"
                                accentColor={SECTION_ACCENTS.upcoming}
                                movies={filterContent(contentSections.upcoming)}
                                onMoviePress={(id) => {
                                    const item = contentSections.upcoming.find(i => i.id === id);
                                    if (item) handleContentNavigation(item);
                                }}
                            />
                        )}

                    {/* Sección: Género destacado rotativo (varía en cada actualización) */}
                    {featuredGenreRow &&
                        featuredGenreRow.items?.length > 0 &&
                        filterContent(featuredGenreRow.items).length > 0 && (
                            <MovieRow
                                key="featured_genre"
                                title={featuredGenreRow.title}
                                accentColor={SECTION_ACCENTS.genre || '#E040FB'}
                                movies={filterContent(featuredGenreRow.items)}
                                onMoviePress={(id) => {
                                    const item = featuredGenreRow.items.find(i => i.id === id);
                                    if (item) handleContentNavigation(item);
                                }}
                            />
                        )}

                    {/* Empty state */}
                    {!hasAnyContent && (
                        <View style={styles.emptyState}>
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>{loadError ? "No pudimos cargar el catálogo" : "Aún no hay anime disponible"}</Text>
                            <Text style={[styles.emptySubtitle, { color: colors.textMuted || 'rgba(255,255,255,0.5)' }]}>{loadError ? "Comprueba tu conexión o vuelve a intentarlo en unos momentos." : "Agrega contenido desde el panel de administrador."}</Text>
                            {loadError && <Pressable accessibilityRole="button" onPress={() => loadContent(true)}><Text style={{ color: colors.primary, marginTop: 16 }}>Reintentar</Text></Pressable>}
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
    },
    emptyState: {
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 6,
    },
    emptySubtitle: {
        fontSize: 14,
    },
});
