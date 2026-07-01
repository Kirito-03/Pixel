import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminApiService } from '../../services/adminApiService';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '../../types/navigation';
import { AdminShell } from '../../components/admin/AdminShell';
import { adminColors } from '../../theme';

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;
type EpisodeManagerRouteProp = RouteProp<AdminStackParamList, 'EpisodeManager'>;

const EPISODE_STATUSES = ['missing', 'queued', 'processing', 'ready', 'error'] as const;
type EpisodeStatus = typeof EPISODE_STATUSES[number];

export default function EpisodeManagerScreen() {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<EpisodeManagerRouteProp>();
    const { animeId, animeTitle } = route.params;

    const [episodes, setEpisodes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploadingEpisodeId, setUploadingEpisodeId] = useState<number | null>(null);
    const [processingEpisodeId, setProcessingEpisodeId] = useState<number | null>(null);
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
    } catch(e: any) {
        Alert.alert('Error', e.message || 'Error');
    }
};

const renderEpisodeItem = ({ item }: any) => (
        <Pressable
            style={({ hovered }: any) => [
                styles.episodeCard,
                hovered && styles.episodeCardHovered
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
                            item.storage_type === 'r2' && styles.r2Badge
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
                {item.title && (
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
            <View style={styles.episodeActions}>
                <TouchableOpacity
                    style={[
                        styles.iconButton,
                        (!item.video_url || item.status === 'processing') && styles.iconButtonDisabled
                    ]}
                    disabled={!item.video_url || item.status === 'processing' || processingEpisodeId === item.id}
                    onPress={() => handleProcessVideo(item)}
                >
                    {processingEpisodeId === item.id || item.status === 'processing' ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Ionicons
                            name="cog-outline"
                            size={18}
                            color={(!item.video_url || item.status === 'processing') ? '#666666' : '#FFFFFF'}
                        />
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.iconButton,
                        Platform.OS !== 'web' && styles.iconButtonDisabled
                    ]}
                    disabled={Platform.OS !== 'web' || uploadingEpisodeId === item.id}
                    onPress={() => handleUploadVideo(item)}
                >
                    {uploadingEpisodeId === item.id ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Ionicons
                            name="cloud-upload-outline"
                            size={18}
                            color={Platform.OS === 'web' ? '#FFFFFF' : '#666666'}
                        />
                    )}
                </TouchableOpacity>
                {!!item.stream_url && (
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
                    >
                        <Ionicons name="play" size={18} color="#2ecc71" />
                    </TouchableOpacity>
                )}
                {!item.stream_url && (
                    <TouchableOpacity
                        style={[
                            styles.iconButton,
                            !item.video_url && styles.iconButtonDisabled
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
                    >
                        <Ionicons
                            name="play-circle-outline"
                            size={18}
                            color={item.video_url ? adminColors.text : adminColors.textSecondary}
                        />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => openEditModal(item)}
                >
                    <Ionicons name="pencil" size={18} color={adminColors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleDeleteEpisode(item)}
                >
                    <Ionicons name="trash-outline" size={18} color={adminColors.primary} />
                </TouchableOpacity>
            </View>
        </Pressable>
    );

    return (
        <AdminShell activeKey="episodes">
            <SafeAreaView style={styles.container} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {Platform.OS !== 'web' && (
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                                <Ionicons name="arrow-back" size={24} color={adminColors.text} />
                            </TouchableOpacity>
                        )}
                        <View style={styles.headerTitleContainer}>
                            <Text style={styles.headerTitle} numberOfLines={1}>
                                {animeTitle || 'Episodios'}
                            </Text>
                            <Text style={styles.headerSubtitle}>{episodes.length} episodios</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
                        <Ionicons name="add" size={20} color="#FFFFFF" />
                        <Text style={styles.addButtonText}>Nuevo Episodio</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.optionsRow}>
                    <TouchableOpacity
                        style={[styles.optionChip, autoProcessAfterUpload && styles.optionChipActive]}
                        onPress={() => setAutoProcessAfterUpload(v => !v)}
                    >
                        <Ionicons
                            name="flash-outline"
                            size={14}
                            color={autoProcessAfterUpload ? adminColors.primary : adminColors.textSecondary}
                        />
                        <Text style={[styles.optionChipText, autoProcessAfterUpload && styles.optionChipTextActive]}>
                            Auto procesar
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.optionChip, cleanupLocalAfterProcess && styles.optionChipActive]}
                        onPress={() => setCleanupLocalAfterProcess(v => !v)}
                        disabled={!autoProcessAfterUpload}
                    >
                        <Ionicons
                            name="trash-outline"
                            size={14}
                            color={cleanupLocalAfterProcess ? adminColors.primary : adminColors.textSecondary}
                        />
                        <Text style={[styles.optionChipText, cleanupLocalAfterProcess && styles.optionChipTextActive]}>
                            Borrar local
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionChip} onPress={handleMarkAllReady}>
                        <Ionicons name="checkmark-done-outline" size={14} color={adminColors.textSecondary} />
                        <Text style={styles.optionChipText}>Listo a todos</Text>
                    </TouchableOpacity>
                </View>
                {!!deleteNotice && !showDeleteModal && (
                    <View style={styles.inlineNotice}>
                        <Text style={styles.inlineNoticeText}>{deleteNotice}</Text>
                    </View>
                )}

                {/* Episodes List */}
                {isLoading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={adminColors.primary} />
                    </View>
                ) : episodes.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <Ionicons name="play-circle-outline" size={64} color="#333333" />
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
                        contentContainerStyle={styles.listContent}
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
                                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                                    <Ionicons name="close" size={28} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.modalContent}>
                                <View style={styles.row}>
                                    {/* Episode Number */}
                                    <View style={[styles.formGroup, { flex: 1 }]}>
                                        <Text style={styles.label}>Número de Episodio *</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episodeForm.episode_number}
                                            onChangeText={(text) =>
                                                setEpisodeForm({ ...episodeForm, episode_number: text.replace(/[^0-9]/g, '') })
                                            }
                                            placeholder="1"
                                            keyboardType="numeric"
                                            placeholderTextColor="#808080"
                                        />
                                    </View>

                                    {/* Duration */}
                                    <View style={[styles.formGroup, { flex: 1 }]}>
                                        <Text style={styles.label}>Duración (min)</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episodeForm.duration}
                                            onChangeText={(text) =>
                                                setEpisodeForm({ ...episodeForm, duration: text.replace(/[^0-9]/g, '') })
                                            }
                                            placeholder="24"
                                            keyboardType="numeric"
                                            placeholderTextColor="#808080"
                                        />
                                    </View>
                                </View>

                                <View style={styles.row}>
                                    <View style={[styles.formGroup, { flex: 1 }]}>
                                        <Text style={styles.label}>Temporada</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episodeForm.season}
                                            onChangeText={(text) =>
                                                setEpisodeForm({ ...episodeForm, season: text.replace(/[^0-9]/g, '') })
                                            }
                                            placeholder="1"
                                            keyboardType="numeric"
                                            placeholderTextColor="#808080"
                                        />
                                    </View>
                                    <View style={[styles.formGroup, { flex: 1 }]}>
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
                                </View>

                                {/* Title */}
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Título (opcional)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={episodeForm.title}
                                        onChangeText={(text) => setEpisodeForm({ ...episodeForm, title: text })}
                                        placeholder="Título del episodio"
                                        placeholderTextColor="#808080"
                                    />
                                </View>

                                {/* Video URL */}
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>URL del Video</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={episodeForm.video_url}
                                        onChangeText={(text) => setEpisodeForm({ ...episodeForm, video_url: text })}
                                        placeholder="https://..."
                                        placeholderTextColor="#808080"
                                        autoCapitalize="none"
                                        multiline
                                    />
                                    <Text style={styles.hint}>
                                        Si lo dejas vacío, quedará como missing hasta que subas/proceses el video
                                    </Text>
                                </View>

                                <View style={styles.row}>
                                    {/* Quality */}
                                    <View style={[styles.formGroup, { flex: 1 }]}>
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

                                    {/* Storage Type */}
                                    <View style={[styles.formGroup, { flex: 1 }]}>
                                        <Text style={styles.label}>Tipo de Almacenamiento</Text>
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

                                {/* Save Button */}
                                <TouchableOpacity style={styles.saveButton} onPress={handleSaveEpisode}>
                                    <Text style={styles.saveButtonText}>
                                        {editingEpisode ? 'Guardar Cambios' : 'Agregar Episodio'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

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
                                    onPress={() => {
                                        if (deleteLoading) return;
                                        setShowDeleteModal(false);
                                    }}
                                >
                                    <Ionicons name="close" size={24} color="#FFFFFF" />
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
        case 'ready': return { backgroundColor: 'rgba(46, 204, 113, 0.15)' };
        case 'processing': return { backgroundColor: 'rgba(241, 196, 15, 0.15)' };
        case 'queued': return { backgroundColor: 'rgba(52, 152, 219, 0.15)' };
        case 'error': return { backgroundColor: 'rgba(231, 76, 60, 0.15)' };
        case 'missing':
        default: return { backgroundColor: '#262626' };
    }
}

function getEpisodeStatusTextStyle(status: string) {
    switch (status) {
        case 'ready': return { color: '#2ecc71' };
        case 'processing': return { color: '#f1c40f' };
        case 'queued': return { color: '#3498db' };
        case 'error': return { color: '#e74c3c' };
        case 'missing':
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
    headerTitleContainer: {
        flexDirection: 'column',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: adminColors.text,
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: adminColors.textSecondary,
        marginTop: 2,
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
        gap: 12,
    },
    episodeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.surface,
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    episodeCardHovered: {
        borderColor: 'rgba(117, 2, 15, 0.20)',
        backgroundColor: 'rgba(117, 2, 15, 0.06)',
        transform: [{ translateY: -2 }],
    },
    episodeInfo: {
        flex: 1,
    },
    episodeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    episodeNumber: {
        fontSize: 16,
        fontWeight: '600',
        color: adminColors.text,
    },
    badges: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    statusBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    qualityBadge: {
        backgroundColor: 'rgba(117, 2, 15, 0.10)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    storageBadge: {
        backgroundColor: adminColors.background,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    gdriveBadge: {
        backgroundColor: 'rgba(66, 133, 244, 0.15)',
    },
    r2Badge: {
        backgroundColor: 'rgba(46, 204, 113, 0.15)',
    },
    storageBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: adminColors.text,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: adminColors.primary,
    },
    episodeTitle: {
        fontSize: 14,
        color: adminColors.textSecondary,
        marginBottom: 4,
    },
    episodeUrl: {
        fontSize: 12,
        color: adminColors.textSecondary,
    },
    episodeMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    episodeMetaText: {
        fontSize: 12,
        color: adminColors.textSecondary,
        fontWeight: '600',
    },
    episodeMetaMuted: {
        fontSize: 12,
        color: adminColors.textSecondary,
        fontWeight: '600',
    },
    metaDot: {
        color: 'rgba(25, 23, 27, 0.25)',
        fontSize: 12,
        marginHorizontal: 2,
    },
    episodeActions: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 16,
    },
    iconButton: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    iconButtonDisabled: {
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        opacity: 0.8,
    },
    optionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 24,
        paddingBottom: 14,
    },
    inlineNotice: {
        marginHorizontal: 24,
        marginBottom: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(117, 2, 15, 0.06)',
        borderWidth: 1,
        borderColor: adminColors.focus,
    },
    inlineNoticeText: {
        color: adminColors.text,
        fontSize: 12,
        fontWeight: '800',
    },
    optionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
    },
    optionChipActive: {
        borderColor: 'rgba(117, 2, 15, 0.40)',
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
    },
    optionChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
    },
    optionChipTextActive: {
        color: adminColors.primary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 600,
        backgroundColor: adminColors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: adminColors.border,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: adminColors.text,
    },
    modalContent: {
        padding: 24,
    },
    confirmModalContainer: {
        width: '100%',
        maxWidth: 520,
        backgroundColor: adminColors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: adminColors.border,
        overflow: 'hidden',
    },
    confirmHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: adminColors.text,
    },
    confirmBody: {
        color: adminColors.text,
        fontSize: 14,
        fontWeight: '800',
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    deleteModeRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 14,
    },
    deleteModeChip: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
        alignItems: 'center',
    },
    deleteModeChipActive: {
        borderColor: 'rgba(117, 2, 15, 0.40)',
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
    },
    deleteModeChipDanger: {
        borderColor: 'rgba(117, 2, 15, 0.55)',
        backgroundColor: 'rgba(117, 2, 15, 0.12)',
    },
    deleteModeChipText: {
        color: adminColors.textSecondary,
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    deleteModeChipTextActive: {
        color: adminColors.text,
    },
    confirmHint: {
        color: adminColors.textSecondary,
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    confirmHintDanger: {
        color: '#FFD54F',
        fontSize: 12,
        fontWeight: '800',
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    deleteNotice: {
        paddingHorizontal: 20,
        paddingTop: 12,
        color: adminColors.text,
        fontSize: 12,
        fontWeight: '800',
    },
    confirmActions: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 20,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: adminColors.textSecondary,
        fontSize: 13,
        fontWeight: '800',
    },
    deleteButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
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
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        gap: 16,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: adminColors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
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
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
    },
    statusButtonActive: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        borderColor: adminColors.primary,
    },
    statusButtonText: {
        fontSize: 12,
        fontWeight: '800',
        color: adminColors.textSecondary,
        textTransform: 'uppercase',
    },
    statusButtonTextActive: {
        color: adminColors.primary,
    },
    qualityButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    qualityButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
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
    },
    storageButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    storageButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
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
    },
    saveButton: {
        backgroundColor: adminColors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
