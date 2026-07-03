import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Modal,
    FlatList,
    Image,
    Platform,
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
type AnimeFormRouteProp = RouteProp<AdminStackParamList, 'AnimeForm'>;

export default function AnimeFormScreen() {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<AnimeFormRouteProp>();
    const { mode, animeId } = route.params;

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showTMDBSearch, setShowTMDBSearch] = useState(false);
    const [tmdbResults, setTmdbResults] = useState<any[]>([]);
    const [tmdbSearchQuery, setTmdbSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        title_english: '',
        title_japanese: '',
        description: '',
        poster_url: '',
        banner_url: '',
        genres: '',
        status: 'Unknown',
        total_episodes: '',
        rating: '',
        release_date: '',
        tmdb_id: '',
    });

    useEffect(() => {
        if (mode === 'edit' && animeId) {
            loadAnime();
        }
    }, [mode, animeId]);

    const loadAnime = async () => {
        if (!animeId) return;
        try {
            setIsLoading(true);
            const data = await adminApiService.getAnimeById(animeId);
            setFormData({
                title: data.title || '',
                title_english: data.title_english || '',
                title_japanese: data.title_japanese || '',
                description: data.description || '',
                poster_url: data.poster_url || '',
                banner_url: data.banner_url || '',
                genres: data.genres?.join(', ') || '',
                status: data.status || 'Unknown',
                total_episodes: data.total_episodes?.toString() || '',
                rating: data.rating?.toString() || '',
                release_date: data.release_date || '',
                tmdb_id: data.tmdb_id?.toString() || '',
            });
        } catch (error) {
            console.error('Error loading anime:', error);
            Alert.alert('Error', 'No se pudo cargar el anime');
        } finally {
            setIsLoading(false);
        }
    };

    const searchTMDB = async (overrideQuery?: string) => {
        const queryToSearch = overrideQuery !== undefined ? overrideQuery : tmdbSearchQuery;
        if (!queryToSearch.trim()) return;

        try {
            setIsSearching(true);
            const data = await adminApiService.searchTMDB(queryToSearch);
            setTmdbResults(data.results || []);
        } catch (error) {
            console.error('Error searching TMDB:', error);
            Alert.alert('Error', 'No se pudo buscar en TMDB');
        } finally {
            setIsSearching(false);
        }
    };

    const mapTMDBStatus = (status: string) => {
        if (!status) return 'Unknown';
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes('returning') || lowerStatus.includes('airing')) return 'Airing';
        if (lowerStatus.includes('ended') || lowerStatus.includes('canceled')) return 'Finished';
        if (lowerStatus.includes('planned') || lowerStatus.includes('production')) return 'Upcoming';
        return 'Unknown';
    };

    const selectTMDBResult = async (tmdbId: number) => {
        try {
            setIsSearching(true);
            const data = await adminApiService.getTMDBDetails(tmdbId);

            setFormData({
                ...formData,
                tmdb_id: tmdbId.toString(),
                title: data.name || data.original_name || '',
                title_english: data.name || '',
                description: data.overview || '',
                poster_url: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
                banner_url: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '',
                genres: data.genres?.map((g: any) => g.name).join(', ') || '',
                total_episodes: data.number_of_episodes?.toString() || '',
                rating: data.vote_average?.toString() || '',
                release_date: data.first_air_date || '',
                status: mapTMDBStatus(data.status),
            });

            setShowTMDBSearch(false);
            Alert.alert('Éxito', 'Datos importados desde TMDB');
        } catch (error) {
            console.error('Error getting TMDB details:', error);
            Alert.alert('Error', 'No se pudieron obtener los detalles');
        } finally {
            setIsSearching(false);
        }
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            Alert.alert('Error', 'El título es requerido');
            return;
        }

        try {
            setIsSaving(true);

            const payload = {
                ...formData,
                genres: formData.genres.split(',').map((g: string) => g.trim()).filter((g: string) => g),
                total_episodes: formData.total_episodes ? parseInt(formData.total_episodes) : 0,
                rating: formData.rating ? parseFloat(formData.rating) : 0,
                tmdb_id: formData.tmdb_id ? parseInt(formData.tmdb_id) : undefined,
            };

            if (mode === 'create') {
                await adminApiService.createAnime(payload);
                if (Platform.OS === 'web') {
                    navigation.goBack();
                } else {
                    Alert.alert('Éxito', 'Anime creado exitosamente', [
                        { text: 'OK', onPress: () => navigation.goBack() }
                    ]);
                }
            } else {
                if (!animeId) throw new Error('ID de anime no encontrado');
                await adminApiService.updateAnime(animeId, payload);
                if (Platform.OS === 'web') {
                    navigation.goBack();
                } else {
                    Alert.alert('Éxito', 'Anime actualizado exitosamente', [
                        { text: 'OK', onPress: () => navigation.goBack() }
                    ]);
                }
            }
        } catch (error: any) {
            console.error('Error saving anime:', error);
            const backendMsg = error?.response?.data?.message;
            Alert.alert('Error', backendMsg || error.message || 'No se pudo guardar el anime');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <AdminShell activeKey="anime">
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={adminColors.primary} />
                </View>
            </AdminShell>
        );
    }

    return (
        <AdminShell activeKey="anime">
            <SafeAreaView style={styles.container} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {Platform.OS !== 'web' && (
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                                <Ionicons name="arrow-back" size={24} color={adminColors.text} />
                            </TouchableOpacity>
                        )}
                        <Text style={styles.headerTitle}>
                            {mode === 'create' ? 'Agregar Anime' : 'Editar Anime'}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.tmdbButton}
                        onPress={() => setShowTMDBSearch(true)}
                    >
                        <Ionicons name="search" size={20} color="#FFFFFF" />
                        <Text style={styles.tmdbButtonText}>Buscar en TMDB</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.formCard}>
                        {/* Image Previews */}
                        {(formData.poster_url || formData.banner_url) && (
                            <View style={styles.previewContainer}>
                                {formData.banner_url ? (
                                    <Image source={{ uri: formData.banner_url }} style={styles.bannerPreview} resizeMode="cover" />
                                ) : null}
                                {formData.poster_url ? (
                                    <Image source={{ uri: formData.poster_url }} style={styles.posterPreview} resizeMode="cover" />
                                ) : null}
                            </View>
                        )}

                        {/* Title */}
                        <Text style={styles.sectionTitle}>Información Básica</Text>

                        <Text style={styles.label}>Título *</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.title}
                            onChangeText={(text) => setFormData({ ...formData, title: text })}
                            placeholder="Título en español"
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        <Text style={styles.label}>Título en inglés</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.title_english}
                            onChangeText={(text) => setFormData({ ...formData, title_english: text })}
                            placeholder="Título en inglés"
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        <Text style={styles.label}>Título en japonés</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.title_japanese}
                            onChangeText={(text) => setFormData({ ...formData, title_japanese: text })}
                            placeholder="Título en japonés"
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        <Text style={styles.label}>Descripción</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={formData.description}
                            onChangeText={(text) => setFormData({ ...formData, description: text })}
                            placeholder="Sinopsis..."
                            placeholderTextColor={adminColors.textSecondary}
                            multiline
                            numberOfLines={4}
                        />

                        {/* URLs */}
                        <Text style={styles.sectionTitle}>Imágenes</Text>

                        <Text style={styles.label}>URL del Poster</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.poster_url}
                            onChangeText={(text) => setFormData({ ...formData, poster_url: text })}
                            placeholder="https://..."
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        <Text style={styles.label}>URL del Banner</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.banner_url}
                            onChangeText={(text) => setFormData({ ...formData, banner_url: text })}
                            placeholder="https://..."
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        {/* Details */}
                        <Text style={styles.sectionTitle}>Detalles</Text>

                        <Text style={styles.label}>Géneros (separados por coma)</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.genres}
                            onChangeText={(text) => setFormData({ ...formData, genres: text })}
                            placeholder="Action, Adventure, Fantasy"
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        <Text style={styles.label}>Estado</Text>
                        <View style={styles.statusContainer}>
                            {['Airing', 'Finished', 'Upcoming', 'Unknown'].map((s) => (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.statusChip, formData.status === s && styles.statusChipActive]}
                                    onPress={() => setFormData({ ...formData, status: s })}
                                >
                                    <Text style={[styles.statusChipText, formData.status === s && styles.statusChipTextActive]}>
                                        {s}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.row}>
                            <View style={styles.rowItem}>
                                <Text style={styles.label}>Total Episodios</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.total_episodes}
                                    onChangeText={(text) => setFormData({ ...formData, total_episodes: text })}
                                    placeholder="0"
                                    placeholderTextColor={adminColors.textSecondary}
                                    keyboardType="numeric"
                                />
                            </View>
                            <View style={styles.rowItem}>
                                <Text style={styles.label}>Rating</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.rating}
                                    onChangeText={(text) => setFormData({ ...formData, rating: text })}
                                    placeholder="8.5"
                                    placeholderTextColor={adminColors.textSecondary}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        <Text style={styles.label}>Fecha de estreno</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.release_date}
                            onChangeText={(text) => setFormData({ ...formData, release_date: text })}
                            placeholder="2024-01-01"
                            placeholderTextColor={adminColors.textSecondary}
                        />

                        <Text style={styles.label}>TMDB ID</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.tmdb_id}
                            onChangeText={(text) => setFormData({ ...formData, tmdb_id: text })}
                            placeholder="ID de TMDB"
                            placeholderTextColor={adminColors.textSecondary}
                            keyboardType="numeric"
                        />

                        {/* Save Button */}
                        <TouchableOpacity
                            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveButtonText}>
                                    {mode === 'create' ? 'Crear Anime' : 'Guardar Cambios'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* TMDB Search Modal */}
            <Modal visible={showTMDBSearch} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Buscar en TMDB</Text>
                            <TouchableOpacity onPress={() => setShowTMDBSearch(false)}>
                                <Ionicons name="close" size={24} color={adminColors.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchRow}>
                            <TextInput
                                style={[styles.input, styles.searchInput]}
                                value={tmdbSearchQuery}
                                onChangeText={setTmdbSearchQuery}
                                placeholder="Buscar anime..."
                                placeholderTextColor={adminColors.textSecondary}
                                onSubmitEditing={() => searchTMDB()}
                                returnKeyType="search"
                            />
                            <TouchableOpacity
                                style={styles.searchButton}
                                onPress={() => searchTMDB()}
                                disabled={isSearching}
                            >
                                {isSearching ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Ionicons name="search" size={20} color="#fff" />
                                )}
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={tmdbResults}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.tmdbResultItem}
                                    onPress={() => selectTMDBResult(item.id)}
                                >
                                    {item.poster_path && (
                                        <Image
                                            source={{ uri: `https://image.tmdb.org/t/p/w92${item.poster_path}` }}
                                            style={styles.tmdbResultImage}
                                        />
                                    )}
                                    <View style={styles.tmdbResultInfo}>
                                        <Text style={styles.tmdbResultTitle} numberOfLines={2}>
                                            {item.name || item.title}
                                        </Text>
                                        <Text style={styles.tmdbResultDate}>
                                            {item.first_air_date || item.release_date || 'Sin fecha'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </AdminShell>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: adminColors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: adminColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: adminColors.text,
    },
    tmdbButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#032541',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    tmdbButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 40,
    },
    formCard: {
        backgroundColor: adminColors.surface,
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    previewContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    bannerPreview: {
        flex: 1,
        height: 100,
        borderRadius: 10,
    },
    posterPreview: {
        width: 70,
        height: 100,
        borderRadius: 10,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '900',
        color: adminColors.text,
        marginTop: 16,
        marginBottom: 10,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
        marginTop: 10,
        marginBottom: 6,
    },
    input: {
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        borderRadius: 10,
        padding: 12,
        color: adminColors.text,
        fontSize: 14,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    statusContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    statusChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
    },
    statusChipActive: {
        backgroundColor: adminColors.primary,
        borderColor: adminColors.primary,
    },
    statusChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: adminColors.textSecondary,
    },
    statusChipTextActive: {
        color: '#fff',
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    rowItem: {
        flex: 1,
    },
    saveButton: {
        marginTop: 24,
        backgroundColor: adminColors.primary,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#fff',
        fontWeight: '900',
        fontSize: 16,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: adminColors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        padding: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: adminColors.text,
    },
    searchRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
    },
    searchButton: {
        backgroundColor: adminColors.primary,
        paddingHorizontal: 16,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tmdbResultItem: {
        flexDirection: 'row',
        gap: 12,
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
        alignItems: 'center',
    },
    tmdbResultImage: {
        width: 46,
        height: 70,
        borderRadius: 6,
    },
    tmdbResultInfo: {
        flex: 1,
    },
    tmdbResultTitle: {
        fontWeight: '700',
        color: adminColors.text,
        fontSize: 14,
    },
    tmdbResultDate: {
        color: adminColors.textSecondary,
        fontSize: 12,
        marginTop: 4,
    },
});
