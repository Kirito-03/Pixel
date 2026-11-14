import fs from 'fs';
import os from 'os';
import path from 'path';
import * as cheerio from 'cheerio';
import { fetchHtmlWithCloak, upsertManga, getMangaChapters } from './mangaService.js';

const BASE_URL = 'https://dragontranslation.org';
const MANGA_MEMORY_FILE = path.join(os.tmpdir(), 'manga_bot_memory.json');

let isSyncingManga = false;

/** Espera N milisegundos */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function readLastMangaPage() {
  try {
    if (fs.existsSync(MANGA_MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MANGA_MEMORY_FILE, 'utf8'));
      if (Number.isInteger(data?.lastCatalogPage) && data.lastCatalogPage >= 1) {
        return data.lastCatalogPage;
      }
    }
  } catch {
    // Non-fatal, fallback to page 1
  }
  return 1;
}

function saveLastMangaPage(page) {
  try {
    fs.mkdirSync(path.dirname(MANGA_MEMORY_FILE), { recursive: true });
    fs.writeFileSync(MANGA_MEMORY_FILE, JSON.stringify({ lastCatalogPage: page }));
  } catch {
    // Non-fatal
  }
}

/**
 * Scrapea una página del catálogo y devuelve los slugs e información preliminar encontrada
 */
async function scrapeCatalogPage(page = 1) {
  const url = page === 1 
    ? `${BASE_URL}/manga/?m_orderby=latest` 
    : `${BASE_URL}/manga/page/${page}/?m_orderby=latest`;

  console.log(`[MangaBot] Scrapeando página de catálogo (${page}): ${url}`);
  
  try {
    const html = await fetchHtmlWithCloak(url, '.acard');
    const $ = cheerio.load(html);
    const items = [];

    $('.acard').each((i, el) => {
      const link = $(el).attr('href');
      if (!link) return;

      const match = link.match(/\/manga\/([^\/]+)\/?/);
      if (!match) return;
      const slug = match[1];

      const title = $(el).find('.ac-t').text().trim();
      let cover_url = $(el).find('.ac-cover').attr('src') || $(el).find('.ac-cover').attr('data-src');
      if (cover_url && cover_url.includes(' ')) cover_url = cover_url.split(' ')[0];

      const statusText = $(el).find('.ac-status').text().trim().toLowerCase();
      let status = 'En emisión';
      if (statusText.includes('complet') || statusText.includes('finaliz')) status = 'Finalizado';
      else if (statusText.includes('hiatus')) status = 'Hiatus';
      else if (statusText.includes('cancel')) status = 'Cancelado';

      const latest_chapter = $(el).find('.ac-ch').text().replace(/cap[ií]tulo/gi, '').trim() || null;
      const chapter_count = parseInt(latest_chapter, 10) || 0;

      items.push({
        slug,
        title,
        cover_url,
        status,
        latest_chapter,
        chapter_count,
      });
    });

    console.log(`[MangaBot] Página ${page}: ${items.length} títulos encontrados.`);
    return items;
  } catch (err) {
    console.error(`[MangaBot] Error scrapeando catálogo página ${page}:`, err.message);
    return [];
  }
}

/**
 * Sincroniza un manga específico obteniendo sus detalles y capítulos completos.
 */
export async function syncMangaItem(pool, itemOrSlug) {
  const slug = typeof itemOrSlug === 'string' ? itemOrSlug : itemOrSlug.slug;
  const initial = typeof itemOrSlug === 'object' ? itemOrSlug : null;

  try {
    const url = `${BASE_URL}/manga/${slug}/`;
    const html = await fetchHtmlWithCloak(url, '.htitle');
    const $ = cheerio.load(html);

    const title = $('.htitle').text().trim() || initial?.title;
    if (!title) {
      console.log(`[MangaBot] Manga ${slug} no válido (Sin título).`);
      return { ok: false, slug };
    }

    let cover_url = $('.hposter img').attr('src') || $('.hposter img').attr('data-src') || initial?.cover_url || null;
    if (cover_url && cover_url.includes(' ')) cover_url = cover_url.split(' ')[0];

    const description = $('.syn p').text().trim() || '';

    const tags = [];
    $('.hchips--genres .chip').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tags.push(tag);
    });

    let status = initial?.status || 'En emisión';
    $('.sir').each((_, el) => {
      if ($(el).find('.l').text().includes('Estado')) {
        const s = $(el).find('.v').text().toLowerCase();
        if (s.includes('completed') || s.includes('completado') || s.includes('finalizado')) status = 'Finalizado';
        else if (s.includes('hiatus')) status = 'Hiatus';
        else if (s.includes('cancel')) status = 'Cancelado';
        else status = 'En emisión';
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
      chapter_count: initial?.chapter_count || 0,
      latest_chapter: initial?.latest_chapter || null,
      author: '',
      artist: '',
      updated_at: new Date().toISOString()
    };

    await upsertManga(pool, mapped);

    // Refrescar y cachear capítulos en manga_chapters_cache
    const chaptersData = await getMangaChapters(pool, slug, { forceRefresh: true });
    const chaptersCount = chaptersData?.chapters?.length || 0;

    return { ok: true, slug, title, chaptersCount };
  } catch (err) {
    console.error(`[MangaBot] Error procesando manga ${slug}:`, err.message);
    return { ok: false, slug, error: err.message };
  }
}

/**
 * Tarea 1: Sincroniza la primera página de novedades de DragonTranslation (Novedades recientes)
 * Equivalente a syncHentaiCatalog / syncAiringAnimes
 */
export async function syncLatestManga(pool) {
  if (isSyncingManga) {
    console.log('[MangaBot] Sincronización ya en curso, omitiendo ejecución simultánea.');
    return { ok: true, count: 0, skipped: true };
  }
  isSyncingManga = true;
  console.log('[MangaBot] Iniciando sincronización de novedades de Manga (Página 1)...');

  try {
    const items = await scrapeCatalogPage(1);
    if (!items || items.length === 0) {
      console.log('[MangaBot] No se encontraron mangas o la web no respondió.');
      return { ok: false, count: 0 };
    }

    let syncedCount = 0;
    let chaptersCount = 0;
    for (const item of items) {
      const res = await syncMangaItem(pool, item);
      if (res.ok) {
        syncedCount++;
        chaptersCount += (res.chaptersCount || 0);
      }
      await sleep(1500);
    }

    console.log(`[MangaBot] Sincronización de novedades completada. ${syncedCount} mangas y ${chaptersCount} capítulos cacheados.`);
    return { ok: true, count: syncedCount, chaptersCount };
  } catch (error) {
    console.error('[MangaBot] Error en sincronización de novedades:', error.message);
    return { ok: false, count: 0, error: error.message };
  } finally {
    isSyncingManga = false;
  }
}

/**
 * Tarea 2: Scraper incremental de páginas de catálogo (Página 1, 2, 3...)
 * Equivalente a syncNextCatalogPage / syncNextHentaiCatalogPage
 */
export async function syncNextMangaCatalogPage(pool) {
  if (isSyncingManga) {
    return { ok: true, count: 0, skipped: true };
  }
  isSyncingManga = true;
  const page = readLastMangaPage();
  console.log(`[MangaBot] Sincronizando página ${page} del catálogo de DragonTranslation...`);

  try {
    const items = await scrapeCatalogPage(page);
    if (!items || items.length === 0) {
      console.log(`[MangaBot] Página ${page} vacía o fin de catálogo. Reiniciando a página 1.`);
      saveLastMangaPage(1);
      return { ok: false, page, count: 0 };
    }

    let syncedCount = 0;
    let chaptersCount = 0;
    for (const item of items) {
      const res = await syncMangaItem(pool, item);
      if (res.ok) {
        syncedCount++;
        chaptersCount += (res.chaptersCount || 0);
      }
      await sleep(1500);
    }

    const nextPage = page + 1;
    saveLastMangaPage(nextPage);
    console.log(`[MangaBot] Página ${page} completada (${syncedCount} mangas procesados). Próxima: ${nextPage}`);
    return { ok: true, page, nextPage, count: syncedCount, chaptersCount };
  } catch (error) {
    console.error(`[MangaBot] Error sincronizando página incremental ${page}:`, error.message);
    return { ok: false, page, count: 0, error: error.message };
  } finally {
    isSyncingManga = false;
  }
}

/**
 * Extracción / sincronización bajo demanda (On-Demand) para un solo manga.
 * Equivalente a syncHentaiSingle
 */
export async function syncMangaSingle(pool, slug) {
  console.log(`[MangaBot] Sincronización On-Demand para manga: ${slug}`);
  return await syncMangaItem(pool, slug);
}

/**
 * Mantiene compatibilidad con llamadas anteriores
 */
export async function runIncrementalMangaScraping(pool, startPage = 1, endPage = 1) {
  console.log(`[MangaBot] Ejecutando scraping para páginas ${startPage} - ${endPage}...`);
  let total = 0;
  for (let p = startPage; p <= endPage; p++) {
    const items = await scrapeCatalogPage(p);
    for (const item of items) {
      const res = await syncMangaItem(pool, item);
      if (res.ok) total++;
      await sleep(1500);
    }
  }
  return { success: true, processed: total };
}
