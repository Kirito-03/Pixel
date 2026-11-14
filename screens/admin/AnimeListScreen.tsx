import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    RefreshControl,
    Platform,
    Pressable,
    Image,
    Modal,
    Alert,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminApiService } from '../../services/adminApiService';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../types/navigation';
import { AdminShell } from '../../components/admin/AdminShell';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { adminColors } from '../../theme';

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;

export default function AnimeListScreen() {
    const navigation = useNavigation<NavigationProp>();
    const { width } = useWindowDimensions();
    const isNarrow = width < 640;
    const isCompact = width < 480;

    const [animeList, setAnimeList] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Airing' | 'Finished' | 'Upcoming'>('all');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedAnime, setSelectedAnime] = useState<any | null>(null);
    const [detailsVisible, setDetailsVisible] = useState(false);

    useEffect(() => {
        resetAndLoad();
    }, [searchQuery, statusFilter]);

    const resetAndLoad = () => {
        setPage(1);
        setHasMore(true);
        loadAnime(true);
    };

    const loadAnime = async (isRefreshing = false) => {
        if (isLoading) return;

        const currentPage = isRefreshing ? 1 : page;
        if (!isRefreshing && !hasMore) return;

        setIsLoading(true);
        if (isRefreshing) setRefreshing(true);

        try {
            const data = await adminApiService.getAnimeList({
                page: currentPage,
                limit: 25,
                search: searchQuery || undefined,
                status: statusFilter === 'all' ? undefined : statusFilter,
            });

            const newAnimes = data?.data || data?.anime || [];

            if (isRefreshing) {
                setAnimeList(newAnimes);
            } else {
                setAnimeList(prevList => [...prevList, ...newAnimes]);
            }

            setPage(currentPage + 1);
            const totalPages = data?.pagination?.totalPages;
            if (typeof totalPages === 'number') {
                setHasMore(currentPage < totalPages);
            } else {
                setHasMore(newAnimes.length > 0);
            }
        } catch (error) {
            console.error('Error loading anime:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => loadAnime(true);
    const handleLoadMore = () => {
        if (!isLoading && hasMore) loadAnime();
    };

    const renderFooter = () => {
        if (!isLoading || refreshing) return null;
        return <ActivityIndicator style={{ marginVertical: 20 }} size="large" color={adminColors.primary} />;
    };

    const openDetails = (item: any) => {
        setSelectedAnime(item);
        setDetailsVisible(true);
    };

    const confirmDelete = (item: any) => {
        const runDelete = async () => {
            try {
                await adminApiService.deleteAnime(item.id);
                resetAndLoad();
            } catch (e: any) {
                const backendMsg = e?.response?.data?.message;
                const msg = backendMsg || e?.message || 'No se pudo eliminar';
                if (Platform.OS === 'web') {
                    (globalThis as any)?.alert?.(msg);
                } else {
                    Alert.alert('Error', msg);
                }
            }
        };

        if (Platform.OS === 'web') {
            const ok = (globalThis as any)?.confirm?.(`¿Eliminar "${item.title}"?`);
            if (ok) runDelete();
            return;
        }

        Alert.alert(
            'Eliminar anime',
            `¿Eliminar "${item.title}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: runDelete }
            ]
        );
    };

    const formatCreatedAt = (value?: string) => {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString();
    };

    const formatGenres = (genres: any) => {
        if (!genres) return '';
        if (Array.isArray(genres)) return genres.filter(Boolean).slice(0, 3).join(' • ');
        if (typeof genres === 'string') return genres;
        return '';
    };

    const getEpisodeLabel = (item: any) => {
        const uploaded = typeof item.episode_count === 'number' ? item.episode_count : undefined;
        const planned = typeof item.total_episodes === 'number' ? item.total_episodes : (item.total_episodes ? Number(item.total_episodes) : 0);
        if (typeof uploaded === 'number') {
            if (uploaded === 0) return 'Sin episodios';
            if (planned > 0) return `${uploaded}/${planned} episodios`;
            return `${uploaded} episodios`;
        }
        return `${planned || 0} episodios`;
    };

    const renderAnimeItem = ({ item }: any) => (
        <Pressable
            style={({ hovered }: any) => [
                styles.row,
                isNarrow && styles.rowStacked,
                hovered && styles.rowHovered,
            ]}
            onPress={() => navigation.navigate('EpisodeManager', { animeId: item.id, animeTitle: item.title })}
        >
            <View style={styles.rowTop}>
                <View style={styles.thumbWrap}>
                    {item.poster_url ? (
                        <Image source={{ uri: item.poster_url }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                        <View style={styles.thumbFallback}>
                            <Ionicons name="image-outline" size={18} color={adminColors.textSecondary} />
                        </View>
                    )}
                </View>

                <View style={styles.main}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title} numberOfLines={1}>#{item.id} · {item.title}</Text>
                        <View style={[styles.badge, getStatusBadgeStyle(item.status)]}>
                            <Text style={[styles.badgeText, getStatusTextStyle(item.status)]}>{item.status || 'Unknown'}</Text>
                        </View>
                    </View>
                    <View style={styles.metaRow}>
                        <Text style={styles.metaText} numberOfLines={1}>{getEpisodeLabel(item)}</Text>
                        {!!formatGenres(item.genres) && <Text style={styles.metaDot}>•</Text>}
                        {!!formatGenres(item.genres) && <Text style={styles.metaText} numberOfLines={1}>{formatGenres(item.genres)}</Text>}
                        {!!item.created_at && <Text style={styles.metaDot}>•</Text>}
                        {!!item.created_at && <Text style={styles.metaMuted} numberOfLines={1}>{formatCreatedAt(item.created_at)}</Text>}
                    </View>
                </View>
            </View>

            <View style={[styles.actionGroup, isNarrow && styles.actionGroupStacked]}>
                <TouchableOpacity
                    style={[styles.actionPill, styles.actionPrimary]}
                    onPress={() => navigation.navigate('EpisodeManager', { animeId: item.id, animeTitle: item.title })}
                >
                    <Ionicons name="albums-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.actionPrimaryText}>Episodios</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => navigation.navigate('AnimeForm', { mode: 'edit', animeId: item.id })}
                    accessibilityLabel="Editar anime"
                >
                    <Ionicons name="pencil" size={18} color={adminColors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => openDetails(item)}
                    accessibilityLabel="Ver detalle"
                >
                    <Ionicons name="eye-outline" size={18} color={adminColors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => confirmDelete(item)}
                    accessibilityLabel="Eliminar anime"
                >
                    <Ionicons name="trash-outline" size={18} color={adminColors.primary} />
                </TouchableOpacity>
            </View>
        </Pressable>
    );

    return (
        <AdminShell activeKey="anime">
            <SafeAreaView style={styles.container} edges={['top']}>
                <AdminHeader
                    title="Catálogo"
                    subtitle="Gestiona series, fichas y episodios"
                    onBack={() => navigation.goBack()}
                    rightSlot={
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => navigation.navigate('AnimeForm', { mode: 'create' })}
                        >
                            <Ionicons name="add" size={18} color="#FFFFFF" />
                            <Text style={styles.addButtonText}>Nuevo</Text>
                        </TouchableOpacity>
                    }
                />

                {/* Controles de búsqueda y filtro */}
                <View style={[styles.controlsWrap, isCompact && styles.controlsWrapCompact]}>
                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={18} color={adminColors.textSecondary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar anime por título..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholderTextColor={adminColors.textSecondary}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                                <Ionicons name="close-circle" size={20} color={adminColors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.filtersRow}>
                        {(
                            [
                                { key: 'all', label: 'Todos' },
                                { key: 'Airing', label: 'Airing' },
                                { key: 'Finished', label: 'Finished' },
                                { key: 'Upcoming', label: 'Upcoming' },
                            ] as const
                        ).map((f) => (
                            <TouchableOpacity
                                key={f.key}
                                style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                                onPress={() => setStatusFilter(f.key)}
                            >
                                <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* List */}
                {isLoading && page === 1 ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={adminColors.primary} />
                    </View>
                ) : animeList.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <Ionicons name="film-outline" size={52} color={adminColors.textSecondary} />
                        <Text style={styles.emptyTitle}>
                            {searchQuery || statusFilter !== 'all' ? 'No se encontraron resultados' : 'No hay animes registrados todavía'}
                        </Text>
                        <Text style={styles.emptyText}>
                            {searchQuery || statusFilter !== 'all'
                                ? 'Prueba con otro título o ajusta los filtros.'
                                : 'Crea tu primer anime para empezar a gestionar episodios.'}
                        </Text>
                        {!searchQuery && statusFilter === 'all' && (
                            <TouchableOpacity
                                style={styles.emptyButton}
                                onPress={() => navigation.navigate('AnimeForm', { mode: 'create' })}
                            >
                                <Text style={styles.emptyButtonText}>Agregar Anime</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <FlatList
                        data={animeList}
                        renderItem={renderAnimeItem}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={[styles.listContent, isCompact && styles.listContentCompact]}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={handleRefresh}
                                tintColor={adminColors.primary}
                                colors={[adminColors.primary]}
                            />
                        }
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={renderFooter}
                    />
                )}

                <Modal visible={detailsVisible} transparent animationType="fade" onRequestClose={() => setDetailsVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle} numberOfLines={1}>{selectedAnime?.title || 'Detalle'}</Text>
                                <TouchableOpacity onPress={() => setDetailsVisible(false)} style={styles.modalClose}>
                                    <Ionicons name="close" size={22} color={adminColors.text} />
                                </TouchableOpacity>
                            </View>

                            {!!selectedAnime?.banner_url && (
                                <Image source={{ uri: selectedAnime.banner_url }} style={styles.banner} resizeMode="cover" />
                            )}

                            <View style={styles.modalBody}>
                                <View style={styles.detailRow}>
                                    <View style={styles.detailThumbWrap}>
                                        {selectedAnime?.poster_url ? (
                                            <Image source={{ uri: selectedAnime.poster_url }} style={styles.detailThumb} resizeMode="cover" />
                                        ) : (
                                            <View style={styles.thumbFallback}>
                                                <Ionicons name="image-outline" size={18} color={adminColors.textSecondary} />
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.detailMain}>
                                        <View style={styles.detailBadges}>
                                            <View style={[styles.badge, getStatusBadgeStyle(selectedAnime?.status)]}>
                                                <Text style={[styles.badgeText, getStatusTextStyle(selectedAnime?.status)]}>
                                                    {selectedAnime?.status || 'Unknown'}
                                                </Text>
                                            </View>
                                            <View style={styles.softBadge}>
                                                <Text style={styles.softBadgeText}>{getEpisodeLabel(selectedAnime || {})}</Text>
                                            </View>
                                        </View>
                                        {!!formatGenres(selectedAnime?.genres) && (
                                            <Text style={styles.detailMeta} numberOfLines={2}>{formatGenres(selectedAnime?.genres)}</Text>
                                        )}
                                        {!!selectedAnime?.created_at && (
                                            <Text style={styles.detailMetaMuted} numberOfLines={1}>Creado: {formatCreatedAt(selectedAnime.created_at)}</Text>
                                        )}
                                    </View>
                                </View>

                                {!!selectedAnime?.description && (
                                    <Text style={styles.detailDesc} numberOfLines={6}>{selectedAnime.description}</Text>
                                )}

                                <View style={styles.modalActions}>
                                    <TouchableOpacity
                                        style={[styles.actionPill, styles.actionPrimary, styles.modalActionBtn]}
                                        onPress={() => {
                                            const a = selectedAnime;
                                            setDetailsVisible(false);
                                            if (a?.id) navigation.navigate('EpisodeManager', { animeId: a.id, animeTitle: a.title });
                                        }}
                                    >
                                        <Ionicons name="albums-outline" size={16} color="#FFFFFF" />
                                        <Text style={styles.actionPrimaryText}>Gestionar episodios</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.actionPill, styles.modalActionSecondary, styles.modalActionBtn]}
                                        onPress={() => {
                                            const a = selectedAnime;
                                            setDetailsVisible(false);
                                            if (a?.id) navigation.navigate('AnimeForm', { mode: 'edit', animeId: a.id });
                                        }}
                                    >
                                        <Ionicons name="pencil" size={16} color="#FFFFFF" />
                                        <Text style={styles.modalActionSecondaryText}>Editar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        </AdminShell>
    );
}

function getStatusBadgeStyle(status: string) {
    switch (status) {
        case 'Airing': return { backgroundColor: 'rgba(22, 163, 74, 0.12)' };
        case 'Finished': return { backgroundColor: 'rgba(37, 99, 235, 0.12)' };
        case 'Upcoming': return { backgroundColor: 'rgba(202, 138, 4, 0.14)' };
        default: return { backgroundColor: 'rgba(25, 23, 27, 0.08)' };
    }
}

function getStatusTextStyle(status: string) {
    switch (status) {
        case 'Airing': return { color: '#15803d' };
        case 'Finished': return { color: '#1d4ed8' };
        case 'Upcoming': return { color: '#a16207' };
        default: return { color: adminColors.textSecondary };
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminColors.background,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.primary,
        paddingHorizontal: 14,
        minHeight: 44,
        borderRadius: 4,
        gap: 6,
    },
    addButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },
    controlsWrap: {
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 10,
        gap: 10,
    },
    controlsWrapCompact: {
        paddingHorizontal: 12,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: adminColors.surface,
        paddingHorizontal: 14,
        minHeight: 46,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
        fontSize: 14,
        color: adminColors.text,
    },
    clearBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filtersRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterChip: {
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterChipActive: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        borderColor: adminColors.primary,
    },
    filterChipText: {
        color: adminColors.textSecondary,
        fontSize: 13,
        fontWeight: '600',
    },
    filterChipTextActive: {
        color: adminColors.primary,
        fontWeight: '700',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyTitle: {
        fontSize: 16,
        color: adminColors.text,
        fontWeight: '700',
        marginTop: 16,
        textAlign: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: adminColors.textSecondary,
        marginTop: 8,
        textAlign: 'center',
    },
    emptyButton: {
        marginTop: 20,
        backgroundColor: adminColors.primary,
        paddingHorizontal: 22,
        minHeight: 46,
        justifyContent: 'center',
        borderRadius: 4,
    },
    emptyButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    listContent: {
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 28,
        gap: 10,
    },
    listContentCompact: {
        paddingHorizontal: 12,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        backgroundColor: adminColors.surface,
        padding: 12,
        borderRadius: 4,
    },
    rowStacked: {
        flexDirection: 'column',
        alignItems: 'stretch',
    },
    rowHovered: {
        backgroundColor: 'rgba(117, 2, 15, 0.03)',
    },
    rowTop: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    thumbWrap: {
        width: 44,
        height: 62,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: adminColors.background,
        flexShrink: 0,
    },
    thumb: {
        width: '100%',
        height: '100%',
    },
    thumbFallback: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: adminColors.background,
    },
    main: {
        flex: 1,
        minWidth: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    title: {
        flex: 1,
        minWidth: 0,
        fontSize: 15,
        fontWeight: '700',
        color: adminColors.text,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    metaText: {
        fontSize: 12,
        color: adminColors.textSecondary,
    },
    metaMuted: {
        fontSize: 12,
        color: adminColors.textSecondary,
    },
    metaDot: {
        color: 'rgba(25, 23, 27, 0.25)',
        fontSize: 12,
    },
    actionGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    actionGroupStacked: {
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: adminColors.border,
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 4,
    },
    actionPrimary: {
        backgroundColor: adminColors.primary,
    },
    actionPrimaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.72)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalCard: {
        width: '100%',
        maxWidth: 720,
        backgroundColor: adminColors.surface,
        borderRadius: 4,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    modalTitle: {
        flex: 1,
        color: adminColors.text,
        fontSize: 16,
        fontWeight: '800',
        marginRight: 12,
    },
    modalClose: {
        width: 44,
        height: 44,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    banner: {
        width: '100%',
        height: 150,
        backgroundColor: adminColors.background,
    },
    modalBody: {
        padding: 16,
    },
    detailRow: {
        flexDirection: 'row',
        gap: 14,
        marginBottom: 12,
    },
    detailThumbWrap: {
        width: 84,
        height: 120,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: adminColors.background,
    },
    detailThumb: {
        width: '100%',
        height: '100%',
    },
    detailMain: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        gap: 8,
    },
    detailBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
    },
    softBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: adminColors.background,
    },
    softBadgeText: {
        color: adminColors.textSecondary,
        fontSize: 12,
        fontWeight: '700',
    },
    detailMeta: {
        color: adminColors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
    },
    detailMetaMuted: {
        color: adminColors.textSecondary,
        fontSize: 12,
    },
    detailDesc: {
        color: adminColors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 6,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
        flexWrap: 'wrap',
    },
    modalActionBtn: {
        paddingHorizontal: 16,
    },
    modalActionSecondary: {
        backgroundColor: adminColors.ink,
    },
    modalActionSecondaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
});
