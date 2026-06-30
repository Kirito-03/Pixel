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

    const selectTMDBResult = async (tmdbId: number) => {
        try {
            setIsSearching(true);
            const data = await adminApiService.getTMDBDetails(tmdbId);

            // Autocompletar formulario con datos de TMDB
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

    const mapTMDBStatus = (status: string) => {
        if (!status) return 'Unknown';
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes('returning') || lowerStatus.includes('airing')) return 'Airing';
        if (lowerStatus.includes('ended') || lowerStatus.includes('canceled')) return 'Finished';
        if (lowerStatus.includes('planned') || lowerStatus.includes('production')) return 'Upcoming';
        return 'Unknown';
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
                genres: formData.genres.split(',').map(g => g.trim()).filter(g => g),
                total_episodes: formData.total_episodes ? parseInt(formData.total_episodes) : 0,
                rating: formData.rating ? parseFloat(formData.rating) : 0,
                tmdb_id: formData.tmdb_id ? parseInt(formData.tmdb_id) : undefined,
            };

            if (mode === 'create') {
                await adminApiService.createAnime(payload);
                Alert.alert('Éxito', 'Anime creado exitosamente', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                if (!animeId) throw new Error('ID de anime no encontrado');
                await adminApiService.updateAnime(animeId, payload);
                Alert.alert('Éxito', 'Anime actualizado exitosamente', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
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

                        {/* Título y Autocomplete */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Título *</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.input}
                                    value={formData.title}
                                    onChangeText={(text) => {
                                        setFormData({ ...formData, title: text });
                                    }}
                                    placeholder="Nombre del anime"
                                    placeholderTextColor="#808080"
                                />
                                <TouchableOpacity
                                    style={styles.searchIcon}
                                    onPress={() => {
                                        setTmdbSearchQuery(formData.title);
                                        setShowTMDBSearch(true);
                                        searchTMDB(formData.title);
                                    }}
                                >
                                    <Ionicons name="cloud-download-outline" size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.row}>
                            {/* Título en Inglés */}
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Título en Inglés</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.title_english}
                                    onChangeText={(text) => setFormData({ ...formData, title_english: text })}
                                    placeholder="English title"
                                    placeholderTextColor="#808080"
                                />
                            </View>

                            {/* Total Episodios */}
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.label}>Total de Episodios</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.total_episodes}
                                    onChangeText={(text) => setFormData({ ...formData, total_episodes: text.replace(/[^0-9]/g, '') })}
                                    placeholder="12"
                                    placeholderTextColor="#808080"
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        {/* Descripción */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Descripción</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                value={formData.description}
                                onChangeText={(text) => setFormData({ ...formData, description: text })}
                                placeholder="Sinopsis del anime"
                                placeholderTextColor="#808080"
                                multiline
                                numberOfLines={4}
                            />
                        </View>

                        <View style={styles.row}>
                            {/* Poster URL */}
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.label}>URL del Póster</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.poster_url}
                                    onChangeText={(text) => setFormData({ ...formData, poster_url: text })}
                                    placeholder="https://..."
                                    placeholderTextColor="#808080"
                                    autoCapitalize="none"
                                />
                            </View>

                            {/* Banner URL */}
                            <View style={[styles.formGroup, { flex: 1 }]}>
                                <Text style={styles.label}>URL del Banner</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.banner_url}
                                    onChangeText={(text) => setFormData({ ...formData, banner_url: text })}
                                    placeholder="https://..."
                                    placeholderTextColor="#808080"
                                    autoCapitalize="none"
                                />
                            </View>
                        </View>

                        {/* Géneros */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Géneros (separados por coma)</Text>
                            <TextInput
                                style={styles.input}
                                value={formData.genres}
                                onChangeText={(text) => setFormData({ ...formData, genres: text })}
                                placeholder="Acción, Aventura, Fantasía"
                                placeholderTextColor="#808080"
                            />
                        </View>

                        {/* Estado */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Estado</Text>
                            <View style={styles.statusButtons}>
                                {['Airing', 'Finished', 'Upcoming'].map((status) => (
                                    <TouchableOpacity
                                        key={status}
                                        style={[
                                            styles.statusButton,
                                            formData.status === status && styles.statusButtonActive
                                        ]}
                                        onPress={() => setFormData({ ...formData, status })}
                                    >
                                        <Text style={[
                                            styles.statusButtonText,
                                            formData.status === status && styles.statusButtonTextActive
                                        ]}>
                                            {status}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.saveButtonText}>
                                    {mode === 'create' ? 'Crear Anime' : 'Guardar Cambios'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                {/* TMDB Search Modal */}
                <Modal
                    visible={showTMDBSearch}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowTMDBSearch(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContainer}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Buscar en TMDB</Text>
                                <TouchableOpacity onPress={() => setShowTMDBSearch(false)}>
                                    <Ionicons name="close" size={28} color={adminColors.text} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.modalSearchContainer}>
                                <TextInput
                                    style={styles.modalSearchInput}
                                    value={tmdbSearchQuery}
                                    onChangeText={setTmdbSearchQuery}
                                    placeholder="Buscar anime..."
                                    placeholderTextColor="#808080"
                                    onSubmitEditing={() => searchTMDB()}
                                />
                                <TouchableOpacity style={styles.modalSearchButton} onPress={() => searchTMDB()}>
                                    <Ionicons name="search" size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>

                            {isSearching ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color={adminColors.primary} />
                                </View>
                            ) : (
                                <FlatList
                                    data={tmdbResults}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={styles.tmdbResultItem}
                                            onPress={() => selectTMDBResult(item.id)}
                                        >
                                            <Image
                                                source={{ uri: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'https://via.placeholder.com/100x150' }}
                                                style={styles.tmdbResultImage}
                                            />
                                            <View style={styles.tmdbResultInfo}>
                                                <Text style={styles.tmdbResultTitle}>{item.name || item.original_name}</Text>
                                                <Text style={styles.tmdbResultOverview} numberOfLines={2}>
                                                    {item.overview || 'Sin descripción'}
                                                </Text>
                                                <Text style={styles.tmdbResultDate}>
                                                    {item.first_air_date ? `Estreno: ${item.first_air_date}` : ''}
                                                </Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={20} color={adminColors.textSecondary} />
                                        </TouchableOpacity>
                                    )}
                                    contentContainerStyle={styles.tmdbResultsList}
                                    ListEmptyComponent={
                                        tmdbSearchQuery && !isSearching ? (
                                            <View style={styles.emptyContainer}>
                                                <Text style={styles.emptyText}>No se encontraron resultados en TMDB</Text>
                                            </View>
                                        ) : null
                                    }
                                />
                            )}
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
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
    tmdbButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.ink,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
    },
    tmdbButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    formCard: {
        backgroundColor: adminColors.surface,
        borderRadius: 8,
        padding: 24,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    row: {
        flexDirection: 'row',
        gap: 16,
    },
    previewContainer: {
        marginBottom: 32,
        alignItems: 'center',
    },
    bannerPreview: {
        width: '100%',
        height: 160,
        borderRadius: 8,
        marginBottom: -50,
        opacity: 0.6,
    },
    posterPreview: {
        width: 120,
        height: 180,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: adminColors.primary,
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
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    searchIcon: {
        padding: 12,
        backgroundColor: adminColors.background,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    input: {
        flex: 1,
        backgroundColor: adminColors.surface,
        borderWidth: 1,
        borderColor: adminColors.border,
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: adminColors.text,
    },
    textArea: {
        minHeight: 120,
        textAlignVertical: 'top',
    },
    statusButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    statusButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.surface,
        alignItems: 'center',
    },
    statusButtonActive: {
        backgroundColor: 'rgba(117, 2, 15, 0.08)',
        borderColor: adminColors.primary,
    },
    statusButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: adminColors.textSecondary,
    },
    statusButtonTextActive: {
        color: adminColors.primary,
    },
    saveButton: {
        backgroundColor: adminColors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 16,
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 700,
        maxHeight: '80%',
        backgroundColor: adminColors.surface,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: adminColors.border,
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
    modalSearchContainer: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        paddingBottom: 16,
        gap: 12,
    },
    modalSearchInput: {
        flex: 1,
        backgroundColor: adminColors.background,
        borderWidth: 1,
        borderColor: adminColors.border,
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: adminColors.text,
    },
    modalSearchButton: {
        backgroundColor: adminColors.primary,
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tmdbResultsList: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    tmdbResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: adminColors.surface,
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: adminColors.border,
    },
    tmdbResultImage: {
        width: 60,
        height: 90,
        borderRadius: 4,
        marginRight: 16,
        backgroundColor: '#262626',
    },
    tmdbResultInfo: {
        flex: 1,
        marginRight: 12,
    },
    tmdbResultTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: adminColors.text,
        marginBottom: 6,
    },
    tmdbResultOverview: {
        fontSize: 13,
        color: adminColors.textSecondary,
        marginBottom: 8,
        lineHeight: 18,
    },
    tmdbResultDate: {
        fontSize: 12,
        color: adminColors.textSecondary,
        fontWeight: '500',
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
    },
    emptyText: {
        color: adminColors.textSecondary,
        fontSize: 15,
        textAlign: 'center',
    }
});
