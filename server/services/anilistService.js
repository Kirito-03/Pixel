/**
 * anilistService.js
 * Consultas a la API de AniList (GraphQL, gratuita y sin key)
 * Usado por el Smart Bot para autocompletar metadatos de animes.
 */
import axios from 'axios';

const ANILIST_URL = 'https://graphql.anilist.co';

const MEDIA_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME) {
    id
    title {
      romaji
      english
      native
    }
    description(asHtml: false)
    coverImage {
      extraLarge
      large
    }
    bannerImage
    genres
    averageScore
    episodes
    status
    startDate {
      year
      month
      day
    }
    studios(isMain: true) {
      nodes { name }
    }
  }
}
`;

/**
 * Busca un anime por título en AniList y devuelve sus metadatos.
 * @param {string} title - Título del anime a buscar
 * @returns {Promise<object|null>} Metadatos del anime o null si no se encontró
 */
export async function searchAniListMetadata(title) {
  try {
    const response = await axios.post(
      ANILIST_URL,
      {
        query: MEDIA_QUERY,
        variables: { search: title },
      },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15000,
      }
    );

    const media = response.data?.data?.Media;
    if (!media) return null;

    const startDate = media.startDate;
    const releaseDate =
      startDate?.year
        ? `${startDate.year}-${String(startDate.month || 1).padStart(2, '0')}-${String(startDate.day || 1).padStart(2, '0')}`
        : null;

    return {
      title: media.title.romaji || media.title.english || title,
      title_english: media.title.english || '',
      title_japanese: media.title.native || '',
      description: media.description || '',
      poster_url: media.coverImage?.extraLarge || media.coverImage?.large || '',
      banner_url: media.bannerImage || '',
      genres: media.genres || [],
      rating: media.averageScore ? media.averageScore / 10 : null, // AniList usa escala 0-100
      total_episodes: media.episodes || null,
      status: mapAniListStatus(media.status),
      release_date: releaseDate,
      anilist_id: media.id,
    };
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn('[AniList] Rate limit alcanzado, esperando 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return searchAniListMetadata(title); // Reintentar
    }
    console.error('[AniList] Error buscando:', title, error.message);
    return null;
  }
}

function mapAniListStatus(status) {
  const map = {
    FINISHED: 'Finished',
    RELEASING: 'Airing',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Finished',
    HIATUS: 'Airing',
  };
  return map[status] || 'Unknown';
}
