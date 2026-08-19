/**
 * animeav1Scraper.js
 * Scraper para animeav1.com
 *
 * ESTRATEGIA:
 * 1. Buscar el slug del anime en animeav1.com/catalogo?search={title}
 * 2. Para cada episodio ir a animeav1.com/media/{slug}/{epNumber}
 * 3. Extraer el JSON embebido de SvelteKit del HTML (sin ejecutar JS)
 * 4. Tomar el servidor de video según prioridad: HLS > Voe > MP4Upload > Mega > Byse
 * 5. Devolver lista de { episode_number, video_url, all_servers }
 */
import axios from 'axios';

const BASE_URL = 'https://animeav1.com';
const TIMEOUT = 25000;
const DELAY_MS = 1200; // Delay entre peticiones para no ser bloqueados

/** Espera N milisegundos */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Headers para parecer un navegador real */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.8,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Prioridad de servidores de video.
 * Voe, MP4Upload y Mega primero porque permiten embed sin Referer.
 */
const SERVER_PRIORITY = ['Voe', 'MP4Upload', 'Mega', 'Byse', 'HLS'];

/**
 * Verifica de forma asíncrona si la URL responde correctamente (no está bloqueada por Cloudflare/404).
 * Retorna la primera URL que funcione según la prioridad.
 * @param {Array<{server: string, url: string}>} servers
 * @returns {Promise<string|null>}
 */
async function pickWorkingServer(servers) {
  if (!servers || servers.length === 0) return null;
  
  const ordered = [];
  for (const preferred of SERVER_PRIORITY) {
    const found = servers.find(s => s.server === preferred);
    if (found) ordered.push(found);
  }
  for (const s of servers) {
    if (!ordered.find(o => o.server === s.server)) ordered.push(s);
  }

  for (const server of ordered) {
    try {
      await axios.get(server.url, {
        headers: BROWSER_HEADERS,
        timeout: 3000,
        validateStatus: status => status >= 200 && status < 400
      });
      return server.url;
    } catch (e) {
      console.log(`[AV1Scraper] Servidor ${server.server} descartado: ${e.message}`);
    }
  }
  
  // Fallback si todos fallan
  return ordered[0]?.url || null;
}

/**
 * Parsea los datos de la página de episodio desde el HTML de SvelteKit.
 * Extrae embeds, downloads, y metadatos del anime.
 * @param {string} html
 * @returns {{ media: object|null, episode: object|null, embeds: object, downloads: object }}
 */
function parseEpisodePage(html) {
  try {
    // Parsear embeds: {server:"X",url:"Y"}
    const embedsRaw = html.match(/embeds:\{SUB:\[([\s\S]*?)\](?:,DUB)?/);
    let embeds = { SUB: [] };
    if (embedsRaw) {
      const serverMatches = [...embedsRaw[1].matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
      embeds.SUB = serverMatches.map(m => ({ server: m[1], url: m[2] }));
    }

    // Parsear downloads
    const downloadsRaw = html.match(/downloads:\{SUB:\[([\s\S]*?)\]/);
    let downloads = { SUB: [] };
    if (downloadsRaw) {
      const dlMatches = [...downloadsRaw[1].matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
      downloads.SUB = dlMatches.map(m => ({ server: m[1], url: m[2] }));
    }

    // Parsear metadatos del anime
    const titleMatch = html.match(/,title:"([^"]+)",aka:/);
    const synopsisMatch = html.match(/synopsis:"((?:[^"\\]|\\.)*)"/);
    const scoreMatch = html.match(/score:([\d.]+)/);
    const startDateMatch = html.match(/startDate:"([^"]+)"/);
    const statusMatch = html.match(/,status:(\d+),/);
    const episodesCountMatch = html.match(/episodesCount:(\d+)/);
    const malIdMatch = html.match(/,malId:(\d+),seasons:/);
    const slugMatch = html.match(/,slug:"([^"]+)",malId:\d+,seasons/);
    const trailerMatch = html.match(/trailer:"([^"]+)"/);
    const posterMatch = html.match(/poster:"([^"]+)"/);
    const backdropMatch = html.match(/backdrop:"([^"]+)"/);

    // Parsear géneros: {id:N,name:"X",...}
    const genresRaw = html.match(/genres:\[([\s\S]*?)\],synopsis:/);
    let genres = [];
    if (genresRaw) {
      const genreMatches = [...genresRaw[1].matchAll(/name:"([^"]+)"/g)];
      genres = genreMatches.map(m => m[1]);
    }

    const statusMap = { '1': 'Upcoming', '2': 'Releasing', '3': 'Finished' };

    const media = {
      title: titleMatch ? titleMatch[1] : null,
      synopsis: synopsisMatch ? synopsisMatch[1].replace(/\\n/g, '\n') : null,
      score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
      startDate: startDateMatch ? startDateMatch[1] : null,
      status: statusMatch ? (statusMap[statusMatch[1]] || 'Unknown') : 'Unknown',
      episodesCount: episodesCountMatch ? parseInt(episodesCountMatch[1]) : null,
      malId: malIdMatch ? parseInt(malIdMatch[1]) : null,
      slug: slugMatch ? slugMatch[1] : null,
      trailer: trailerMatch ? trailerMatch[1] : null,
      poster: posterMatch ? posterMatch[1] : null,
      backdrop: backdropMatch ? backdropMatch[1] : null,
      genres,
    };

    // Parsear episodio actual
    const episodeMatch = html.match(/episode:\{id:(\d+),mediaId:\d+,title:[^,]*,number:(\d+)/);
    const episode = episodeMatch
      ? { id: parseInt(episodeMatch[1]), number: parseInt(episodeMatch[2]) }
      : null;

    return { media, episode, embeds, downloads };
  } catch (err) {
    console.error('[AV1Scraper] Error parseando página:', err.message);
    return { media: null, episode: null, embeds: { SUB: [] }, downloads: { SUB: [] } };
  }
}

/**
 * Busca un anime en animeav1.com y devuelve su slug.
 * @param {string} title - Título del anime
 * @returns {Promise<string|null>} slug del anime o null
 */
export async function findAnimeAv1Slug(title) {
  try {
    const query = encodeURIComponent(title.trim());
    const searchUrl = `${BASE_URL}/catalogo?search=${query}`;

    const response = await axios.get(searchUrl, {
      headers: BROWSER_HEADERS,
      timeout: TIMEOUT,
    });

    const html = response.data;

    // Extraer resultados del JSON embebido de SvelteKit
    // Formato: results:[{id:"...",title:"...",slug:"...",...}]
    const resultsMatch = html.match(/results:\[(\{[\s\S]*?)\],uses:/);
    if (!resultsMatch) {
      // Fallback: buscar hrefs en el HTML
      const hrefMatches = [...html.matchAll(/href="\/media\/([^"]+)"/g)];
      if (hrefMatches.length > 0) {
        const firstSlug = hrefMatches[0][1].split('/')[0];
        console.log(`[AV1Scraper] Slug via href para "${title}": "${firstSlug}"`);
        return firstSlug;
      }
      console.warn(`[AV1Scraper] No se encontraron resultados para "${title}"`);
      return null;
    }

    // Parsear slugs y títulos
    const slugMatches = [...resultsMatch[1].matchAll(/slug:"([^"]+)"/g)];
    const titleMatches = [...resultsMatch[1].matchAll(/title:"([^"]+)"/g)];

    if (slugMatches.length === 0) return null;

    // Encontrar la mejor coincidencia
    let bestSlug = null;
    let bestScore = 0;

    for (let i = 0; i < slugMatches.length; i++) {
      const resultTitle = titleMatches[i]?.[1] || '';
      const resultSlug = slugMatches[i][1];
      const score = titleSimilarity(title, resultTitle);

      if (score > bestScore) {
        bestScore = score;
        bestSlug = resultSlug;
      }
    }

    if (bestSlug && bestScore >= 0.25) {
      console.log(`[AV1Scraper] Slug encontrado para "${title}": "${bestSlug}" (score: ${bestScore.toFixed(2)})`);
      return bestSlug;
    }

    // Fallback: usar el primer resultado si hay al menos uno
    if (slugMatches.length > 0) {
      const firstSlug = slugMatches[0][1];
      console.warn(`[AV1Scraper] Score bajo para "${title}" (${bestScore.toFixed(2)}), usando primer resultado: ${firstSlug}`);
      return firstSlug;
    }

    console.warn(`[AV1Scraper] No se encontró slug para "${title}"`);
    return null;
  } catch (error) {
    console.error(`[AV1Scraper] Error buscando slug para "${title}":`, error.message);
    return null;
  }
}

/**
 * Obtiene los metadatos del anime desde su página en animeav1.com.
 * Visita el episodio 1 para obtener datos completos del media.
 * @param {string} slug - Slug del anime
 * @returns {Promise<object>} Metadatos del anime
 */
export async function getAnimeAv1PageData(slug) {
  try {
    const url = `${BASE_URL}/media/${slug}/1`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: TIMEOUT });
    const { media } = parseEpisodePage(response.data);
    return media || { slug, title: null, episodesCount: null };
  } catch (error) {
    console.error(`[AV1Scraper] Error obteniendo datos de "${slug}":`, error.message);
    return { slug, title: null, episodesCount: null };
  }
}

/**
 * Extrae los servidores de video para un episodio específico.
 * @param {string} slug - Slug del anime
 * @param {number} episodeNumber - Número del episodio
 * @returns {Promise<{video_url: string|null, all_servers: Array, downloads: Array}>}
 */
export async function getAnimeAv1EpisodeServers(slug, episodeNumber) {
  try {
    const url = `${BASE_URL}/media/${slug}/${episodeNumber}`;
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: TIMEOUT,
    });

    const { embeds, downloads } = parseEpisodePage(response.data);

    if (!embeds.SUB || embeds.SUB.length === 0) {
      return { video_url: null, all_servers: [], downloads: [] };
    }

    const video_url = await pickWorkingServer(embeds.SUB);

    return {
      video_url,
      all_servers: embeds.SUB,
      downloads: downloads?.SUB || [],
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return { video_url: null, all_servers: [], downloads: [] };
    }
    console.error(`[AV1Scraper] Error en ep ${episodeNumber} de "${slug}":`, error.message);
    return { video_url: null, all_servers: [], downloads: [] };
  }
}

/**
 * Scrape completo de todos los episodios de un anime en animeav1.com
 * @param {string} slug - Slug del anime
 * @param {object} options
 * @param {number} options.fromEpisode - Episodio desde el que empezar (default: 1)
 * @param {number} options.toEpisode - Episodio hasta el que llegar (default: auto-detect)
 * @param {Function} options.onProgress - Callback de progreso (episodio, total)
 * @returns {Promise<Array<{episode_number: number, video_url: string, all_servers: Array}>>}
 */
export async function scrapeAnimeAv1Episodes(slug, options = {}) {
  const { fromEpisode = 1, toEpisode = null, onProgress = null } = options;

  // Obtener metadatos del anime para saber el total de episodios
  const pageData = await getAnimeAv1PageData(slug);
  const maxEpisode = toEpisode || pageData.episodesCount || 500;

  console.log(`[AV1Scraper] Scrapeando "${slug}" eps ${fromEpisode}-${maxEpisode}`);

  const results = [];

  for (let epNum = fromEpisode; epNum <= maxEpisode; epNum++) {
    await sleep(DELAY_MS);

    const { video_url, all_servers } = await getAnimeAv1EpisodeServers(slug, epNum);

    if (video_url) {
      results.push({ episode_number: epNum, video_url, all_servers });
      const serverNames = all_servers.map(s => s.server).join('/');
      console.log(`[AV1Scraper] ✓ Ep ${epNum} [${serverNames}]: ${video_url.substring(0, 70)}...`);
    } else {
      console.warn(`[AV1Scraper] ✗ Ep ${epNum}: no encontrado, deteniéndose.`);
      break;
    }

    if (onProgress) onProgress(epNum, maxEpisode);
  }

  return results;
}

/** Calcula similitud de títulos entre 0 y 1 */
function titleSimilarity(a, b) {
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const A = new Set(normalize(a).split(' ').filter(Boolean));
  const B = new Set(normalize(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const word of A) if (B.has(word)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/**
 * Scrapea los animes actualmente en emisión desde animeav1.com/catalogo.
 * Equivalente a scrapeAiringAnimes de JKAnime, retorna lista de slugs.
 * @param {number} maxPages - Páginas del catálogo a revisar (default: 3)
 * @returns {Promise<string[]>} Lista de slugs de animes en emisión
 */
export async function scrapeAiringAnimesAv1(maxPages = 3) {
  const slugs = new Set();

  for (let page = 1; page <= maxPages; page++) {
    try {
      // Filtrar por estado "Releasing" (status=2 en animeav1) y ordenar por recientes
      const url = `${BASE_URL}/catalogo?page=${page}&status=2&order=updated`;
      console.log(`[AV1Scraper] Scrapeando catálogo página ${page}: ${url}`);

      const response = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: TIMEOUT,
      });

      const html = response.data;

      // Extraer slugs de las cards del catálogo
      // Formato href="/media/{slug}" o href="/media/{slug}/{ep}"
      const hrefMatches = [...html.matchAll(/href="\/media\/([^/"]+)(?:\/\d+)?"/g)];
      let pageCount = 0;

      for (const match of hrefMatches) {
        const slug = match[1];
        if (slug && !slugs.has(slug)) {
          slugs.add(slug);
          pageCount++;
        }
      }

      // También intentar extraer del JSON de SvelteKit si está disponible
      const jsonMatches = [...html.matchAll(/slug:"([^"]+)"/g)];
      for (const match of jsonMatches) {
        const slug = match[1];
        if (slug && !slugs.has(slug)) {
          slugs.add(slug);
          pageCount++;
        }
      }

      console.log(`[AV1Scraper] Página ${page}: ${pageCount} slugs encontrados`);

      if (pageCount === 0) {
        console.log(`[AV1Scraper] Página ${page} vacía, deteniendo.`);
        break;
      }

      if (page < maxPages) await sleep(DELAY_MS);
    } catch (error) {
      console.error(`[AV1Scraper] Error en página ${page}:`, error.message);
      break;
    }
  }

  const result = Array.from(slugs);
  console.log(`[AV1Scraper] Total animes en emisión encontrados: ${result.length}`);
  return result;
}

/**
 * Scrapea el catálogo completo de animeav1.com sin filtros de estado.
 * Se usa para sincronizar animes antiguos.
 * @param {number} startPage - Página inicial
 * @param {number} endPage - Página final
 * @returns {Promise<string[]>} Lista de slugs
 */
export async function scrapeFullCatalogAv1(startPage = 1, endPage = 10) {
  const slugs = new Set();

  for (let page = startPage; page <= endPage; page++) {
    try {
      // order=updated para obtener los más recientes o order=added para los nuevos
      const url = `${BASE_URL}/catalogo?page=${page}&order=updated`;
      console.log(`[AV1Scraper] Scrapeando catálogo completo página ${page}: ${url}`);

      const response = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: TIMEOUT,
      });

      const html = response.data;
      const hrefMatches = [...html.matchAll(/href="\/media\/([^/"]+)(?:\/\d+)?"/g)];
      let pageCount = 0;

      for (const match of hrefMatches) {
        const slug = match[1];
        if (slug && !slugs.has(slug)) {
          slugs.add(slug);
          pageCount++;
        }
      }

      const jsonMatches = [...html.matchAll(/slug:"([^"]+)"/g)];
      for (const match of jsonMatches) {
        const slug = match[1];
        if (slug && !slugs.has(slug)) {
          slugs.add(slug);
          pageCount++;
        }
      }

      console.log(`[AV1Scraper] Página ${page}: ${pageCount} slugs encontrados`);

      if (pageCount === 0) {
        console.log(`[AV1Scraper] Página ${page} vacía, deteniendo.`);
        break;
      }

      if (page < endPage) await sleep(DELAY_MS);
    } catch (error) {
      console.error(`[AV1Scraper] Error en página ${page}:`, error.message);
      break;
    }
  }

  const result = Array.from(slugs);
  console.log(`[AV1Scraper] Total animes encontrados en catálogo (páginas ${startPage}-${endPage}): ${result.length}`);
  return result;
}

