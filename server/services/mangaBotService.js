import * as cheerio from 'cheerio';
import { fetchHtmlWithCloak, upsertManga, getMangaChapters } from './mangaService.js';

const BASE_URL = 'https://dragontranslation.org';

/** Espera N milisegundos */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Scrapea una página del catálogo y devuelve los slugs encontrados
 */
async function scrapeCatalogPage(page = 1) {
  const url = page === 1 
    ? `${BASE_URL}/manga/?m_orderby=latest` 
    : `${BASE_URL}/manga/page/${page}/?m_orderby=latest`;

  console.log(`[MangaBot] Scrapeando página de catálogo: ${url}`);
  
  try {
    const html = await fetchHtmlWithCloak(url, '.acard');
    const $ = cheerio.load(html);
    const items = [];

    $('.acard').each((i, el) => {
      const link = $(el).attr('href');
      if (!link) return;

      const match = link.match(/\/manga\/([^\/]+)\/?/);
      if (!match) return;
      const id = match[1];

      items.push(id);
    });

    console.log(`[MangaBot] Página ${page}: ${items.length} slugs encontrados.`);
    return items;
  } catch (err) {
    console.error(`[MangaBot] Error scrapeando catálogo página ${page}:`, err.message);
    return [];
  }
}

/**
 * Función principal para correr el bot incremental.
 * 1. Lee las primeras X páginas del catálogo.
 * 2. Por cada slug encontrado, extrae su detalle y capítulos.
 */
export async function runIncrementalMangaScraping(pool, startPage = 1, endPage = 1) {
  console.log(`[MangaBot] Iniciando scraping incremental (Páginas ${startPage} - ${endPage})...`);
  
  let totalProcessed = 0;
  
  for (let p = startPage; p <= endPage; p++) {
    const slugs = await scrapeCatalogPage(p);
    
    for (const slug of slugs) {
      console.log(`[MangaBot] Procesando manga: ${slug}`);
      try {
        // Scrape details
        const url = `${BASE_URL}/manga/${slug}/`;
        const html = await fetchHtmlWithCloak(url, '.htitle');
        const $ = cheerio.load(html);

        const title = $('.htitle').text().trim();
        if (!title) {
          console.log(`[MangaBot] Manga ${slug} no válido (Sin título).`);
          continue;
        }

        let cover_url = $('.hposter img').attr('src') || $('.hposter img').attr('data-src');
        if (cover_url && cover_url.includes(' ')) cover_url = cover_url.split(' ')[0];

        const description = $('.syn p').text().trim();
        
        const tags = [];
        $('.hchips--genres .chip').each((_, el) => {
          tags.push($(el).text().trim());
        });

        let status = 'ongoing';
        $('.sir').each((_, el) => {
          if ($(el).find('.l').text().includes('Estado')) {
             const s = $(el).find('.v').text().toLowerCase();
             if (s.includes('completed') || s.includes('completado')) status = 'completed';
          }
        });

        const mapped = {
          id: slug,
          title,
          description,
          cover_url,
          status,
          tags,
          content_rating: 'safe',
          year: null,
          chapter_count: 0,
          latest_chapter: null,
          author: '',
          artist: '',
          updated_at: new Date().toISOString()
        };

        // Guardar/Actualizar manga en BD
        await upsertManga(pool, mapped);
        console.log(`[MangaBot] Manga guardado: ${title}`);
        
        // Refrescar lista de capítulos para el manga guardado.
        // getMangaChapters tiene lógica de caché, forzamos un refresh para que detecte nuevos caps si los hay
        await getMangaChapters(pool, slug, { forceRefresh: true });
        console.log(`[MangaBot] Capítulos cacheados para: ${title}`);
        
        totalProcessed++;
        
        // Pequeño retraso para no saturar al proxy ni a la API de Cloudflare/DT
        await sleep(2000);
      } catch (err) {
        console.error(`[MangaBot] Error procesando manga ${slug}:`, err.message);
      }
    }
  }
  
  console.log(`[MangaBot] Scraping incremental finalizado. Total procesados: ${totalProcessed}`);
  return { success: true, processed: totalProcessed };
}
