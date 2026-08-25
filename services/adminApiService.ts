import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getCurrentBaseURL } from './databaseService';

// Base URL del backend
const getAdminBaseUrl = () => {
    const envUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_SERVER_BASE_URL;
    if (envUrl) return envUrl.replace(/\/api\/?$/, '').trim();
    return Platform.select({
        android: 'http://10.0.2.2:3001', // Android emulator
        ios: 'http://localhost:3001',
        default: 'http://localhost:3001'
    });
};
const API_BASE_URL = getAdminBaseUrl();

interface AnimeData {
    tmdb_id?: number;
    title: string;
    franchise_key?: string;
    title_english?: string;
    title_japanese?: string;
    description?: string;
    poster_url?: string;
    banner_url?: string;
    genres?: string[];
    status?: string;
    total_episodes?: number;
    rating?: number;
    release_date?: string;
}

interface EpisodeData {
    anime_id: number;
    season?: number;
    episode_number: number;
    title?: string;
    video_url?: string | null;
    status?: 'missing' | 'queued' | 'processing' | 'ready' | 'error';
    storage_type?: 'gdrive' | 'local' | 'r2' | 'external';
    duration?: number;
    thumbnail_url?: string;
    file_size?: number;
    quality?: string;
}

interface DashboardStats {
    totalAnime: number;
    totalEpisodes: number;
    storageStats: Array<{
        storage_type: string;
        count: number;
    }>;
    recentAnime: any[];
}

class AdminApiService {
    public axiosInstance: AxiosInstance;

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: getCurrentBaseURL() || API_BASE_URL,
            timeout: 120000,
        });

        // Add request interceptor to include auth token
        this.axiosInstance.interceptors.request.use(
            async (config) => {
                config.baseURL = getCurrentBaseURL() || API_BASE_URL;
                const token = await AsyncStorage.getItem('admin_token');
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Add response interceptor for error handling
        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401) {
                    // Token expired or invalid
                    await AsyncStorage.removeItem('admin_token');
                }
                return Promise.reject(error);
            }
        );
    }

    // ========================================
    // Anime Management
    // ========================================

    /**
     * Get list of anime with pagination and filters
     */
    async getAnimeList(params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
    }) {
        const response = await this.axiosInstance.get('/api/admin/anime', { params });
        return response.data;
    }

    /**
     * Get anime by ID
     */
    async getAnimeById(id: number) {
        const response = await this.axiosInstance.get(`/api/admin/anime/${id}`);
        return response.data;
    }

    /**
     * Create new anime
     */
    async createAnime(data: AnimeData) {
        const response = await this.axiosInstance.post('/api/admin/anime', data);
        return response.data;
    }

    /**
     * Update anime
     */
    async updateAnime(id: number, data: Partial<AnimeData>) {
        const response = await this.axiosInstance.put(`/api/admin/anime/${id}`, data);
        return response.data;
    }

    /**
     * Delete anime (soft delete)
     */
    async deleteAnime(id: number) {
        const response = await this.axiosInstance.delete(`/api/admin/anime/${id}`);
        return response.data;
    }

    // ========================================
    // Episode Management
    // ========================================

    /**
     * Get episodes for an anime
     */
    async getEpisodes(animeId: number) {
        const response = await this.axiosInstance.get(`/api/admin/episodes/${animeId}`);
        return response.data;
    }

    /**
     * Create new episode
     */
    async createEpisode(data: EpisodeData) {
        const response = await this.axiosInstance.post('/api/admin/episodes', data);
        return response.data;
    }

    /**
     * Mark all queued episodes of an anime as ready
     */
    async markAllEpisodesReady(animeId: number) {
        const response = await this.axiosInstance.post(`/api/admin/anime/${animeId}/episodes/mark-ready`);
        return response.data;
    }

    /**
     * Update episode
     */
    async updateEpisode(id: number, data: Partial<EpisodeData>) {
        const response = await this.axiosInstance.put(`/api/admin/episodes/${id}`, data);
        return response.data;
    }

    /**
     * Delete episode (soft delete)
     */
    async deleteEpisode(id: number, opts?: { mode?: 'soft' | 'hard'; cleanup?: boolean }) {
        const mode = opts?.mode === 'hard' ? 'hard' : 'soft';
        const params =
            mode === 'hard'
                ? { mode: 'hard', cleanup: opts?.cleanup !== false }
                : undefined;
        const response = await this.axiosInstance.delete(`/api/admin/episodes/${id}`, { params });
        return response.data;
    }

    async uploadEpisodeVideo(episodeId: number, file: any) {
        const baseURL = getCurrentBaseURL() || API_BASE_URL;
        const formData = new FormData();
        formData.append('video', file);

        const response = await this.axiosInstance.post(
            `/api/admin/episodes/${episodeId}/upload-video`,
            formData,
            {
                headers: {
                    ...(Platform.OS === 'web' ? { 'X-Client-BaseURL': baseURL } : {}),
                },
            }
        );
        return response.data;
    }

    async processEpisodeVideo(episodeId: number, options?: { cleanup?: boolean }) {
        const response = await this.axiosInstance.post(
            `/api/admin/episodes/${episodeId}/process-video`,
            undefined,
            { params: options?.cleanup ? { cleanup: 1 } : undefined }
        );
        return response.data;
    }

    // ========================================
    // TMDB Integration
    // ========================================

    /**
     * Search TMDB for anime/TV shows
     */
    async searchTMDB(query: string) {
        const response = await this.axiosInstance.get('/api/admin/tmdb/search', {
            params: { q: query }
        });
        return response.data;
    }

    /**
     * Get TMDB details by ID
     */
    async getTMDBDetails(tmdbId: number) {
        const response = await this.axiosInstance.get(`/api/admin/tmdb/details/${tmdbId}`);
        return response.data;
    }

    // ========================================
    // Dashboard & Stats
    // ========================================

    /**
     * Get dashboard statistics
     */
    async getDashboardStats(): Promise<DashboardStats> {
        const response = await this.axiosInstance.get('/api/admin/stats');
        return response.data;
    }

    async importAnime(payload: any) {
        const response = await this.axiosInstance.post('/api/admin/import/anime', payload);
        return response.data;
    }

    async getImportJobs(params?: { status?: string; limit?: number }) {
        const response = await this.axiosInstance.get('/api/admin/import/jobs', { params });
        return response.data;
    }

    async getImportJobsSummary() {
        const response = await this.axiosInstance.get('/api/admin/import/jobs/summary');
        return response.data;
    }

    async retryImportJob(id: number) {
        const response = await this.axiosInstance.post(`/api/admin/import/jobs/${id}/retry`);
        return response.data;
    }

    async getUploadedM3uFiles(): Promise<{ ok: boolean; files: Array<{ name: string; url: string; localPath: string; size: number; createdAt: string }> }> {
        const response = await this.axiosInstance.get('/api/admin/import/files');
        return response.data;
    }

    async uploadM3uText(payload: { content: string; name?: string }) {
        const response = await this.axiosInstance.post('/api/admin/import/m3u/text', payload);
        return response.data;
    }

    async uploadM3uFile(file: { uri: string; name?: string; mimeType?: string } | any) {
        const formData = new FormData();
        if (file && typeof file.uri === 'string') {
            formData.append(
                'file',
                {
                    uri: file.uri,
                    name: file.name || 'playlist.m3u',
                    type: file.mimeType || 'application/octet-stream',
                } as any
            );
        } else {
            formData.append('file', file);
        }

        const response = await this.axiosInstance.post('/api/admin/import/m3u/upload', formData);
        return response.data;
    }

    // ========================================
    // News Admin
    // ========================================

    async refreshNews() {
        const response = await this.axiosInstance.post('/api/admin/news/refresh');
        return response.data;
    }
}

export const adminApiService = new AdminApiService();
