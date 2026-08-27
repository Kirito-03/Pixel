/**
 * jkanimeScraper.js
 * Scraper para jkanime.net
 *
 * ESTRATEGIA:
 * 1. Buscar el slug del anime en jkanime.net/buscar/{titulo}
 * 2. Ir a la página del anime jkanime.net/{slug}/
 * 3. Leer los episodios del AJAX interno: jkanime.net/ajax/episodes/{animeId}/{page}
 * 4. Para cada episodio, ir a jkanime.net/{slug}/{epNumber}/
 *    y extraer la URL del iframe del player
 * 5. Devolver lista de { episode_number, video_url (iframe URL) }
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { launch } from 'cloakbrowser';

let browserInstance = null;

async function getBrowserPage() {
  if (!browserInstance) {
    browserInstance = await launch({ headless: true, humanize: true });
  }
  const page = await browserInstance.newPage();
  return { browser: browserInstance, page };
}

async function fetchHtmlWithCloak(url, timeoutMs) {
  const { page } = await getBrowserPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (res && res.status() === 404) {
       const err = new Error('Not Found');
       err.status = 404;
       throw err;
    }
    const html = await page.content();
    await page.close();
    return html;
  } catch (err) {
    await page.close().catch(() => {});
    throw err;
  }
}

const BASE_URL = 'https://jkanime.net';
const TIMEOUT = 20000;
const DELAY_MS = 1500; // Retraso entre peticiones para no ser bloqueados

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
 * Busca un anime en JKAnime y devuelve su slug.
 * @param {string} title - Título del anime
 * @returns {Promise<string|null>} slug del anime o null
 */
export async function findJkAnimeSlug(title) {
  try {
    // Normalizar título para la búsqueda
    const query = encodeURIComponent(title.replace(/\s+/g, ' ').trim());
    const searchUrl = `${BASE_URL}/buscar/${query}/`;

    const html = await fetchHtmlWithCloak(searchUrl, TIMEOUT);
    const $ = cheerio.load(html);

    // Buscar resultados de búsqueda - los links tienen la forma /anime-slug/
    let bestMatch = null;
    let bestScore = 0;

    $('.anime__item').each((i, el) => {
      const link = $(el).find('a').attr('href') || '';
      const name = $(el).find('.anime__item__text h5, .anime__item__text a').first().text().trim();

      if (!link || !name) return;

      // Calcular similitud básica
      const score = titleSimilarity(title, name);
      if (score > bestScore) {
        bestScore = score;
        // Extraer slug desde URL: /black-clover/ → black-clover
        const match = link.match(/\/([^/]+)\/?$/);
        if (match) bestMatch = match[1];
      }
    });

    if (bestMatch && bestScore >= 0.4) {
      console.log(`[JKScraper] Slug encontrado para "${title}": "${bestMatch}" (score: ${bestScore.toFixed(2)})`);
      return bestMatch;
    }

    console.warn(`[JKScraper] No se encontró slug para "${title}" (mejor score: ${bestScore.toFixed(2)})`);
    return null;
  } catch (error) {
    console.error(`[JKScraper] Error buscando slug para "${title}":`, error.message);
    return null;
  }
}

/**
 * Obtiene los metadatos básicos del anime desde su página.
 * @param {string} slug - Slug del anime (ej: "black-clover")
 * @returns {Promise<object>} Datos de la página del anime
 */
export async function getAnimePageData(slug) {
  try {
    const url = `${BASE_URL}/${slug}/`;
    const html = await fetchHtmlWithCloak(url, TIMEOUT);
    const $ = cheerio.load(html);

    // Extraer ID del anime (usado para el AJAX de episodios)
    // Está en el script: ajax/episodes/{id}/{page}
    let animeId = null;
    const pageHtml = html;
    const idMatch = pageHtml.match(/ajax\/episodes\/(\d+)\//);
    if (idMatch) animeId = idMatch[1];

    // Último episodio
    const lastEpLink = $('#uep').attr('href') || '';
    const lastEpMatch = lastEpLink.match(/\/(\d+)\/?$/);
    const lastEpisode = lastEpMatch ? parseInt(lastEpMatch[1]) : null;

    // Poster
    const posterUrl = $('.anime__details__pic').attr('data-setbg') ||
                       $('img[alt]').first().attr('src') || '';

    return { animeId, lastEpisode, posterUrl, slug };
  } catch (error) {
    console.error(`[JKScraper] Error obteniendo datos de "${slug}":`, error.message);
    return { animeId: null, lastEpisode: null, posterUrl: '', slug };
  }
}

/**
 * Obtiene la URL del iframe del reproductor para un episodio específico.
 * @param {string} slug - Slug del anime
 * @param {number} episodeNumber - Número del episodio
 * @returns {Promise<string|null>} URL del iframe o null
 */
export async function getEpisodePlayerUrl(slug, episodeNumber) {
  try {
    const url = `${BASE_URL}/${slug}/${episodeNumber}/`;
    const html = await fetchHtmlWithCloak(url, TIMEOUT);

    // Extraer todos los iframes de las variables de video
    const videoMatches = html.matchAll(/video\[\d+\]\s*=\s*'<iframe[^']*src="([^"]+)"/g);
    let allIframes = [];
    for (const match of videoMatches) {
      allIframes.push(match[1]);
    }

    if (allIframes.length === 0) {
      const $ = cheerio.load(html);
      const src = $('iframe.player_conte').first().attr('src');
      if (src) allIframes.push(src);
    }

    if (allIframes.length === 0) return null;

    // Prioridad 1: Buscar enlaces de MEGA
    let megaUrl = allIframes.find(url => url.includes('mega.nz/embed/') || url.includes('jk.php?u=mega'));
    if (megaUrl) {
      if (megaUrl.includes('jk.php?u=mega')) {
        const u = new URL(megaUrl).searchParams.get('u');
        if (u) return `https://${u}`;
      }
      return megaUrl;
    }

    // Prioridad 2: Buscar UMV / JK (para HLS mp4 crudo)
    let iframeUrl = allIframes.find(url => url.includes('/umv')) || allIframes.find(url => url.includes('/um')) || allIframes[0];

    if (!iframeUrl) return null;

    // Ahora hacemos una petición al iframe para extraer el link directo
    try {
      const iframeHtml = await fetchHtmlWithCloak(iframeUrl, TIMEOUT);
      
      // Intentar extraer <source src="..."> (típico de video.js)
      const sourceMatch = iframeHtml.match(/<source\s+src=['"]([^'"]+)['"]/);
      if (sourceMatch) {
        return sourceMatch[1];
      }

      // Intentar extraer url: '...' (típico de DPlayer)
      const urlMatch = iframeHtml.match(/url:\s*['"](http[^'"]+)['"]/);
      if (urlMatch) {
        return urlMatch[1];
      }

      // Si no encuentra enlace directo, devolvemos el iframe URL
      return iframeUrl;
    } catch (e) {
      // Si falla la extracción profunda, devolvemos el iframe
      return iframeUrl;
    }

  } catch (error) {
    if (error.status === 404) {
      return null; // Episodio no existe
    }
    console.error(`[JKScraper] Error en ep ${episodeNumber} de "${slug}":`, error.message);
    return null;
  }
}

/**
 * Función principal: scrape completo de todos los episodios de un anime.
 * @param {string} slug - Slug del anime en JKAnime
 * @param {object} options
 * @param {number} options.fromEpisode - Episodio desde el que empezar (default: 1)
 * @param {number} options.toEpisode - Episodio hasta el que llegar (default: auto)
 * @param {Function} options.onProgress - Callback de progreso (episodio, total)
 * @returns {Promise<Array<{episode_number: number, video_url: string}>>}
 */
export async function scrapeAnimeEpisodes(slug, options = {}) {
  const { fromEpisode = 1, toEpisode = null, onProgress = null } = options;

  // 1. Obtener datos de la página del anime
  const pageData = await getAnimePageData(slug);
  const maxEpisode = toEpisode || pageData.lastEpisode || 1;

  console.log(`[JKScraper] Scrapeando "${slug}" eps ${fromEpisode}-${maxEpisode}`);

  const results = [];

  for (let epNum = fromEpisode; epNum <= maxEpisode; epNum++) {
    // Delay entre peticiones para no ser bloqueado
    await sleep(DELAY_MS);

    const playerUrl = await getEpisodePlayerUrl(slug, epNum);

    if (playerUrl) {
      results.push({ episode_number: epNum, video_url: playerUrl });
      console.log(`[JKScraper] ✓ Ep ${epNum}: ${playerUrl.substring(0, 60)}...`);
    } else {
      console.warn(`[JKScraper] ✗ Ep ${epNum}: no encontrado, deteniéndose.`);
      break; // Si un episodio no existe, probablemente llegamos al final
    }

    if (onProgress) {
      onProgress(epNum, maxEpisode);
    }
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
 * Scrapea el directorio de JKAnime buscando animes en emisión.
 * JKAnime marca los estrenos recientes en su directorio principal.
 * @returns {Promise<string[]>} Lista de slugs de animes en emisión.
 */
export async function scrapeAiringAnimes() {
  try {
    console.log('[JKScraper] Buscando animes en emisión...');
    const res = await axios.get(`${BASE_URL}/directorio/`, { timeout: TIMEOUT });
    const $ = cheerio.load(res.data);
    
    const airingSlugs = [];
    
    // JKAnime listado de estrenos / emisión
    // Usualmente tienen la clase "emision" o estado de publicación "En emision"
    // Buscamos los anchors y su href
    
    // Suponemos que la sección .custom_item2b contiene las tarjetas de anime
    $('.custom_item2b').each((_, el) => {
      // JKAnime marca el estado con texto dentro de la tarjeta
      const isAiring = $(el).find('span.ep-status, .estado').text().toLowerCase().includes('emision');
      
      // Si no encontramos un indicador claro en la tarjeta, 
      // JKAnime tiene una etiqueta específica o simplemente extraemos de un listado "En Emisión"
      // Otra estrategia: leer todos los animes en la primera pág (son los más recientes)
      
      const href = $(el).find('a').attr('href');
      if (href && (isAiring || true)) { // Simplificación: agarramos los recientes y los validamos en la BD
        const match = href.match(/jkanime\.net\/([^/]+)\/?/);
        if (match) {
          const slug = match[1];
          if (!airingSlugs.includes(slug)) {
            airingSlugs.push(slug);
          }
        }
      }
    });
    
    console.log(`[JKScraper] Encontrados ${airingSlugs.length} animes recientes en JKAnime.`);
    return airingSlugs;
  } catch (error) {
    console.error('[JKScraper] Error escaneando emisiones:', error.message);
    return [];
  }
}
