import { AnimeEpisode, AnimeSeason, VideoSource } from '../types';
import { buildServerURL, getCandidateBaseURLs } from '../utils/networkUtils';
// Para React Native, necesitamos usar una forma diferente de leer archivos
// En lugar de fs nativo, usaremos fetch para obtener el archivo desde el servidor

// Tipos para el parser M3U
interface M3UEntry {
  groupTitle: string; // Nombre del anime
  tvgName: string;    // Nombre del episodio completo
  tvgLogo?: string;   // Logo/poster URL
  url: string;        // URL del video
  season?: number;    // Número de temporada
  episode?: number;   // Número de episodio
  episodeDecimal?: string; // Para episodios como 14.5
}

interface ParsedM3UData {
  [animeTitle: string]: {
    title: string;
    episodes: M3UEntry[];
  };
}

// Cache para los datos parseados
let m3uCache: ParsedM3UData | null = null;
let lastModified: number = 0;

/**
 * Normaliza un título de anime para comparación
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
    .replace(/[^\w\s]/g, ' ') // Reemplaza caracteres especiales por espacios
    .replace(/\s+/g, ' ') // Normaliza espacios
    .trim();
}

/**
 * Extrae el número de temporada y episodio del nombre del episodio
 */
function parseEpisodeInfo(tvgName: string): { season?: number; episode?: number; episodeDecimal?: string } {
  const seasonMatch = tvgName.match(/S(\d+)|Season\s*(\d+)|Temporada\s*(\d+)|T\s*(\d+)|(\d+)\s*x/i);
  const episodeMatch = tvgName.match(/E(\d+)(?:\.(\d+))?|Episode\s*(\d+)(?:\.(\d+))?|Episodio\s*(\d+)(?:\.(\d+))?|Cap(?:i|í)tulo\s*(\d+)(?:\.(\d+))?|Especial\s*(\d+)(?:\.(\d+))?|x(\d+)(?:\.(\d+))?/i);
  const season = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3] || seasonMatch[4] || seasonMatch[5] || '1', 10) : undefined;
  const episode = episodeMatch ? parseInt(episodeMatch[1] || episodeMatch[3] || episodeMatch[5] || episodeMatch[7] || episodeMatch[9] || episodeMatch[11] || '0', 10) : undefined;
  const episodeDecimal = episodeMatch && (episodeMatch[2] || episodeMatch[4] || episodeMatch[6] || episodeMatch[8] || episodeMatch[10] || episodeMatch[12]) ? (episodeMatch[2] || episodeMatch[4] || episodeMatch[6] || episodeMatch[8] || episodeMatch[10] || episodeMatch[12]) : undefined;
  return { season, episode, episodeDecimal };
}

/**
 * Extrae el título del episodio (sin el prefijo de temporada/episodio)
 */
function extractEpisodeTitle(tvgName: string): string {
  const title = tvgName.replace(/^(S\d+\s*E\d+|\d+\s*x\s*\d+)\s*[-:–—]?\s*/i, '').trim();
  return !title || title.length < 2 ? tvgName : title;
}

/**
 * Parsea una línea #EXTINF del archivo M3U
 */
function parseEXTINFLine(line: string, nextLine: string): M3UEntry | null {
  if (!line.startsWith('#EXTINF:')) return null;

  try {
    // Extraer el atributo group-title
    const groupTitleMatch = line.match(/group-title="([^"]+)"/);
    const groupTitle = groupTitleMatch ? groupTitleMatch[1] : '';

    // Extraer el atributo tvg-name
    const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
    const tvgName = tvgNameMatch ? tvgNameMatch[1] : '';

    // Extraer el atributo tvg-logo (opcional)
    const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
    const tvgLogo = tvgLogoMatch ? tvgLogoMatch[1] : undefined;

    // La siguiente línea debería ser la URL
    const url = nextLine.trim();

    if (!url || !url.startsWith('http')) {
      return null;
    }

    const { season, episode, episodeDecimal } = parseEpisodeInfo(tvgName);
    const episodeTitle = extractEpisodeTitle(tvgName);

    return {
      groupTitle,
      tvgName: episodeTitle || tvgName,
      tvgLogo,
      url,
      season,
      episode,
      episodeDecimal
    };
  } catch (error) {
    console.error('Error parsing EXTINF line:', error);
    return null;
  }
}

/**
 * Parsea el archivo M3U completo
 * En React Native, obtenemos el archivo desde el servidor
 */
export async function parseM3UFile(m3uUrl?: string): Promise<ParsedM3UData> {
  // URL por defecto para obtener el archivo M3U desde el servidor
  // Usar la misma configuración de red que el resto de la aplicación
  const serverUrl = buildServerURL();
  const envUrl = (process.env.EXPO_PUBLIC_M3U_URL || '').trim();
  const defaultUrl = m3uUrl || (envUrl ? envUrl : `${serverUrl}/videos/animes_madre.m3u`);

  try {
    // Si ya tenemos el cache, devolverlo (podríamos mejorar esto con cache con expiración)
    if (m3uCache) {
      console.log('Using cached M3U data');
      return m3uCache;
    }

    console.log('Fetching M3U file from server:', defaultUrl);

    // Intentar múltiples candidatos si falla el primero (móvil físico vs emulador)
  const candidateBases = getCandidateBaseURLs();
  const candidateUrls = [
    defaultUrl,
    ...(envUrl ? [] : candidateBases.map(b => `${b}/videos/animes_madre.m3u`))
  ]
    .filter((v, i, a) => a.indexOf(v) === i);

    let content: string | null = null;
    let lastError: any = null;
    for (const url of candidateUrls) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch M3U file: ${resp.status}`);
        content = await resp.text();
  console.log(`Fetched M3U from: ${url}`);
        break;
      } catch (e) {
        lastError = e;
  console.log(`Could not fetch M3U from: ${url} -> ${String((e as Error).message || e)}`);
      }
    }
    if (!content) {
      throw lastError || new Error('Failed to fetch M3U file');
    }
    const lines = content.split('\n');

    const parsedData: ParsedM3UData = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';

      if (line.startsWith('#EXTINF:')) {
        const entry = parseEXTINFLine(line, nextLine);

        if (entry && entry.groupTitle) {
          const normalizedTitle = normalizeTitle(entry.groupTitle);

          if (!parsedData[normalizedTitle]) {
            parsedData[normalizedTitle] = {
              title: entry.groupTitle,
              episodes: []
            };
          }

          parsedData[normalizedTitle].episodes.push(entry);
        }
      }
    }

    // Ordenar episodios por temporada y número de episodio
    for (const key in parsedData) {
      parsedData[key].episodes.sort((a, b) => {
        const seasonA = a.season || 0;
        const seasonB = b.season || 0;

        if (seasonA !== seasonB) {
          return seasonA - seasonB;
        }

        const epA = a.episode || 0;
        const epB = b.episode || 0;
        return epA - epB;
      });
    }

    // Actualizar cache
    m3uCache = parsedData;
    lastModified = Date.now();

    const animeCount = Object.keys(parsedData).length;
    const totalEpisodes = Object.values(parsedData).reduce((sum, data) => sum + data.episodes.length, 0);

  console.log(`Parsed M3U file: ${animeCount} animes, ${totalEpisodes} episodes`);

    return parsedData;
  } catch (error) {
  console.error('Error parsing M3U file:', error);
    return {};
  }
}

/**
 * Permite limpiar el cache del M3U para forzar recarga
 */
export function resetM3UCache(): void {
  m3uCache = null;
  lastModified = 0;
}

/**
 * Busca un anime en el archivo M3U por título
 */
export async function findAnimeInM3U(animeTitle: string): Promise<{
  title: string;
  episodes: M3UEntry[];
} | null> {
  const parsedData = await parseM3UFile();
  const normalizedSearchTitle = normalizeTitle(animeTitle);

  console.log(`Searching for anime: "${animeTitle}" -> normalized: "${normalizedSearchTitle}"`);
  console.log(`Available animes:`, Object.keys(parsedData).slice(0, 5));

  // Búsqueda exacta primero
  if (parsedData[normalizedSearchTitle]) {
  console.log(`Found exact match: ${normalizedSearchTitle}`);
    return parsedData[normalizedSearchTitle];
  }

  // Búsqueda parcial (el título buscado está contenido en algún título del M3U o viceversa)
  for (const [normalizedKey, data] of Object.entries(parsedData)) {
    if (normalizedKey.includes(normalizedSearchTitle) || normalizedSearchTitle.includes(normalizedKey)) {
      return data;
    }
  }

  // Búsqueda por palabras clave
  const searchWords = normalizedSearchTitle.split(' ').filter(w => w.length > 2);

  for (const [normalizedKey, data] of Object.entries(parsedData)) {
    const matches = searchWords.filter(word => normalizedKey.includes(word));
    if (matches.length >= Math.min(2, searchWords.length)) {
      return data;
    }
  }

  return null;
}

/**
 * Convierte los datos del M3U al formato StreamingInfo
 */
export async function getStreamingInfoFromM3U(animeTitle: string): Promise<{
  seasons: AnimeSeason[];
  totalEpisodes: number;
  image?: string;
} | null> {
  const animeData = await findAnimeInM3U(animeTitle);

  if (!animeData || animeData.episodes.length === 0) {
    return null;
  }

  // Agrupar episodios por temporada
  const seasonsMap: { [season: number]: M3UEntry[] } = {};

  for (const episode of animeData.episodes) {
    const seasonNum = episode.season || 1;
    if (!seasonsMap[seasonNum]) {
      seasonsMap[seasonNum] = [];
    }
    seasonsMap[seasonNum].push(episode);
  }

  // Convertir a formato AnimeSeason
  const seasons: AnimeSeason[] = Object.entries(seasonsMap).map(([seasonNum, episodes]) => {
    const seasonNumber = parseInt(seasonNum, 10);

    const animeEpisodes: AnimeEpisode[] = episodes.map((ep, index) => {
      const episodeNumber = ep.episode || index + 1;
      // Base ID por temporada/episodio
      let episodeId = ep.episodeDecimal
        ? `m3u-${animeData.title}-s${seasonNumber}-e${episodeNumber}-${ep.episodeDecimal}`
        : `m3u-${animeData.title}-s${seasonNumber}-e${episodeNumber}`;

      // Asegurar unicidad cuando no hay número de episodio (OVA, especiales, etc.)
      if (ep.episode == null) {
        const titleSlug = normalizeTitle(ep.tvgName).replace(/\s+/g, '-');
        episodeId = `${episodeId}-${titleSlug}`;
      }

      // Debug: verificar claves generadas
  console.log(`Generated episode ID: ${episodeId} for ${ep.tvgName}`);

      return {
        id: episodeId,
        number: episodeNumber,
        title: ep.tvgName,
        image: ep.tvgLogo,
        url: ep.url,
        sources: [{
          url: ep.url
        }] as VideoSource[]
      };
    });

    return {
      id: `season-${seasonNumber}`,
      title: `Temporada ${seasonNumber}`,
      season: seasonNumber,
      episodes: animeEpisodes
    };
  });

  const totalEpisodes = animeData.episodes.length;
  // Elegir una imagen de portada: usar el primer tvg-logo disponible
  const firstLogo = animeData.episodes.find(e => !!e.tvgLogo)?.tvgLogo;

  return {
    seasons,
    totalEpisodes,
    image: firstLogo
  };
}

/**
 * Obtiene las fuentes de video (VideoSource) para un episodio específico
 */
export async function getEpisodeSourcesFromM3U(
  animeTitle: string,
  season: number,
  episodeNumber: number
): Promise<VideoSource[] | null> {
  const animeData = await findAnimeInM3U(animeTitle);

  if (!animeData) {
    return null;
  }
  // Filtrar por temporada primero
  const seasonEpisodes = animeData.episodes.filter(ep => (ep.season || 1) === season);

  if (seasonEpisodes.length === 0) {
    return null;
  }

  // Intentar coincidencia directa por número de episodio si está presente
  const directMatch = seasonEpisodes.find(ep => ep.episode === episodeNumber);

  // Si no hay número de episodio en M3U, usar la posición ordenada dentro de la temporada
  const byIndex = seasonEpisodes[episodeNumber - 1];

  const episode = directMatch || byIndex;

  if (!episode) {
    return null;
  }

  return [{
    url: episode.url
  }];
}

/**
 * Obtiene la lista de animes disponibles en el archivo M3U
 */
export const getAvailableAnimes = async (): Promise<Array<{title: string, episodeCount: number, image?: string}>> => {
  try {
    const m3uData = await parseM3UFile();
    if (!m3uData) {
      return [];
    }

    const animes = Object.values(m3uData).map(animeData => ({
      title: animeData.title,
      episodeCount: animeData.episodes.length,
      image: animeData.episodes[0]?.tvgLogo // Usar la imagen del primer episodio
    }));

    // Ordenar alfabéticamente
    animes.sort((a, b) => a.title.localeCompare(b.title));

    console.log(`Found ${animes.length} animes in M3U file`);
    return animes;
  } catch (error) {
  console.error('Error getting available animes from M3U:', error);
    return [];
  }
}

/**
 * Obtiene todas las fuentes de video para un episodio por su URL directa
 */
export async function getSourcesByURL(url: string): Promise<VideoSource[]> {
  return [{
    url
  }];
}

/**
 * Función de debug para verificar el funcionamiento del M3U
 */
export const debugM3U = async (): Promise<void> => {
  try {
  console.log('DEBUG: Testing M3U parser...');

    // Probar parseo del archivo
    const m3uData = await parseM3UFile();
    if (!m3uData) {
  console.log('DEBUG: No M3U data found');
      return;
}


  console.log(`DEBUG: M3U file parsed successfully. Found ${Object.keys(m3uData).length} animes`);

    // Mostrar algunos animes de ejemplo
    const animeTitles = Object.keys(m3uData).slice(0, 5);
    console.log('DEBUG: Sample animes found:', animeTitles);

    // Probar búsqueda de un anime específico
    const testAnime = animeTitles[0];
    if (testAnime) {
  console.log(`DEBUG: Testing search for "${testAnime}"`);
      const streamingInfo = await getStreamingInfoFromM3U(testAnime);
      if (streamingInfo) {
  console.log(`DEBUG: Found streaming info for "${testAnime}":`, {
          totalEpisodes: streamingInfo.totalEpisodes,
          seasons: streamingInfo.seasons.length,
          hasImage: !!streamingInfo.image
        });

        // Probar búsqueda de episodio
        if (streamingInfo.seasons[0]?.episodes[0]) {
          const firstEpisode = streamingInfo.seasons[0].episodes[0];
  console.log(`DEBUG: First episode:`, {
            title: firstEpisode.title,
            hasUrl: !!firstEpisode.url,
            hasImage: !!firstEpisode.image
          });
        }
      } else {
  console.log(`DEBUG: No streaming info found for "${testAnime}"`);
      }
    }

  console.log('DEBUG: M3U test completed successfully');
  } catch (error) {
  console.error('DEBUG: M3U test failed:', error);
  }
};

export const validateM3U = async (): Promise<{
  totalAnimes: number;
  totalEpisodes: number;
  issues: { title: string; missingSeason: number; missingEpisode: number; total: number }[];
}> => {
  const data = await parseM3UFile();
  const keys = Object.keys(data);
  const issues: { title: string; missingSeason: number; missingEpisode: number; total: number }[] = [];
  let totalEpisodes = 0;
  for (const k of keys) {
    const d = data[k];
    const missingSeason = d.episodes.filter(e => e.season == null).length;
    const missingEpisode = d.episodes.filter(e => e.episode == null).length;
    const total = d.episodes.length;
    totalEpisodes += total;
    if (missingSeason > 0 || missingEpisode > 0) {
      issues.push({ title: d.title, missingSeason, missingEpisode, total });
    }
  }
  issues.sort((a, b) => (b.missingSeason + b.missingEpisode) - (a.missingSeason + a.missingEpisode));
  console.log('M3U validation summary', { totalAnimes: keys.length, totalEpisodes, issuesPreview: issues.slice(0, 5) });
  return { totalAnimes: keys.length, totalEpisodes, issues };
};
