import { Platform } from 'react-native';

const API_BASE_URL = Platform.OS === 'web' 
  ? 'http://localhost:3000' 
  : 'http://192.168.1.227:3000'; // Make sure this matches backend config

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
            const response = await fetch(`${API_BASE_URL}/api/nsfw/latest`);
            if (!response.ok) throw new Error('Failed to fetch NSFW content');
            return await response.json();
        } catch (error) {
            console.error('Error fetching NSFW:', error);
            return [];
        }
    }
};
