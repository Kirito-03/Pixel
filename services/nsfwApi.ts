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
    }
};
