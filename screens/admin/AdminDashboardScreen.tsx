import { useAdminLayout } from '../../hooks/useAdminLayout';
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Pressable,
    ActivityIndicator,
    RefreshControl,
    useWindowDimensions,
    Modal,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAdmin } from '../../contexts/AdminContext';
import { adminApiService } from '../../services/adminApiService';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../types/navigation';
import { AdminShell } from '../../components/admin/AdminShell';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { adminColors } from '../../theme';

interface DashboardStats {
    totalAnime: number;
    totalEpisodes: number;
    totalNews?: number;
    storageStats: Array<{
        storage_type: string;
        count: number;
    }>;
    recentAnime: any[];
}

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminDashboardScreen() {
    const { adminUser } = useAdmin();
    const navigation = useNavigation<NavigationProp>();
    const { width, isWide, isCompact } = useAdminLayout();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
    const [driveModalVisible, setDriveModalVisible] = useState(false);
    const [driveInventory, setDriveInventory] = useState<any>(null);
    const [loadingDrive, setLoadingDrive] = useState(false);

    const openDriveInventory = async () => {
        setDriveModalVisible(true);
        try {
            setLoadingDrive(true);
            const data = await adminApiService.getDriveInventory();
            setDriveInventory(data);
        } catch (err) {
            console.error('Error fetching drive inventory:', err);
        } finally {
            setLoadingDrive(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setIsLoading(true);
            setLoadError('');
            const data = await adminApiService.getDashboardStats();
            setStats(data);
            setLastUpdatedAt(Date.now());
        } catch (error) {
            setLoadError('No pudimos cargar el resumen. Pulsa actualizar para reintentar.');
            console.error('Error loading stats:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        loadStats();
    };

    const handleGoBack = () => {
        navigation.getParent()?.goBack();
    };

    const displayName = adminUser?.name || adminUser?.email?.split('@')[0] || 'Admin';
    const avatarInitial = displayName.charAt(0).toUpperCase() || 'A';
    const lastUpdatedText = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : '—';

    const formatAgo = (value?: string | number | Date) => {
        if (!value) return '';
        const ts = new Date(value).getTime();
        if (!Number.isFinite(ts)) return '';
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'Ahora';
        if (m < 60) return `Hace ${m} min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `Hace ${h} h`;
        const d = Math.floor(h / 24);
        return `Hace ${d} d`;
    };

    const activityItems = (stats?.recentAnime || [])
        .slice(0, 8)
        .map((a: any) => ({
            id: a.id,
            title: a.title,
            meta: `${a.total_episodes || 0} episodios`,
            time: formatAgo(a.created_at),
        }));

    return (
        <AdminShell activeKey="dashboard">
            <SafeAreaView style={styles.container} edges={['top']}>
                <AdminHeader
                    title="Dashboard"
                    subtitle={`Actualizado: ${lastUpdatedText}`}
                    onBack={handleGoBack}
                    rightSlot={
                        <>
                            <TouchableOpacity
                                onPress={loadStats}
                                style={styles.headerIconBtn}
                                disabled={isLoading || refreshing}
                                accessibilityLabel="Actualizar estadísticas"
                            >
                                <Ionicons name="refresh" size={20} color={adminColors.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleGoBack}
                                style={styles.headerIconBtn}
                                accessibilityLabel="Salir del panel"
                            >
                                <Ionicons name="exit-outline" size={20} color={adminColors.secondary} />
                            </TouchableOpacity>
                        </>
                    }
                />

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
                >
                    <View style={styles.pageInner}>
                        {adminUser && (
                            <View style={styles.userStrip}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>{avatarInitial}</Text>
                                </View>
                                <View style={styles.userText}>
                                    <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                                    <Text style={styles.userEmail} numberOfLines={1}>{adminUser.email}</Text>
                                </View>
                                <View style={styles.rolePill}>
                                    <Text style={styles.rolePillText}>ADMIN</Text>
                                </View>
                            </View>
                        )}

                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={adminColors.primary} />
                            </View>
                        ) : (
                            <>
                                {/* Resumen / Métricas */}
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Resumen</Text>
                                    {loadError ? <Text accessibilityRole="alert" style={{ color: adminColors.primary, paddingVertical: 12 }}>{loadError}</Text> : null}
                                    <View style={[styles.statsGrid, !stats && { display: 'none' }]}>
                                        <StatTile title="Anime" value={stats?.totalAnime || 0} icon="film-outline" compact={isCompact} />
                                        <StatTile title="Episodios" value={stats?.totalEpisodes || 0} icon="play-circle-outline" compact={isCompact} />
                                        {typeof stats?.totalNews === 'number' && <StatTile title="Noticias" value={stats.totalNews} icon="newspaper-outline" compact={isCompact} />}
                                        <StatTile 
                                            title="Episodios en Drive" 
                                            value={(stats?.storageStats || []).filter(item => item.storage_type === 'gdrive').reduce((total, item) => total + Number(item.count || 0), 0)} 
                                            icon="cloud-outline" 
                                            compact={isCompact} 
                                            onPress={openDriveInventory}
                                        />

                                    </View>
                                </View>

                                {/* Contenido principal */}
                                <View style={[styles.mainGrid, isWide && styles.mainGridWide]}>
                                    <View style={styles.col}>
                                        <Text style={styles.sectionTitle}>Acciones rápidas</Text>
                                        <View style={styles.surfaceList}>
                                            <QuickAction
                                                title="Nuevo anime"
                                                subtitle="Crear ficha y metadata"
                                                icon="add-circle-outline"
                                                onPress={() => navigation.navigate('AnimeForm', { mode: 'create' })}
                                                primary
                                            />
                                            <QuickAction
                                                title="Gestionar catálogo"
                                                subtitle="Lista, edición y episodios"
                                                icon="film-outline"
                                                onPress={() => navigation.navigate('AnimeList' as never)}
                                            />
                                            <QuickAction
                                                title="Importar fuentes"
                                                subtitle="Analizar y seleccionar listas M3U"
                                                icon="cloud-download-outline"
                                                onPress={() => navigation.navigate('AdminImport' as never)}
                                            />
                                            <QuickAction
                                                title="Bot Inteligente"
                                                subtitle="Scraping de episodios y metadata"
                                                icon="hardware-chip-outline"
                                                onPress={() => navigation.navigate('AdminBot' as never)}
                                            />
                                            <QuickAction
                                                title="Actualizar noticias"
                                                subtitle="Refrescar caché de NewsAPI"
                                                icon="refresh-outline"
                                                onPress={async () => {
                                                    try {
                                                        await adminApiService.refreshNews();
                                                        loadStats();
                                                    } catch (e) {
                                                        console.error('Error refreshing news:', e);
                                                    }
                                                }}
                                            />
                                            <QuickAction
                                                title="Google Drive (5TB)"
                                                subtitle="Inventario Anime, Manga y Hentai VIP"
                                                icon="cloud-done-outline"
                                                onPress={openDriveInventory}
                                                isLast
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.col}>
                                        <View style={styles.sectionHeaderRow}>
                                            <Text style={styles.sectionTitle}>Actividad reciente</Text>
                                            <TouchableOpacity
                                                onPress={() => navigation.navigate('AnimeList' as never)}
                                                style={styles.linkBtn}
                                            >
                                                <Text style={styles.linkText}>Ver catálogo</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={styles.surfaceList}>
                                            {activityItems.length ? (
                                                activityItems.map((item, idx) => (
                                                    <Pressable
                                                        key={item.id}
                                                        onPress={() => navigation.navigate('EpisodeManager', { animeId: item.id })}
                                                        style={(state: any) => [
                                                            styles.listRow,
                                                            idx > 0 && styles.listRowDivider,
                                                            state.hovered && styles.hovered,
                                                            state.pressed && styles.pressed,
                                                        ]}
                                                    >
                                                        <View style={styles.rowMain}>
                                                            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                                                            <Text style={styles.rowSub} numberOfLines={1}>{item.meta}</Text>
                                                        </View>
                                                        <View style={styles.activityMeta}>
                                                            {!!item.time && <Text style={styles.activityTime}>{item.time}</Text>}
                                                            <Ionicons name="chevron-forward" size={16} color={adminColors.textSecondary} />
                                                        </View>
                                                    </Pressable>
                                                ))
                                            ) : (
                                                <Text style={styles.emptyText}>Sin actividad reciente</Text>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* Modal de Inventario Google Drive */}
            <Modal
                visible={driveModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setDriveModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, isWide && { maxWidth: 640 }]}>
                        <View style={styles.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="cloud-done" size={22} color="#2e7d32" />
                                <Text style={styles.modalTitle}>Google Drive (5TB) - Inventario</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDriveModalVisible(false)} style={styles.modalCloseBtn}>
                                <Ionicons name="close" size={20} color={adminColors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {loadingDrive ? (
                            <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                                <ActivityIndicator size="large" color={adminColors.primary} />
                                <Text style={{ color: adminColors.textSecondary, marginTop: 12 }}>Consultando inventario en Google Drive...</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ maxHeight: 460, paddingHorizontal: 16 }}>
                                {/* Resumen */}
                                <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
                                    <View style={[styles.miniStat, { backgroundColor: 'rgba(25, 118, 210, 0.1)', borderColor: '#1976d2' }]}>
                                        <Text style={[styles.miniStatNum, { color: '#42a5f5' }]}>{driveInventory?.summary?.totalAnimeEpisodes || 0}</Text>
                                        <Text style={styles.miniStatLabel}>Anime (Eps)</Text>
                                    </View>
                                    <View style={[styles.miniStat, { backgroundColor: 'rgba(123, 31, 162, 0.1)', borderColor: '#7b1fa2' }]}>
                                        <Text style={[styles.miniStatNum, { color: '#ba68c8' }]}>{driveInventory?.summary?.totalMangaChapters || 0}</Text>
                                        <Text style={styles.miniStatLabel}>Manga (Caps)</Text>
                                    </View>
                                    <View style={[styles.miniStat, { backgroundColor: 'rgba(194, 24, 91, 0.1)', borderColor: '#c2185b' }]}>
                                        <Text style={[styles.miniStatNum, { color: '#f06292' }]}>{driveInventory?.summary?.totalHentaiEpisodes || 0}</Text>
                                        <Text style={styles.miniStatLabel}>Hentai (Eps)</Text>
                                    </View>
                                </View>

                                {/* Anime */}
                                <Text style={styles.invSectionTitle}>Anime en Drive</Text>
                                {(driveInventory?.anime || []).length ? (
                                    driveInventory.anime.map((a: any) => (
                                        <View key={`a-${a.episode_id}`} style={styles.invRow}>
                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                <Text style={styles.invRowTitle} numberOfLines={1}>{a.title}</Text>
                                                <Text style={styles.invRowSub}>Episodio {a.episode_number} • {a.file_size ? `${(a.file_size / (1024 * 1024)).toFixed(1)} MB` : 'VIP'}</Text>
                                            </View>
                                            <TouchableOpacity 
                                                style={styles.invStreamBtn}
                                                onPress={() => a.stream_url && Linking.openURL(a.stream_url)}
                                            >
                                                <Text style={styles.invStreamBtnText}>Ver Stream</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.invEmpty}>No hay episodios de anime en Drive.</Text>
                                )}

                                {/* Manga */}
                                <Text style={styles.invSectionTitle}>Manga en Drive</Text>
                                {(driveInventory?.manga || []).length ? (
                                    driveInventory.manga.map((m: any, idx: number) => {
                                        const match = (m.chapter_url || '').match(/manga\/([^/]+)\/([^/]+)/);
                                        const title = match ? match[1].replace(/-/g, ' ') : 'Manga';
                                        const cap = match ? match[2].replace(/-/g, ' ') : 'Capítulo';
                                        return (
                                            <View key={`m-${idx}`} style={styles.invRow}>
                                                <View style={{ flex: 1, paddingRight: 8 }}>
                                                    <Text style={styles.invRowTitle} numberOfLines={1}>{title}</Text>
                                                    <Text style={styles.invRowSub}>{cap} • {m.page_count || 0} páginas</Text>
                                                </View>
                                                <TouchableOpacity 
                                                    style={styles.invStreamBtn}
                                                    onPress={() => m.chapter_url && Linking.openURL(m.chapter_url)}
                                                >
                                                    <Text style={styles.invStreamBtnText}>Abrir</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.invEmpty}>No hay capítulos de manga en Drive.</Text>
                                )}

                                {/* Hentai */}
                                <Text style={styles.invSectionTitle}>Hentai en Drive</Text>
                                {(driveInventory?.hentai || []).length ? (
                                    driveInventory.hentai.map((h: any) => (
                                        <View key={`h-${h.episode_id}`} style={styles.invRow}>
                                            <View style={{ flex: 1, paddingRight: 8 }}>
                                                <Text style={styles.invRowTitle} numberOfLines={1}>{h.title}</Text>
                                                <Text style={styles.invRowSub}>Episodio {h.episode_number} • VIP 720p</Text>
                                            </View>
                                            <TouchableOpacity 
                                                style={styles.invStreamBtn}
                                                onPress={() => h.stream_url && Linking.openURL(h.stream_url)}
                                            >
                                                <Text style={styles.invStreamBtnText}>Ver Stream</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.invEmpty}>No hay episodios Hentai en Drive.</Text>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </AdminShell>
    );
}

function StatTile({ title, value, icon, compact, onPress }: { title: string; value: number; icon: string; compact: boolean; onPress?: () => void }) {
    const tile = (
        <View style={[styles.statTile, compact && styles.statTileCompact]}>
            <View style={styles.statTop}>
                <Text style={styles.statValue}>{value}</Text>
                <Ionicons name={icon as any} size={18} color={adminColors.primary} />
            </View>
            <Text style={styles.statLabel} numberOfLines={1}>{title}</Text>
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, minWidth: compact ? '48%' : 150 }}>
                {tile}
            </TouchableOpacity>
        );
    }
    return tile;
}

function QuickAction({ title, subtitle, icon, onPress, primary, isLast }: any) {
    return (
        <Pressable
            onPress={onPress}
            style={(state: any) => [
                styles.actionRow,
                !isLast && styles.listRowDivider,
                primary && styles.actionRowPrimary,
                state.hovered && !primary && styles.hovered,
                state.pressed && styles.pressed,
            ]}
        >
            <View style={[styles.actionIconWrap, primary && styles.actionIconWrapPrimary]}>
                <Ionicons name={icon} size={20} color={primary ? '#FFFFFF' : adminColors.primary} />
            </View>
            <View style={styles.actionText}>
                <Text style={[styles.actionTitle, primary && styles.actionTitlePrimary]} numberOfLines={1}>{title}</Text>
                <Text style={[styles.actionSubtitle, primary && styles.actionSubtitlePrimary]} numberOfLines={1}>{subtitle}</Text>
            </View>
            <Ionicons
                name="chevron-forward"
                size={18}
                color={primary ? 'rgba(255, 255, 255, 0.85)' : adminColors.textSecondary}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminColors.background,
    },
    headerIconBtn: {
        width: 44,
        height: 44,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 36,
    },
    scrollContentCompact: {
        padding: 12,
        paddingBottom: 28,
    },
    pageInner: {
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
        gap: 20,
    },
    userStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 4,
        backgroundColor: adminColors.surface,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 4,
        backgroundColor: adminColors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    userText: {
        flex: 1,
        minWidth: 0,
    },
    userName: {
        fontSize: 14,
        fontWeight: '700',
        color: adminColors.text,
    },
    userEmail: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    rolePill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
    },
    rolePillText: {
        color: adminColors.primary,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    loadingContainer: {
        padding: 48,
        alignItems: 'center',
    },
    section: {
        gap: 10,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: adminColors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    linkBtn: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    linkText: {
        fontSize: 13,
        fontWeight: '700',
        color: adminColors.primary,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    statTile: {
        flex: 1,
        minWidth: 160,
        padding: 16,
        borderRadius: 4,
        backgroundColor: adminColors.surface,
    },
    statTileCompact: {
        minWidth: '46%',
    },
    statTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    statValue: {
        fontSize: 26,
        fontWeight: '800',
        color: adminColors.text,
    },
    statLabel: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '600',
        color: adminColors.textSecondary,
    },
    mainGrid: {
        gap: 20,
    },
    mainGridWide: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 20,
    },
    col: {
        flex: 1,
        minWidth: 0,
    },
    surfaceList: {
        backgroundColor: adminColors.surface,
        borderRadius: 4,
        overflow: 'hidden',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    actionRowPrimary: {
        backgroundColor: adminColors.primary,
    },
    actionIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionIconWrapPrimary: {
        backgroundColor: 'rgba(255, 255, 255, 0.16)',
    },
    actionText: {
        flex: 1,
        minWidth: 0,
    },
    actionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: adminColors.text,
    },
    actionTitlePrimary: {
        color: '#FFFFFF',
    },
    actionSubtitle: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    actionSubtitlePrimary: {
        color: 'rgba(255, 255, 255, 0.85)',
    },
    listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 54,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    listRowDivider: {
        borderTopWidth: 1,
        borderTopColor: adminColors.border,
    },
    rowMain: {
        flex: 1,
        minWidth: 0,
    },
    rowTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: adminColors.text,
    },
    rowSub: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    activityMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    activityTime: {
        fontSize: 11,
        fontWeight: '600',
        color: adminColors.textSecondary,
    },
    emptyText: {
        fontSize: 13,
        color: adminColors.textSecondary,
        padding: 16,
    },
    hovered: {
        backgroundColor: 'rgba(117, 2, 15, 0.04)',
    },
    pressed: {
        opacity: 0.85,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalBox: {
        width: '100%',
        backgroundColor: adminColors.surface,
        borderRadius: 12,
        paddingBottom: 20,
        borderWidth: 1,
        borderColor: adminColors.border,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: adminColors.text,
    },
    modalCloseBtn: {
        padding: 4,
    },
    miniStat: {
        flex: 1,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    miniStatNum: {
        fontSize: 18,
        fontWeight: '800',
    },
    miniStatLabel: {
        fontSize: 11,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    invSectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: adminColors.primary,
        marginTop: 14,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    invRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    invRowTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: adminColors.text,
    },
    invRowSub: {
        fontSize: 11,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    invStreamBtn: {
        backgroundColor: adminColors.primary,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 4,
    },
    invStreamBtnText: {
        fontSize: 11,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    invEmpty: {
        fontSize: 12,
        color: adminColors.textSecondary,
        fontStyle: 'italic',
        paddingVertical: 6,
    },
});
