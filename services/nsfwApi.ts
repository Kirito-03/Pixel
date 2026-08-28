import { backendClient } from './backendClient';

export interface NSFWAnime {
    id: string;
    slug: string;
    title: string;
    poster_path: string;
    type: string;
    is_nsfw: boolean;
    synopsis?: string;
    genres?: string[];
    episodes?: { number: number }[];
}

export const nsfwApi = {
    getLatest: async (search?: string, status?: string): Promise<NSFWAnime[]> => {
        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (status) params.append('status', status);
            
            const response = await backendClient.get(`/api/nsfw/latest?${params.toString()}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching NSFW:', error);
            return [];
        }
    },
    getDetails: async (slug: string): Promise<NSFWAnime | null> => {
        try {
            const response = await backendClient.get(`/api/nsfw/details/${slug}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching NSFW details:', error);
            return null;
        }
    },
    getServers: async (slug: string, episode: number): Promise<{server: string, url: string}[]> => {
        try {
            const response = await backendClient.get(`/api/nsfw/servers/${slug}/${episode}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching NSFW servers:', error);
            return [];
        }
    }
};
