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
type AnimeFormRouteProp = RouteProp<AdminStackParamList, 'AnimeForm'>;

export default function AnimeFormScreen() {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<AnimeFormRouteProp>();
    const { mode, animeId } = route.params || { mode: 'create' };
    const { width } = useWindowDimensions();
    const isCompact = width < 480;

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showTMDBSearch, setShowTMDBSearch] = useState(false);
    const [tmdbResults, setTmdbResults] = useState<any[]>([]);
    const [tmdbSearchQuery, setTmdbSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [tmdbSelectionModalVisible, setTmdbSelectionModalVisible] = useState(false);
    const [tmdbFetchedData, setTmdbFetchedData] = useState<any>(null);
    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});

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

            const parsedData = {
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
            };

            setTmdbFetchedData(parsedData);

            setSelectedFields({
                title: !formData.title.trim(),
                title_english: !formData.title_english.trim(),
                description: !formData.description.trim(),
                poster_url: !formData.poster_url.trim(),
                banner_url: !formData.banner_url.trim(),
                genres: !formData.genres.trim(),
                total_episodes: !formData.total_episodes.trim(),
                rating: !formData.rating.trim(),
                release_date: !formData.release_date.trim(),
                status: formData.status === 'Unknown',
            });

            setShowTMDBSearch(false);
            setTmdbSelectionModalVisible(true);
        } catch (error) {
            console.error('Error getting TMDB details:', error);
            Alert.alert('Error', 'No se pudieron obtener los detalles');
        } finally {
            setIsSearching(false);
        }
    };

    const applyTMDBSelection = () => {
        if (!tmdbFetchedData) return;

        const updatedData = { ...formData };
        if (selectedFields.title) updatedData.title = tmdbFetchedData.title;
        if (selectedFields.title_english) updatedData.title_english = tmdbFetchedData.title_english;
        if (selectedFields.description) updatedData.description = tmdbFetchedData.description;
        if (selectedFields.poster_url) updatedData.poster_url = tmdbFetchedData.poster_url;
        if (selectedFields.banner_url) updatedData.banner_url = tmdbFetchedData.banner_url;
        if (selectedFields.genres) updatedData.genres = tmdbFetchedData.genres;
        if (selectedFields.total_episodes) updatedData.total_episodes = tmdbFetchedData.total_episodes;
        if (selectedFields.rating) updatedData.rating = tmdbFetchedData.rating;
        if (selectedFields.release_date) updatedData.release_date = tmdbFetchedData.release_date;
        if (selectedFields.status) updatedData.status = tmdbFetchedData.status;

        updatedData.tmdb_id = tmdbFetchedData.tmdb_id;

        setFormData(updatedData);
        setTmdbSelectionModalVisible(false);
        setTmdbFetchedData(null);
        Alert.alert('Éxito', 'Campos seleccionados importados desde TMDB');
    };

    const CheckboxItem = ({ label, field }: { label: string; field: string }) => (
        <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }))}
        >
            <Ionicons
                name={selectedFields[field] ? 'checkbox' : 'square-outline'}
                size={22}
                color={selectedFields[field] ? adminColors.primary : adminColors.textSecondary}
            />
            <Text style={styles.checkboxLabel}>{label}</Text>
            {tmdbFetchedData?.[field] ? (
                <Text style={styles.checkboxPreview} numberOfLines={1}>
                    ({tmdbFetchedData[field]})
                </Text>
            ) : null}
        </TouchableOpacity>
    );

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

    const activeNavKey = mode === 'create' ? 'create' : 'anime';

    if (isLoading) {
        return (
            <AdminShell activeKey={activeNavKey}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={adminColors.primary} />
                </View>
            </AdminShell>
        );
    }

    return (
        <AdminShell activeKey={activeNavKey}>
            <SafeAreaView style={styles.container} edges={['top']}>
                <AdminHeader
                    title={mode === 'create' ? 'Nuevo Anime' : 'Editar Anime'}
                    subtitle={mode === 'edit' && animeId ? `ID #${animeId}` : 'Ficha y metadatos'}
                    onBack={() => navigation.goBack()}
                    rightSlot={
                        <TouchableOpacity
                            style={styles.tmdbButton}
                            onPress={() => setShowTMDBSearch(true)}
                        >
                            <Ionicons name="search" size={18} color="#FFFFFF" />
                            <Text style={styles.tmdbButtonText}>TMDB</Text>
                        </TouchableOpacity>
                    }
                />

                <ScrollView style={styles.content} contentContainerStyle={[styles.contentContainer, isCompact && styles.contentContainerCompact]}>
                    <View style={styles.formBlock}>
                        {(formData.poster_url || formData.banner_url) ? (
                            <View style={styles.previewContainer}>
                                {formData.banner_url ? (
                                    <Image source={{ uri: formData.banner_url }} style={styles.bannerPreview} resizeMode="cover" />
                                ) : null}
                                {formData.poster_url ? (
                                    <Image source={{ uri: formData.poster_url }} style={styles.posterPreview} resizeMode="cover" />
                                ) : null}
                            </View>
                        ) : null}

                        <Text style={styles.sectionTitle}>Información básica</Text>

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

                        <View style={styles.divider} />

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

                        <View style={styles.divider} />

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

                        <View style={styles.row}>
                            <View style={styles.rowItem}>
                                <Text style={styles.label}>Fecha de estreno</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.release_date}
                                    onChangeText={(text) => setFormData({ ...formData, release_date: text })}
                                    placeholder="2024-01-01"
                                    placeholderTextColor={adminColors.textSecondary}
                                />
                            </View>
                            <View style={styles.rowItem}>
                                <Text style={styles.label}>TMDB ID</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.tmdb_id}
                                    onChangeText={(text) => setFormData({ ...formData, tmdb_id: text })}
                                    placeholder="ID de TMDB"
                                    placeholderTextColor={adminColors.textSecondary}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

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
                            <TouchableOpacity onPress={() => setShowTMDBSearch(false)} style={styles.modalCloseBtn}>
                                <Ionicons name="close" size={22} color={adminColors.text} />
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

            {/* Modal de Selección de TMDB */}
            <Modal
                visible={tmdbSelectionModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setTmdbSelectionModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContainer, { maxHeight: '90%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>¿Qué campos importar?</Text>
                            <TouchableOpacity onPress={() => setTmdbSelectionModalVisible(false)} style={styles.modalCloseBtn}>
                                <Ionicons name="close" size={22} color={adminColors.text} />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle}>
                            Los campos que ya tenías llenos están desmarcados por defecto para no sobrescribirlos.
                        </Text>

                        <ScrollView style={{ marginBottom: 16 }}>
                            <CheckboxItem label="Título" field="title" />
                            <CheckboxItem label="Título en Inglés" field="title_english" />
                            <CheckboxItem label="Descripción" field="description" />
                            <CheckboxItem label="Póster" field="poster_url" />
                            <CheckboxItem label="Banner" field="banner_url" />
                            <CheckboxItem label="Géneros" field="genres" />
                            <CheckboxItem label="Episodios Totales" field="total_episodes" />
                            <CheckboxItem label="Calificación (Rating)" field="rating" />
                            <CheckboxItem label="Fecha de Estreno" field="release_date" />
                            <CheckboxItem label="Estado de Emisión" field="status" />
                        </ScrollView>

                        <TouchableOpacity style={styles.saveButton} onPress={applyTMDBSelection}>
                            <Text style={styles.saveButtonText}>Aplicar Selección</Text>
                        </TouchableOpacity>
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
    tmdbButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#032541',
        paddingHorizontal: 14,
        minHeight: 44,
        borderRadius: 4,
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
        padding: 20,
        paddingBottom: 40,
    },
    contentContainerCompact: {
        padding: 12,
        paddingBottom: 28,
    },
    formBlock: {
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
        backgroundColor: adminColors.surface,
        borderRadius: 4,
        padding: 16,
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
        borderRadius: 4,
        backgroundColor: adminColors.background,
    },
    posterPreview: {
        width: 70,
        height: 100,
        borderRadius: 4,
        backgroundColor: adminColors.background,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: adminColors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    divider: {
        height: 1,
        backgroundColor: adminColors.border,
        marginVertical: 18,
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
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 44,
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
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: adminColors.border,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
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
        flexWrap: 'wrap',
        gap: 12,
    },
    rowItem: {
        flex: 1,
        minWidth: 140,
    },
    saveButton: {
        marginTop: 20,
        backgroundColor: adminColors.primary,
        borderRadius: 4,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 15,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    modalContainer: {
        width: '100%',
        maxWidth: 680,
        backgroundColor: adminColors.surface,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        maxHeight: '82%',
        padding: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: adminColors.text,
    },
    modalSubtitle: {
        color: adminColors.textSecondary,
        marginBottom: 12,
        fontSize: 13,
        lineHeight: 18,
    },
    modalCloseBtn: {
        width: 44,
        height: 44,
        borderRadius: 4,
        backgroundColor: adminColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
    },
    searchButton: {
        backgroundColor: adminColors.primary,
        minWidth: 48,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tmdbResultItem: {
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 8,
        minHeight: 56,
        borderBottomWidth: 1,
        borderBottomColor: adminColors.border,
        alignItems: 'center',
    },
    tmdbResultImage: {
        width: 44,
        height: 66,
        borderRadius: 6,
    },
    tmdbResultInfo: {
        flex: 1,
        minWidth: 0,
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
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingVertical: 6,
        gap: 10,
    },
    checkboxLabel: {
        color: adminColors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    checkboxPreview: {
        color: adminColors.textSecondary,
        fontSize: 12,
        flex: 1,
    },
});
