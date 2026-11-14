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
                                        <StatTile title="Episodios en Drive" value={(stats?.storageStats || []).filter(item => item.storage_type === 'gdrive').reduce((total, item) => total + Number(item.count || 0), 0)} icon="cloud-outline" compact={isCompact} />

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
        </AdminShell>
    );
}

function StatTile({ title, value, icon, compact }: { title: string; value: number; icon: string; compact: boolean }) {
    return (
        <View style={[styles.statTile, compact && styles.statTileCompact]}>
            <View style={styles.statTop}>
                <Text style={styles.statValue}>{value}</Text>
                <Ionicons name={icon as any} size={18} color={adminColors.primary} />
            </View>
            <Text style={styles.statLabel} numberOfLines={1}>{title}</Text>
        </View>
    );
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
});
