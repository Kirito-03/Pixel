import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    Linking,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminApiService } from '../../services/adminApiService';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../types/navigation';
import { AdminShell } from '../../components/admin/AdminShell';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { adminColors } from '../../theme';

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;
type EpisodeManagerRouteProp = RouteProp<AdminStackParamList, 'EpisodeManager'>;

const EPISODE_STATUSES = ['missing', 'queued', 'processing', 'ready', 'error'] as const;
type EpisodeStatus = typeof EPISODE_STATUSES[number];

export default function EpisodeManagerScreen() {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<EpisodeManagerRouteProp>();
    const { animeId, animeTitle } = route.params;
    const { width } = useWindowDimensions();
    const isNarrow = width < 640;
    const isCompact = width < 480;

    const [episodes, setEpisodes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploadingEpisodeId, setUploadingEpisodeId] = useState<number | null>(null);
    const [processingEpisodeId, setProcessingEpisodeId] = useState<number | null>(null);
    const [syncingDriveEpisodeId, setSyncingDriveEpisodeId] = useState<number | null>(null);
    const [autoProcessAfterUpload, setAutoProcessAfterUpload] = useState(true);
    const [cleanupLocalAfterProcess, setCleanupLocalAfterProcess] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingEpisode, setEditingEpisode] = useState<any>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteEpisodeTarget, setDeleteEpisodeTarget] = useState<any>(null);
    const [deleteMode, setDeleteMode] = useState<'soft' | 'hard'>('soft');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteNotice, setDeleteNotice] = useState('');

    const [episodeForm, setEpisodeForm] = useState<{
        episode_number: string;
        title: string;
        duration: string;
        video_url: string;
        season: string;
        status: EpisodeStatus;
        quality: string;
        storage_type: 'gdrive' | 'local' | 'r2';
    }>({
        episode_number: '',
        title: '',
        duration: '',
        video_url: '',
        season: '1',
        status: 'missing',
        quality: '1080p',
        storage_type: 'gdrive',
    });

    useEffect(() => {
        if (animeId) {
            loadEpisodes();
        }
    }, [animeId]);

    const loadEpisodes = async () => {
        try {
            setIsLoading(true);
            const data = await adminApiService.getEpisodes(animeId);
            setEpisodes(Array.isArray(data) ? data : (data?.episodes || []));
        } catch (error) {
            console.error('Error loading episodes:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const STATUS_LABELS: Record<string, string> = {
        missing: 'Faltante',
        queued: 'En cola',
        processing: 'Procesando',
        ready: 'Listo',
        error: 'Error',
    };

    const STORAGE_LABELS: Record<string, string> = {
        gdrive: 'GDrive',
        local: 'Local',
        r2: 'R2',
        external: 'External',
    };

    const openAddModal = () => {
        setEditingEpisode(null);
        setEpisodeForm({
            episode_number: (episodes.length + 1).toString(),
            title: '',
            duration: '',
            video_url: '',
            season: '1',
            status: 'missing',
            quality: '1080p',
            storage_type: 'gdrive',
        });
        setShowAddModal(true);
    };

    const openEditModal = (episode: any) => {
        const incomingStatus = typeof episode.status === 'string' ? episode.status : '';
        const statusValue: EpisodeStatus = (EPISODE_STATUSES as readonly string[]).includes(incomingStatus)
            ? (incomingStatus as EpisodeStatus)
            : (episode.video_url ? 'queued' : 'missing');

        setEditingEpisode(episode);
        setEpisodeForm({
            episode_number: episode.episode_number.toString(),
            title: episode.title || '',
            duration: episode.duration?.toString() || '',
            video_url: episode.video_url || '',
            season: episode.season?.toString() || '1',
            status: statusValue,
            quality: episode.quality || '1080p',
            storage_type: episode.storage_type || 'gdrive',
        });
        setShowAddModal(true);
    };

    const handleSaveEpisode = async () => {
        if (!episodeForm.episode_number) {
            Alert.alert('Error', 'Número de episodio es requerido');
            return;
        }

        try {
            const normalizedVideoUrl = episodeForm.video_url.trim();
            const normalizedStatus: EpisodeStatus = episodeForm.status || (normalizedVideoUrl ? 'queued' : 'missing');

            const payload = {
                anime_id: animeId,
                episode_number: parseInt(episodeForm.episode_number),
                title: episodeForm.title || undefined,
                duration: episodeForm.duration ? parseInt(episodeForm.duration) : undefined,
                video_url: normalizedVideoUrl ? normalizedVideoUrl : null,
                season: parseInt(episodeForm.season),
                status: normalizedStatus,
                quality: episodeForm.quality,
                storage_type: episodeForm.storage_type as 'gdrive' | 'local' | 'r2',
            };

            if (editingEpisode) {
                await adminApiService.updateEpisode(editingEpisode.id, payload);
                Alert.alert('Éxito', 'Episodio actualizado');
            } else {
                await adminApiService.createEpisode(payload);
                Alert.alert('Éxito', 'Episodio agregado');
            }

            setShowAddModal(false);
            loadEpisodes();
        } catch (error: any) {
            console.error('Error saving episode:', error);
            Alert.alert('Error', error.message || 'No se pudo guardar el episodio');
        }
    };

    const handleDeleteEpisode = (episode: any) => {
        setDeleteEpisodeTarget(episode);
        setDeleteMode('soft');
        setDeleteNotice('');
        setShowDeleteModal(true);
    };

    const confirmDeleteEpisode = async () => {
        if (!deleteEpisodeTarget?.id || deleteLoading) return;
        setDeleteLoading(true);
        setDeleteNotice('');
        try {
            await adminApiService.deleteEpisode(deleteEpisodeTarget.id, { mode: deleteMode, cleanup: true });
            setEpisodes(prev => prev.filter(e => e.id !== deleteEpisodeTarget.id));
            setShowDeleteModal(false);
            setDeleteEpisodeTarget(null);
            await loadEpisodes();
            setDeleteNotice(deleteMode === 'hard' ? 'Episodio eliminado' : 'Episodio desactivado');
            setTimeout(() => setDeleteNotice(''), 2500);
        } catch (error: any) {
            const msg =
                error?.response?.data?.message ||
                error?.message ||
                'No se pudo eliminar el episodio';
            setDeleteNotice(msg);
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleUploadVideo = async (episode: any) => {
        if (Platform.OS !== 'web') {
            Alert.alert('No disponible', 'La subida manual de archivos está habilitada solo en web por ahora.');
            return;
        }
        if (uploadingEpisodeId === episode.id) return;

        const doc = (globalThis as any)?.document;
        if (!doc?.createElement) {
            Alert.alert('Error', 'No se pudo abrir el selector de archivos.');
            return;
        }

        const input = doc.createElement('input') as any;
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = async () => {
            const file = input?.files?.[0];
            if (!file) return;

            setUploadingEpisodeId(episode.id);
            try {
                const result = await adminApiService.uploadEpisodeVideo(episode.id, file);
                if (autoProcessAfterUpload) {
                    setUploadingEpisodeId(null);
                    setProcessingEpisodeId(episode.id);
                    try {
                        const proc = await adminApiService.processEpisodeVideo(episode.id, { cleanup: cleanupLocalAfterProcess });
                        Alert.alert('Éxito', proc?.message || 'Procesamiento completado');
                    } catch (error: any) {
                        const message =
                            error?.response?.data?.message ||
                            error?.message ||
                            'No se pudo procesar el episodio';
                        Alert.alert('Error', message);
                    } finally {
                        setProcessingEpisodeId(null);
                    }
                } else {
                    Alert.alert('Éxito', result?.message || 'Video subido');
                }
                await loadEpisodes();
            } catch (error: any) {
                const message =
                    error?.response?.data?.message ||
                    error?.message ||
                    'No se pudo subir el video';
                Alert.alert('Error', message);
            } finally {
                setUploadingEpisodeId(null);
            }
        };

        input.click();
    };

    const handleProcessVideo = async (episode: any) => {
        if (processingEpisodeId === episode.id) return;
        if (String(episode.status) === 'processing') return;
        if (!episode.video_url) {
            Alert.alert('Sin video', 'Este episodio no tiene video_url. Sube un video primero.');
            return;
        }

        setProcessingEpisodeId(episode.id);
        try {
            const result = await adminApiService.processEpisodeVideo(episode.id, { cleanup: cleanupLocalAfterProcess });
            Alert.alert('Éxito', result?.message || 'Procesamiento completado');
            await loadEpisodes();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                error?.message ||
                'No se pudo procesar el episodio';
            Alert.alert('Error', message);
            await loadEpisodes();
        } finally {
            setProcessingEpisodeId(null);
        }
    };

    const handleMarkAllReady = async () => {
        try {
            await adminApiService.markAllEpisodesReady(animeId);
            await loadEpisodes();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Error');
        }
    };

    const handleSyncEpisodeToDrive = async (episode: any) => {
        if (!episode?.id || syncingDriveEpisodeId) return;
        setSyncingDriveEpisodeId(episode.id);
        try {
            const res = await adminApiService.syncDrive({ type: 'episode', id: episode.id });
            const msg = res?.message || `Subida del Ep ${episode.episode_number} a Google Drive VIP iniciada en segundo plano.`;
            if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(msg);
            } else {
                Alert.alert('Google Drive VIP', msg);
            }
        } catch (error: any) {
            const msg =
                error?.response?.data?.message ||
                error?.message ||
                'No se pudo iniciar la subida a Google Drive';
            if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(msg);
            } else {
                Alert.alert('Error', msg);
            }
        } finally {
            setSyncingDriveEpisodeId(null);
        }
    };

    const renderEpisodeItem = ({ item }: any) => (
        <Pressable
            style={({ hovered }: any) => [
                styles.episodeCard,
                isNarrow && styles.episodeCardStacked,
                hovered && styles.episodeCardHovered,
            ]}
        >
            <View style={styles.episodeInfo}>
                <View style={styles.episodeHeader}>
                    <Text style={styles.episodeNumber}>
                        S{item.season || 1} • E{item.episode_number}
                    </Text>
                    <View style={styles.badges}>
                        <View style={[styles.statusBadge, getEpisodeStatusBadgeStyle(item.status)]}>
                            <Text style={[styles.statusBadgeText, getEpisodeStatusTextStyle(item.status)]}>
                                {STATUS_LABELS[item.status || (item.video_url ? 'queued' : 'missing')] || (item.status || (item.video_url ? 'queued' : 'missing'))}
                            </Text>
                        </View>
                        <View style={styles.qualityBadge}>
                            <Text style={styles.badgeText}>{item.quality || '1080p'}</Text>
                        </View>
                        <View style={[
                            styles.storageBadge,
                            item.storage_type === 'gdrive' && styles.gdriveBadge,
                            item.storage_type === 'r2' && styles.r2Badge,
                        ]}>
                            <Ionicons
                                name={item.storage_type === 'r2' ? 'cloud-done-outline' : (item.storage_type === 'gdrive' ? 'cloud' : 'server')}
                                size={12}
                                color={adminColors.text}
                            />
                            <Text style={styles.storageBadgeText}>
                                {STORAGE_LABELS[item.storage_type] || String(item.storage_type || '').toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </View>

                {!!item.title && (
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                        {item.title}
                    </Text>
                )}

                <View style={styles.episodeMetaRow}>
                    {typeof item.duration === 'number' ? (
                        <Text style={styles.episodeMetaText}>{item.duration} min</Text>
                    ) : (
                        <Text style={styles.episodeMetaMuted}>Duración: —</Text>
                    )}
                    <Text style={styles.metaDot}>•</Text>
                    {item.stream_url && item.storage_type === 'r2' ? (
                        <Text style={styles.episodeMetaText} numberOfLines={1}>R2: OK</Text>
                    ) : item.stream_url ? (
                        <Text style={styles.episodeMetaText} numberOfLines={1}>Stream: OK</Text>
                    ) : item.video_url ? (
                        <Text style={styles.episodeMetaText} numberOfLines={1}>Video: OK</Text>
                    ) : (
                        <Text style={styles.episodeMetaMuted} numberOfLines={1}>Fuente: faltante</Text>
                    )}
                </View>

                {!!item.video_url && !item.stream_url && (
                    <Text style={styles.episodeUrl} numberOfLines={1}>
                        {item.video_url}
                    </Text>
                )}
                {!!item.stream_url && (
                    <Text style={styles.episodeUrl} numberOfLines={1}>
                        {item.stream_url}
                    </Text>
                )}
            </View>

            <View style={[styles.episodeActions, isNarrow && styles.episodeActionsStacked]}>
                <TouchableOpacity
                    style={[
                        styles.iconButton,
                        (!item.video_url || item.status === 'processing') && styles.iconButtonDisabled,
                    ]}
                    disabled={!item.video_url || item.status === 'processing' || processingEpisodeId === item.id}
                    onPress={() => handleProcessVideo(item)}
                    accessibilityLabel="Procesar video"
                >
                    {processingEpisodeId === item.id || item.status === 'processing' ? (
                        <ActivityIndicator size="small" color={adminColors.primary} />
                    ) : (
                        <Ionicons
                            name="cog-outline"
                            size={18}
                            color={(!item.video_url || item.status === 'processing') ? adminColors.textSecondary : adminColors.text}
                        />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.iconButton,
                        Platform.OS !== 'web' && styles.iconButtonDisabled,
                    ]}
                    disabled={Platform.OS !== 'web' || uploadingEpisodeId === item.id}
                    onPress={() => handleUploadVideo(item)}
                    accessibilityLabel="Subir video"
                >
                    {uploadingEpisodeId === item.id ? (
                        <ActivityIndicator size="small" color={adminColors.primary} />
                    ) : (
                        <Ionicons
                            name="cloud-upload-outline"
                            size={18}
                            color={Platform.OS === 'web' ? adminColors.text : adminColors.textSecondary}
                        />
                    )}
                </TouchableOpacity>

                {!!item.stream_url ? (
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => {
                            const url = item.stream_url;
                            if (!url) return;
                            if (Platform.OS === 'web') {
                                (globalThis as any)?.open?.(url, '_blank');
                            } else {
                                Linking.openURL(url);
                            }
                        }}
                        accessibilityLabel="Reproducir stream"
                    >
                        <Ionicons name="play" size={18} color="#16a34a" />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[
                            styles.iconButton,
                            !item.video_url && styles.iconButtonDisabled,
                        ]}
                        disabled={!item.video_url}
                        onPress={() => {
                            const url = item.video_url;
                            if (!url) return;
                            if (Platform.OS === 'web') {
                                (globalThis as any)?.open?.(url, '_blank');
                            } else {
                                Linking.openURL(url);
                            }
                        }}
                        accessibilityLabel="Abrir video"
                    >
                        <Ionicons
                            name="play-circle-outline"
                            size={18}
                            color={item.video_url ? adminColors.text : adminColors.textSecondary}
                        />
                    </TouchableOpacity>
                )}

                {item.storage_type !== 'gdrive' && (
                    <TouchableOpacity
                        style={styles.iconButton}
                        disabled={syncingDriveEpisodeId === item.id}
                        onPress={() => handleSyncEpisodeToDrive(item)}
                        accessibilityLabel="Subir a Google Drive VIP"
                    >
                        {syncingDriveEpisodeId === item.id ? (
                            <ActivityIndicator size="small" color="#2e7d32" />
                        ) : (
                            <Ionicons name="cloud-done-outline" size={18} color="#4ade80" />
                        )}
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => openEditModal(item)}
                    accessibilityLabel="Editar episodio"
                >
                    <Ionicons name="pencil" size={18} color={adminColors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleDeleteEpisode(item)}
                    accessibilityLabel="Eliminar episodio"
                >
                    <Ionicons name="trash-outline" size={18} color={adminColors.primary} />
                </TouchableOpacity>
            </View>
        </Pressable>
    );

    return (
        <AdminShell activeKey="episodes">
            <SafeAreaView style={styles.container} edges={['top']}>
                <AdminHeader
                    title={animeTitle || 'Episodios'}
                    subtitle={`${episodes.length} episodios`}
                    onBack={() => navigation.goBack()}
                    rightSlot={
                        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
                            <Ionicons name="add" size={18} color="#FFFFFF" />
                            <Text style={styles.addButtonText}>Nuevo</Text>
                        </TouchableOpacity>
                    }
                />

                <View style={[styles.optionsWrap, isCompact && styles.optionsWrapCompact]}>
                    <View style={styles.optionsRow}>
                        <TouchableOpacity
                            style={[styles.optionChip, autoProcessAfterUpload && styles.optionChipActive]}
                            onPress={() => setAutoProcessAfterUpload(v => !v)}
                        >
                            <Ionicons
                                name="flash-outline"
                                size={15}
                                color={autoProcessAfterUpload ? adminColors.primary : adminColors.textSecondary}
                            />
                            <Text style={[styles.optionChipText, autoProcessAfterUpload && styles.optionChipTextActive]}>
                                Auto procesar
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.optionChip, cleanupLocalAfterProcess && styles.optionChipActive, !autoProcessAfterUpload && styles.chipDisabled]}
                            onPress={() => setCleanupLocalAfterProcess(v => !v)}
                            disabled={!autoProcessAfterUpload}
                        >
                            <Ionicons
                                name="trash-outline"
                                size={15}
                                color={cleanupLocalAfterProcess ? adminColors.primary : adminColors.textSecondary}
                            />
                            <Text style={[styles.optionChipText, cleanupLocalAfterProcess && styles.optionChipTextActive]}>
                                Borrar local
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.optionChip} onPress={handleMarkAllReady}>
                            <Ionicons name="checkmark-done-outline" size={15} color={adminColors.textSecondary} />
                            <Text style={styles.optionChipText}>Listo a todos</Text>
                        </TouchableOpacity>
                    </View>

                    {!!deleteNotice && !showDeleteModal && (
                        <View style={styles.inlineNotice}>
                            <Text style={styles.inlineNoticeText}>{deleteNotice}</Text>
                        </View>
                    )}
                </View>

                {isLoading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={adminColors.primary} />
                    </View>
                ) : episodes.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <Ionicons name="play-circle-outline" size={52} color={adminColors.textSecondary} />
                        <Text style={styles.emptyText}>No hay episodios agregados</Text>
                        <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
                            <Text style={styles.emptyButtonText}>Agregar Primer Episodio</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={episodes}
                        renderItem={renderEpisodeItem}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={[styles.listContent, isCompact && styles.listContentCompact]}
                    />
                )}

                {/* Add/Edit Episode Modal */}
                <Modal
                    visible={showAddModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowAddModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainer}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>
                                    {editingEpisode ? 'Editar Episodio' : 'Agregar Episodio'}
                                </Text>
                                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar formulario del episodio" onPress={() => setShowAddModal(false)} style={styles.modalCloseBtn}>
                                    <Ionicons name="close" size={22} color={adminColors.text} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
                                <View style={styles.row}>
                                    <View style={[styles.formGroup, styles.rowField]}>
                                        <Text style={styles.label}>Episodio *</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episodeForm.episode_number}
                                            onChangeText={(text) =>
                                                setEpisodeForm({ ...episodeForm, episode_number: text.replace(/[^0-9]/g, '') })
                                            }
                                            placeholder="1"
                                            keyboardType="numeric"
                                            placeholderTextColor={adminColors.textSecondary}
                                        />
                                    </View>

                                    <View style={[styles.formGroup, styles.rowField]}>
                                        <Text style={styles.label}>Duración (min)</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episodeForm.duration}
                                            onChangeText={(text) =>
                                                setEpisodeForm({ ...episodeForm, duration: text.replace(/[^0-9]/g, '') })
                                            }
                                            placeholder="24"
                                            keyboardType="numeric"
                                            placeholderTextColor={adminColors.textSecondary}
                                        />
                                    </View>

                                    <View style={[styles.formGroup, styles.rowField]}>
                                        <Text style={styles.label}>Temporada</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episodeForm.season}
                                            onChangeText={(text) =>
                                                setEpisodeForm({ ...episodeForm, season: text.replace(/[^0-9]/g, '') })
                                            }
                                            placeholder="1"
                                            keyboardType="numeric"
                                            placeholderTextColor={adminColors.textSecondary}
                                        />
                                    </View>
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Estado</Text>
                                    <View style={styles.statusButtons}>
                                        {EPISODE_STATUSES.map((s) => (
                                            <TouchableOpacity
                                                key={s}
                                                style={[styles.statusButton, episodeForm.status === s && styles.statusButtonActive]}
                                                onPress={() => setEpisodeForm({ ...episodeForm, status: s })}
                                            >
                                                <Text
                                                    style={[
                                                        styles.statusButtonText,
                                                        episodeForm.status === s && styles.statusButtonTextActive,
                                                    ]}
                                                >
                                                    {s}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Título (opcional)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={episodeForm.title}
                                        onChangeText={(text) => setEpisodeForm({ ...episodeForm, title: text })}
                                        placeholder="Título del episodio"
                                        placeholderTextColor={adminColors.textSecondary}
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>URL del Video</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={episodeForm.video_url}
                                        onChangeText={(text) => setEpisodeForm({ ...episodeForm, video_url: text })}
                                        placeholder="https://..."
                                        placeholderTextColor={adminColors.textSecondary}
                                        autoCapitalize="none"
                                        multiline
                                    />
                                    <Text style={styles.hint}>
                                        Si lo dejas vacío, quedará como missing hasta que subas o proceses el video.
                                    </Text>
                                </View>

                                <View style={styles.row}>
                                    <View style={[styles.formGroup, styles.rowFieldWide]}>
                                        <Text style={styles.label}>Calidad</Text>
                                        <View style={styles.qualityButtons}>
                                            {['720p', '1080p', '4K'].map((quality) => (
                                                <TouchableOpacity
                                                    key={quality}
                                                    style={[
                                                        styles.qualityButton,
                                                        episodeForm.quality === quality && styles.qualityButtonActive,
                                                    ]}
                                                    onPress={() => setEpisodeForm({ ...episodeForm, quality })}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.qualityButtonText,
                                                            episodeForm.quality === quality && styles.qualityButtonTextActive,
                                                        ]}
                                                    >
                                                        {quality}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={[styles.formGroup, styles.rowFieldWide]}>
                                        <Text style={styles.label}>Almacenamiento</Text>
                                        <View style={styles.storageButtons}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.storageButton,
                                                    episodeForm.storage_type === 'gdrive' && styles.storageButtonActive,
                                                ]}
                                                onPress={() => setEpisodeForm({ ...episodeForm, storage_type: 'gdrive' })}
                                            >
                                                <Ionicons
                                                    name="cloud"
                                                    size={16}
                                                    color={episodeForm.storage_type === 'gdrive' ? adminColors.primary : adminColors.textSecondary}
                                                />
                                                <Text
                                                    style={[
                                                        styles.storageButtonText,
                                                        episodeForm.storage_type === 'gdrive' && styles.storageButtonTextActive,
                                                    ]}
                                                >
                                                    GDrive
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[
                                                    styles.storageButton,
                                                    episodeForm.storage_type === 'local' && styles.storageButtonActive,
                                                ]}
                                                onPress={() => setEpisodeForm({ ...episodeForm, storage_type: 'local' })}
                                            >
                                                <Ionicons
                                                    name="server"
                                                    size={16}
                                                    color={episodeForm.storage_type === 'local' ? adminColors.primary : adminColors.textSecondary}
                                                />
                                                <Text
                                                    style={[
                                                        styles.storageButtonText,
                                                        episodeForm.storage_type === 'local' && styles.storageButtonTextActive,
                                                    ]}
                                                >
                                                    R2/Local
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>

                                <TouchableOpacity style={styles.saveButton} onPress={handleSaveEpisode}>
                                    <Text style={styles.saveButtonText}>
                                        {editingEpisode ? 'Guardar Cambios' : 'Agregar Episodio'}
                                    </Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {/* Delete Modal */}
                <Modal
                    visible={showDeleteModal}
                    animationType="fade"
                    transparent={true}
                    onRequestClose={() => setShowDeleteModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.confirmModalContainer}>
                            <View style={styles.confirmHeader}>
                                <Text style={styles.confirmTitle}>Confirmar eliminación</Text>
                                <TouchableOpacity
                                    style={styles.modalCloseBtn}
                                    onPress={() => {
                                        if (deleteLoading) return;
                                        setShowDeleteModal(false);
                                    }}
                                >
                                    <Ionicons name="close" size={22} color={adminColors.text} />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.confirmBody}>
                                {deleteEpisodeTarget
                                    ? `Episodio S${deleteEpisodeTarget.season || 1} • E${deleteEpisodeTarget.episode_number}`
                                    : 'Episodio'}
                            </Text>

                            <View style={styles.deleteModeRow}>
                                <TouchableOpacity
                                    style={[styles.deleteModeChip, deleteMode === 'soft' && styles.deleteModeChipActive]}
                                    onPress={() => setDeleteMode('soft')}
                                    disabled={deleteLoading}
                                >
                                    <Text style={[styles.deleteModeChipText, deleteMode === 'soft' && styles.deleteModeChipTextActive]}>
                                        Desactivar
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.deleteModeChip, deleteMode === 'hard' && styles.deleteModeChipDanger]}
                                    onPress={() => setDeleteMode('hard')}
                                    disabled={deleteLoading}
                                >
                                    <Text style={[styles.deleteModeChipText, deleteMode === 'hard' && styles.deleteModeChipTextActive]}>
                                        Eliminar
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {deleteMode === 'soft' ? (
                                <Text style={styles.confirmHint}>
                                    Se marcará como inactivo y desaparecerá del panel.
                                </Text>
                            ) : (
                                <Text style={styles.confirmHintDanger}>
                                    Se borrará el registro y se intentará limpiar archivos asociados.
                                </Text>
                            )}

                            {!!deleteNotice && <Text style={styles.deleteNotice}>{deleteNotice}</Text>}

                            <View style={styles.confirmActions}>
                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={() => setShowDeleteModal(false)}
                                    disabled={deleteLoading}
                                >
                                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.deleteButton, deleteMode === 'hard' && styles.deleteButtonDanger]}
                                    onPress={confirmDeleteEpisode}
                                    disabled={deleteLoading}
                                >
                                    {deleteLoading ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <Text style={styles.deleteButtonText}>
                                            {deleteMode === 'hard' ? 'Eliminar' : 'Desactivar'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        </AdminShell>
    );
}

function getEpisodeStatusBadgeStyle(status: string) {
    switch (status) {
        case 'ready': return { backgroundColor: 'rgba(22, 163, 74, 0.12)' };
        case 'processing': return { backgroundColor: 'rgba(202, 138, 4, 0.14)' };
        case 'queued': return { backgroundColor: 'rgba(37, 99, 235, 0.12)' };
        case 'error': return { backgroundColor: 'rgba(220, 38, 38, 0.12)' };
        case 'missing':
        default: return { backgroundColor: 'rgba(25, 23, 27, 0.08)' };
    }
}

function getEpisodeStatusTextStyle(status: string) {
    switch (status) {
        case 'ready': return { color: '#15803d' };
        case 'processing': return { color: '#a16207' };
        case 'queued': return { color: '#1d4ed8' };
        case 'error': return { color: '#b91c1c' };
        case 'missing':
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
    optionsWrap: {
        width: '100%',
        maxWidth: 1160,
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 10,
        gap: 10,
    },
    optionsWrapCompact: {
        paddingHorizontal: 12,
    },
    optionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    optionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
    },
    optionChipActive: {
        borderColor: adminColors.primary,
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
    },
    chipDisabled: {
        opacity: 0.45,
    },
    optionChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
    },
    optionChipTextActive: {
        color: adminColors.primary,
    },
    inlineNotice: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: 'rgba(117, 2, 15, 0.06)',
    },
    inlineNoticeText: {
        color: adminColors.text,
        fontSize: 12,
        fontWeight: '700',
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
        marginTop: 14,
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
        paddingTop: 4,
        paddingBottom: 28,
        gap: 10,
    },
    listContentCompact: {
        paddingHorizontal: 12,
    },
    episodeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        backgroundColor: adminColors.surface,
        padding: 14,
        borderRadius: 4,
    },
    episodeCardStacked: {
        flexDirection: 'column',
        alignItems: 'stretch',
    },
    episodeCardHovered: {
        backgroundColor: 'rgba(117, 2, 15, 0.03)',
    },
    episodeInfo: {
        flex: 1,
        minWidth: 0,
    },
    episodeHeader: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    episodeNumber: {
        fontSize: 15,
        fontWeight: '800',
        color: adminColors.text,
    },
    badges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    statusBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    qualityBadge: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: adminColors.primary,
    },
    storageBadge: {
        backgroundColor: adminColors.background,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    gdriveBadge: {
        backgroundColor: 'rgba(66, 133, 244, 0.14)',
    },
    r2Badge: {
        backgroundColor: 'rgba(22, 163, 74, 0.12)',
    },
    storageBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: adminColors.text,
    },
    episodeTitle: {
        fontSize: 14,
        color: adminColors.text,
        fontWeight: '600',
        marginBottom: 4,
    },
    episodeMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
    },
    episodeMetaText: {
        fontSize: 12,
        color: adminColors.textSecondary,
        fontWeight: '600',
    },
    episodeMetaMuted: {
        fontSize: 12,
        color: adminColors.textSecondary,
    },
    metaDot: {
        color: 'rgba(25, 23, 27, 0.25)',
        fontSize: 12,
    },
    episodeUrl: {
        fontSize: 11,
        color: adminColors.textSecondary,
        marginTop: 4,
    },
    episodeActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    episodeActionsStacked: {
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: adminColors.border,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconButtonDisabled: {
        opacity: 0.45,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 620,
        maxHeight: '90%',
        backgroundColor: adminColors.surface,
        borderRadius: 4,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: adminColors.text,
    },
    modalCloseBtn: {
        width: 44,
        height: 44,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalScroll: {
        flexGrow: 0,
    },
    modalContent: {
        padding: 16,
        paddingBottom: 24,
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    rowField: {
        flex: 1,
        minWidth: 96,
    },
    rowFieldWide: {
        flex: 1,
        minWidth: 180,
    },
    formGroup: {
        marginBottom: 14,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
        marginBottom: 6,
    },
    input: {
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 44,
        fontSize: 14,
        color: adminColors.text,
    },
    hint: {
        fontSize: 12,
        color: adminColors.textSecondary,
        marginTop: 6,
    },
    statusButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statusButton: {
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusButtonActive: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        borderColor: adminColors.primary,
    },
    statusButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
        textTransform: 'uppercase',
    },
    statusButtonTextActive: {
        color: adminColors.primary,
    },
    qualityButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    qualityButton: {
        flex: 1,
        minWidth: 64,
        minHeight: 44,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    qualityButtonActive: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        borderColor: adminColors.primary,
    },
    qualityButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: adminColors.textSecondary,
    },
    qualityButtonTextActive: {
        color: adminColors.primary,
        fontWeight: '700',
    },
    storageButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    storageButton: {
        flex: 1,
        minWidth: 100,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
    },
    storageButtonActive: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        borderColor: adminColors.primary,
    },
    storageButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: adminColors.textSecondary,
    },
    storageButtonTextActive: {
        color: adminColors.primary,
        fontWeight: '700',
    },
    saveButton: {
        backgroundColor: adminColors.primary,
        minHeight: 48,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 6,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    confirmModalContainer: {
        width: '100%',
        maxWidth: 480,
        backgroundColor: adminColors.surface,
        borderRadius: 4,
        overflow: 'hidden',
    },
    confirmHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    confirmTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: adminColors.text,
    },
    confirmBody: {
        color: adminColors.text,
        fontSize: 14,
        fontWeight: '700',
        paddingHorizontal: 16,
        paddingTop: 14,
    },
    deleteModeRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 14,
    },
    deleteModeChip: {
        flex: 1,
        minHeight: 44,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteModeChipActive: {
        borderColor: adminColors.primary,
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
    },
    deleteModeChipDanger: {
        borderColor: adminColors.primary,
        backgroundColor: 'rgba(117, 2, 15, 0.14)',
    },
    deleteModeChipText: {
        color: adminColors.textSecondary,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    deleteModeChipTextActive: {
        color: adminColors.primary,
    },
    confirmHint: {
        color: adminColors.textSecondary,
        fontSize: 12,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    confirmHintDanger: {
        color: adminColors.primary,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    deleteNotice: {
        paddingHorizontal: 16,
        paddingTop: 10,
        color: adminColors.text,
        fontSize: 12,
        fontWeight: '700',
    },
    confirmActions: {
        flexDirection: 'row',
        gap: 10,
        padding: 16,
    },
    cancelButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelButtonText: {
        color: adminColors.text,
        fontSize: 13,
        fontWeight: '700',
    },
    deleteButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 4,
        backgroundColor: adminColors.ink,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonDanger: {
        backgroundColor: adminColors.primary,
    },
    deleteButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
});
