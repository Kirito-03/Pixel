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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminApiService } from '../../services/adminApiService';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../types/navigation';
import { AdminShell } from '../../components/admin/AdminShell';
import { adminColors } from '../../theme';

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;

export default function AnimeListScreen() {
    const navigation = useNavigation<NavigationProp>();
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
                hovered && styles.rowHovered
            ]}
            onPress={() => navigation.navigate('EpisodeManager', { animeId: item.id, animeTitle: item.title })}
        >
            <View style={styles.thumbWrap}>
                {item.poster_url ? (
                    <Image source={{ uri: item.poster_url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                    <View style={styles.thumbFallback}>
                        <Ionicons name="image-outline" size={18} color="#666666" />
                    </View>
                )}
            </View>

            <View style={styles.main}>
                <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>#{item.id} - {item.title}</Text>
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

            <View style={styles.actionGroup}>
                <TouchableOpacity
                    style={[styles.actionPill, styles.actionPrimary]}
                    onPress={() => {
                        navigation.navigate('EpisodeManager', { animeId: item.id, animeTitle: item.title });
                    }}
                >
                    <Ionicons name="albums-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.actionPrimaryText}>Episodios</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => {
                        navigation.navigate('AnimeForm', { mode: 'edit', animeId: item.id });
                    }}
                >
                    <Ionicons name="pencil" size={18} color={adminColors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => {
                        openDetails(item);
                    }}
                >
                    <Ionicons name="eye-outline" size={18} color={adminColors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => {
                        confirmDelete(item);
                    }}
                >
                    <Ionicons name="trash-outline" size={18} color={adminColors.primary} />
                </TouchableOpacity>
            </View>
        </Pressable>
    );

    return (
        <AdminShell activeKey="anime">
            <SafeAreaView style={styles.container} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {Platform.OS !== 'web' && (
                            <TouchableOpacity
                                onPress={() => navigation.goBack()}
                                style={styles.backButton}
                            >
                                <Ionicons name="arrow-back" size={24} color={adminColors.text} />
                            </TouchableOpacity>
                        )}
                        <Text style={styles.headerTitle}>Biblioteca de Anime</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => navigation.navigate('AnimeForm', { mode: 'create' })}
                    >
                        <Ionicons name="add" size={20} color="#FFFFFF" />
                        <Text style={styles.addButtonText}>Nuevo Anime</Text>
                    </TouchableOpacity>
                </View>

                {/* Search */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={adminColors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar anime..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor={adminColors.textSecondary}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
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

                {/* List */}
                {isLoading && page === 1 ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={adminColors.primary} />
                    </View>
                ) : animeList.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <Ionicons name="film-outline" size={64} color={adminColors.textSecondary} />
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
                        contentContainerStyle={styles.listContent}
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
                                                <Ionicons name="image-outline" size={18} color="#666666" />
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
                                        style={[styles.actionPill, styles.actionPrimary, styles.modalActionPrimary]}
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
                                        style={[styles.actionPill, styles.modalActionSecondary]}
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
        case 'Airing': return { backgroundColor: 'rgba(46, 204, 113, 0.15)' };
        case 'Finished': return { backgroundColor: 'rgba(52, 152, 219, 0.15)' };
        case 'Upcoming': return { backgroundColor: 'rgba(241, 196, 15, 0.15)' };
        default: return { backgroundColor: 'rgba(25, 23, 27, 0.08)' };
    }
}

function getStatusTextStyle(status: string) {
    switch (status) {
        case 'Airing': return { color: '#2ecc71' };
        case 'Finished': return { color: '#3498db' };
        case 'Upcoming': return { color: '#f1c40f' };
        default: return { color: adminColors.textSecondary };
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminColors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
        paddingBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: adminColors.text,
        letterSpacing: -0.5,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    addButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.surface,
        marginHorizontal: 24,
        marginBottom: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: adminColors.text,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 15,
        color: adminColors.textSecondary,
        marginTop: 16,
        textAlign: 'center',
    },
    emptyButton: {
        marginTop: 24,
        backgroundColor: adminColors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    emptyButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        gap: 10,
    },
    filtersRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    filterChip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
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
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.surface,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    rowHovered: {
        borderColor: 'rgba(117, 2, 15, 0.20)',
        backgroundColor: 'rgba(117, 2, 15, 0.06)',
        transform: [{ translateY: -2 }],
    },
    thumbWrap: {
        width: 44,
        height: 64,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        marginRight: 12,
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
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
    },
    title: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: adminColors.text,
        letterSpacing: -0.2,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
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
        gap: 8,
    },
    metaText: {
        fontSize: 13,
        color: adminColors.textSecondary,
    },
    metaMuted: {
        fontSize: 13,
        color: adminColors.textSecondary,
    },
    metaDot: {
        color: 'rgba(25, 23, 27, 0.25)',
        fontSize: 12,
        marginHorizontal: 2,
    },
    actionGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
    },
    actionPrimary: {
        backgroundColor: adminColors.primary,
        borderColor: adminColors.primary,
    },
    actionPrimaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    iconButton: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    emptyTitle: {
        fontSize: 16,
        color: adminColors.text,
        fontWeight: '700',
        marginTop: 16,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.82)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalCard: {
        width: '100%',
        maxWidth: 820,
        backgroundColor: adminColors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
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
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    banner: {
        width: '100%',
        height: 160,
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
        width: 92,
        height: 130,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    detailThumb: {
        width: '100%',
        height: '100%',
    },
    detailMain: {
        flex: 1,
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
        borderWidth: 1,
        borderColor: adminColors.border,
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
        marginTop: 14,
        flexWrap: 'wrap',
    },
    modalActionPrimary: {
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    modalActionSecondary: {
        backgroundColor: adminColors.ink,
        borderColor: adminColors.ink,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    modalActionSecondaryText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
});
