import { backendClient } from './backendClient';

export interface NSFWAnime {
    id: string;
    slug: string;
    title: string;
    poster_path: string;
    type: string;
    is_nsfw: boolean;
}

export const nsfwApi = {
    getLatest: async (): Promise<NSFWAnime[]> => {
        try {
            const response = await backendClient.get('/api/nsfw/latest');
            return response.data;
        } catch (error) {
            console.error('Error fetching NSFW:', error);
            return [];
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
