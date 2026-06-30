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
    const { width } = useWindowDimensions();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setIsLoading(true);
            const data = await adminApiService.getDashboardStats();
            setStats(data);
            setLastUpdatedAt(Date.now());
        } catch (error) {
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

    const storageTotal =
        stats?.storageStats?.reduce((acc, s) => acc + (Number(s.count) || 0), 0) || 0;
    const displayName = adminUser?.name || adminUser?.email?.split('@')[0] || 'Admin';
    const avatarInitial = displayName.charAt(0).toUpperCase() || 'A';
    const lastUpdatedText = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : '—';
    const isWide = width >= 980;
    const isXWide = width >= 1280;

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
        .slice(0, 10)
        .map((a: any) => ({
            id: a.id,
            title: a.title,
            meta: `${(a.total_episodes || 0)} episodios`,
            time: formatAgo(a.created_at),
        }));

    const statItemStyle = isXWide ? styles.statCardQuarter : styles.statCardHalf;

    return (
        <AdminShell activeKey="dashboard">
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={adminColors.text} />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle}>Administrador</Text>
                    <Text style={styles.headerMeta}>Actualizado: {lastUpdatedText}</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={loadStats} style={styles.iconButton} disabled={isLoading || refreshing}>
                        <Ionicons name="refresh" size={20} color={adminColors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleGoBack} style={styles.iconButton}>
                        <Ionicons name="exit-outline" size={20} color={adminColors.secondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {adminUser && (
                    <View style={styles.topCard}>
                        <View style={styles.userRow}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{avatarInitial}</Text>
                            </View>
                            <View style={styles.userText}>
                                <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                                <Text style={styles.userEmail} numberOfLines={1}>{adminUser.email}</Text>
                            </View>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>ADMIN</Text>
                            </View>
                        </View>
                    </View>
                )}

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={adminColors.primary} />
                    </View>
                ) : (
                    <>
                        <View style={[styles.mainGrid, isWide && styles.mainGridWide]}>
                            <View style={styles.leftCol}>
                                <View style={styles.sectionTight}>
                                    <Text style={styles.sectionTitle}>Métricas</Text>
                                    <View style={styles.statsGrid}>
                                        <StatCard style={statItemStyle} title="Anime" value={stats?.totalAnime || 0} icon="film-outline" />
                                        <StatCard style={statItemStyle} title="Episodios" value={stats?.totalEpisodes || 0} icon="play-circle-outline" />
                                        <StatCard style={statItemStyle} title="Noticias" value={stats?.totalNews || 0} icon="newspaper-outline" />
                                        <StatCard style={statItemStyle} title="Storage (R2)" value={storageTotal} icon="cloud-outline" />
                                        <StatCard style={statItemStyle} title="Transcode" value={0} icon="pulse-outline" />
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Acciones</Text>
                                    <View style={styles.actionsGrid}>
                                        <QuickAction
                                            title="Gestionar anime"
                                            subtitle="Lista, edición y episodios"
                                            icon="list"
                                            onPress={() => navigation.navigate('AnimeList' as never)}
                                        />
                                        <QuickAction
                                            title="Nuevo anime"
                                            subtitle="Crear ficha y metadata"
                                            icon="add-circle"
                                            onPress={() => navigation.navigate('AnimeForm', { mode: 'create' })}
                                            primary
                                        />
                                        <QuickAction
                                            title="Actualizar noticias"
                                            subtitle="NewsAPI → cache"
                                            icon="refresh"
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
                                            title="Importar fuentes"
                                            subtitle="M3U/carpeta → catálogo"
                                            icon="cloud-download"
                                            onPress={() => navigation.navigate('AdminImport' as never)}
                                        />
                                    </View>
                                </View>
                            </View>

                            <View style={styles.rightCol}>
                                <View style={styles.sectionTight}>
                                    <Text style={styles.sectionTitle}>Actividad reciente</Text>
                                    <View style={styles.panelCard}>
                                        <View style={styles.panelHeader}>
                                            <Text style={styles.panelTitle}>Eventos</Text>
                                            <TouchableOpacity onPress={() => navigation.navigate('AnimeList' as never)}>
                                                <Text style={styles.panelLink}>Ver catálogo</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {activityItems.length ? (
                                            activityItems.map((item) => (
                                                <Pressable
                                                    key={item.id}
                                                    onPress={() => navigation.navigate('EpisodeManager', { animeId: item.id })}
                                                    style={(state: any) => [
                                                        styles.activityRow,
                                                        state.hovered && styles.hovered,
                                                        state.pressed && styles.pressed,
                                                    ]}
                                                >
                                                    <View style={styles.activityIcon}>
                                                        <Ionicons name="sparkles-outline" size={18} color="#E50914" />
                                                    </View>
                                                    <View style={styles.rowMain}>
                                                        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                                                        <Text style={styles.rowSub} numberOfLines={1}>{item.meta}</Text>
                                                    </View>
                                                    <View style={styles.activityMeta}>
                                                        <Text style={styles.activityTime}>{item.time}</Text>
                                                        <Ionicons name="chevron-forward" size={16} color="#6b7280" />
                                                    </View>
                                                </Pressable>
                                            ))
                                        ) : (
                                            <Text style={styles.emptyText}>Sin actividad reciente</Text>
                                        )}
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Resumen</Text>
                                    <View style={styles.panelCard}>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Total anime</Text>
                                            <Text style={styles.summaryValue}>{stats?.totalAnime || 0}</Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Total episodios</Text>
                                            <Text style={styles.summaryValue}>{stats?.totalEpisodes || 0}</Text>
                                        </View>
                                        <View style={styles.divider} />
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Storage (R2)</Text>
                                            <Text style={styles.summaryValue}>{storageTotal}</Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Transcode</Text>
                                            <Text style={styles.summaryValue}>{0}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
        </AdminShell>
    );
}

function StatCard({ title, value, icon, style }: any) {
    return (
        <View style={[styles.statCard, style]}>
            <View style={styles.statCardTop}>
                <Text style={styles.statBig}>{value}</Text>
                <View style={styles.statChip}>
                    <Ionicons name={icon} size={14} color={adminColors.primary} />
                </View>
            </View>
            <Text style={styles.statLabel} numberOfLines={1}>{title}</Text>
            <View style={styles.statBar} />
        </View>
    );
}

function QuickAction({ title, subtitle, icon, onPress, primary }: any) {
    return (
        <Pressable
            onPress={onPress}
            style={(state: any) => [
                styles.actionCard,
                primary && styles.actionCardPrimary,
                state.hovered && styles.hovered,
                state.pressed && styles.pressed,
            ]}
        >
            <View style={[styles.actionIconWrap, primary && styles.actionIconWrapPrimary]}>
                <Ionicons name={icon} size={22} color={primary ? '#FFFFFF' : adminColors.primary} />
            </View>
            <View style={styles.actionText}>
                <Text style={[styles.actionTitle, primary && styles.actionTitlePrimary]} numberOfLines={1}>{title}</Text>
                <Text style={[styles.actionSubtitle, primary && styles.actionSubtitlePrimary]} numberOfLines={1}>{subtitle}</Text>
            </View>
            <Ionicons
                name="chevron-forward"
                size={18}
                color={primary ? 'rgba(255, 255, 255, 0.92)' : adminColors.textSecondary}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminColors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: adminColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    backButton: {
        padding: 6,
    },
    headerTitleWrap: {
        flex: 1,
        marginLeft: 10,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: adminColors.text,
    },
    headerMeta: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    topCard: {
        marginHorizontal: 16,
        marginTop: 14,
        marginBottom: 10,
        padding: 12,
        borderRadius: 14,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: adminColors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    userText: {
        flex: 1,
        minWidth: 0,
    },
    userName: {
        fontSize: 14,
        fontWeight: '600',
        color: adminColors.text,
    },
    userEmail: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 1,
    },
    badge: {
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: adminColors.primary,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    loadingContainer: {
        padding: 32,
        alignItems: 'center',
    },
    sectionTight: {
        paddingHorizontal: 16,
        marginTop: 2,
    },
    mainGrid: {
        paddingBottom: 8,
    },
    mainGridWide: {
        flexDirection: 'row',
        gap: 10,
    },
    leftCol: {
        flex: 1,
        minWidth: 0,
    },
    rightCol: {
        flex: 1,
        minWidth: 0,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    statCard: {
        padding: 14,
        borderRadius: 14,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
        minWidth: '47%',
    },
    statCardHalf: {
        flexBasis: '47%',
        flexGrow: 1,
    },
    statCardQuarter: {
        flexBasis: '23%',
        flexGrow: 1,
    },
    statCardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    statBig: {
        fontSize: 28,
        fontWeight: '900',
        color: adminColors.text,
        letterSpacing: 0.2,
    },
    statLabel: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
    },
    statChip: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statBar: {
        marginTop: 10,
        height: 2,
        borderRadius: 999,
        backgroundColor: 'rgba(25, 23, 27, 0.08)',
    },
    section: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: adminColors.text,
        marginBottom: 10,
        letterSpacing: 0.3,
    },
    actionsGrid: {
        gap: 10,
    },
    actionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 14,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    actionCardPrimary: {
        backgroundColor: adminColors.primary,
        borderColor: adminColors.primary,
    },
    actionIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionIconWrapPrimary: {
        backgroundColor: 'rgba(255, 255, 255, 0.14)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    actionText: {
        flex: 1,
        minWidth: 0,
    },
    actionTitle: {
        fontSize: 14,
        fontWeight: '800',
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
        color: 'rgba(255, 255, 255, 0.92)',
    },
    panelCard: {
        padding: 14,
        borderRadius: 14,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    panelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    panelTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: adminColors.text,
    },
    panelLink: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.primary,
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: adminColors.border,
    },
    activityIcon: {
        width: 30,
        height: 30,
        borderRadius: 12,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rowMain: {
        flex: 1,
        minWidth: 0,
    },
    activityMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    activityTime: {
        fontSize: 11,
        fontWeight: '700',
        color: adminColors.textSecondary,
    },
    rowTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: adminColors.text,
    },
    rowSub: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 2,
    },
    emptyText: {
        fontSize: 12,
        color: adminColors.textSecondary,
        paddingVertical: 10,
    },
    hovered: {
        backgroundColor: 'rgba(117, 2, 15, 0.06)',
    },
    pressed: {
        opacity: 0.9,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
    },
    summaryLabel: {
        fontSize: 12,
        color: adminColors.textSecondary,
    },
    summaryValue: {
        fontSize: 13,
        fontWeight: '800',
        color: adminColors.text,
    },
    divider: {
        height: 1,
        backgroundColor: adminColors.border,
    },
});
