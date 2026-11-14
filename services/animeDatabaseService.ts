interface M3UEpisode {
  season: number;
  episode: number;
  title: string;
  url: string;
}

interface M3UAnime {
  title: string;
  logo?: string;
  episodes: M3UEpisode[];
}

export interface DatabaseAnime {
  id: number;
  title: string;
  type: 'anime';
  overview: string;
  poster_url: string;
  backdrop_url: string;
  created_at: string;
  total_seasons: number;
  total_episodes: number;
  status: 'completed' | 'ongoing' | 'upcoming';
  genres: string[];
  year: number;
}

export interface DatabaseEpisode {
  id: number;
  anime_id: number;
  season: number;
  episode: number;
  title: string;
  url: string;
  duration?: number;
  created_at: string;
}

export interface DatabaseSeason {
  season: number;
  episodes: DatabaseEpisode[];
  total_episodes: number;
}

/**
 * Servicio para manejar animes en la base de datos PostgreSQL
 */
export class AnimeDatabaseService {
  private static readonly API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

  /**
   * Convierte un anime M3U a formato de base de datos
   */
  private static m3uAnimeToDatabase(anime: M3UAnime): Partial<DatabaseAnime> {
    const totalSeasons = Math.max(...anime.episodes.map((ep: M3UEpisode) => ep.season));
    const totalEpisodes = anime.episodes.length;

    return {
      title: anime.title,
      type: 'anime' as const,
      overview: `Anime con ${totalSeasons} temporada${totalSeasons > 1 ? 's' : ''} y ${totalEpisodes} episodio${totalEpisodes > 1 ? 's' : ''}`,
      poster_url: anime.logo,
      backdrop_url: anime.logo,
      total_seasons: totalSeasons,
      total_episodes: totalEpisodes,
      status: 'completed' as const,
      genres: ['Anime'],
      year: new Date().getFullYear(),
    };
  }

  /**
   * Convierte un episodio M3U a formato de base de datos
   */
  private static m3uEpisodeToDatabase(episode: M3UEpisode, animeId: number): Partial<DatabaseEpisode> {
    return {
      anime_id: animeId,
      season: episode.season,
      episode: episode.episode,
      title: episode.title,
      url: episode.url,
    };
  }

  /**
   * Sincroniza animes desde M3U a la base de datos
   */
  static async syncAnimesFromM3U(animes: M3UAnime[]): Promise<{ success: number; errors: number }> {
    let success = 0;
    let errors = 0;

    for (const anime of animes) {
      try {
        // Verificar si el anime ya existe
        const existingAnime = await this.getAnimeByTitle(anime.title);

        if (existingAnime) {
          // Actualizar anime existente
          await this.updateAnime(existingAnime.id, this.m3uAnimeToDatabase(anime));

          // Sincronizar episodios
          await this.syncEpisodes(existingAnime.id, anime.episodes);
        } else {
          // Crear nuevo anime
          const newAnime = await this.createAnime(this.m3uAnimeToDatabase(anime));
          if (newAnime) {
            await this.syncEpisodes(newAnime.id, anime.episodes);
          }
        }

        success++;
      } catch (error) {
        console.error(`Error syncing anime ${anime.title}:`, error);
        errors++;
      }
    }

    return { success, errors };
  }

  /**
   * Crea un nuevo anime en la base de datos
   */
  static async createAnime(animeData: Partial<DatabaseAnime>): Promise<DatabaseAnime | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(animeData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating anime:', error);
      return null;
    }
  }

  /**
   * Actualiza un anime existente
   */
  static async updateAnime(animeId: number, animeData: Partial<DatabaseAnime>): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${animeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(animeData),
      });

      return response.ok;
    } catch (error) {
      console.error('Error updating anime:', error);
      return false;
    }
  }

  /**
   * Obtiene un anime por título
   */
  static async getAnimeByTitle(title: string): Promise<DatabaseAnime | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/search?title=${encodeURIComponent(title)}`);

      if (!response.ok) {
        return null;
      }

      const animes = await response.json();
      return animes.length > 0 ? animes[0] : null;
    } catch (error) {
      console.error('Error getting anime by title:', error);
      return null;
    }
  }

  /**
   * Obtiene todos los animes
   */
  static async getAllAnimes(): Promise<DatabaseAnime[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting all animes:', error);
      return [];
    }
  }

  /**
   * Obtiene un anime por ID
   */
  static async getAnimeById(id: number): Promise<DatabaseAnime | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${id}`);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting anime by ID:', error);
      return null;
    }
  }

  /**
   * Sincroniza episodios de un anime
   */
  static async syncEpisodes(animeId: number, episodes: M3UEpisode[]): Promise<boolean> {
    try {
      // Primero, eliminar episodios existentes
      await this.deleteEpisodes(animeId);

      // Crear nuevos episodios
      for (const episode of episodes) {
        await this.createEpisode(animeId, this.m3uEpisodeToDatabase(episode, animeId));
      }

      return true;
    } catch (error) {
      console.error('Error syncing episodes:', error);
      return false;
    }
  }

  /**
   * Crea un nuevo episodio
   */
  static async createEpisode(animeId: number, episodeData: Partial<DatabaseEpisode>): Promise<DatabaseEpisode | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${animeId}/episodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(episodeData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating episode:', error);
      return null;
    }
  }

  /**
   * Obtiene todos los episodios de un anime
   */
  static async getAnimeEpisodes(animeId: number): Promise<DatabaseEpisode[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${animeId}/episodes`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting anime episodes:', error);
      return [];
    }
  }

  /**
   * Obtiene episodios de una temporada específica
   */
  static async getSeasonEpisodes(animeId: number, season: number): Promise<DatabaseEpisode[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${animeId}/seasons/${season}/episodes`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting season episodes:', error);
      return [];
    }
  }

  /**
   * Obtiene un episodio específico
   */
  static async getEpisode(animeId: number, season: number, episode: number): Promise<DatabaseEpisode | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${animeId}/seasons/${season}/episodes/${episode}`);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting episode:', error);
      return null;
    }
  }

  /**
   * Elimina todos los episodios de un anime
   */
  static async deleteEpisodes(animeId: number): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/${animeId}/episodes`, {
        method: 'DELETE',
      });

      return response.ok;
    } catch (error) {
      console.error('Error deleting episodes:', error);
      return false;
    }
  }

  /**
   * Busca animes por término
   */
  static async searchAnimes(query: string): Promise<DatabaseAnime[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/search?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching animes:', error);
      return [];
    }
  }

  /**
   * Obtiene animes por género
   */
  static async getAnimesByGenre(genre: string): Promise<DatabaseAnime[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/animes/genre/${encodeURIComponent(genre)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting animes by genre:', error);
      return [];
    }
  }
}
