import hentailaScraper from './hentailaScraper.js';

let currentHentaiCatalogPage = 1;
let isSyncingHentaiCatalog = false;

async function upsertEpisodesForHentai(pool, hentaiId, slug, episodesList) {
    const episodes = Array.isArray(episodesList) && episodesList.length > 0
        ? episodesList
        : [{ number: 1 }];

    let scrapedCount = 0;
    for (const ep of episodes) {
        const epNum = Number(ep?.number) || 1;
        try {
            const servers = await hentailaScraper.getVideoServers(slug, epNum);
            if (servers && servers.length > 0) {
                await pool.query(`
                    INSERT INTO hentai_episodes (hentai_id, episode_number, video_servers, is_active)
                    VALUES ($1, $2, $3, true)
                    ON CONFLICT (hentai_id, episode_number)
                    DO UPDATE SET
                        video_servers = EXCLUDED.video_servers,
                        updated_at = CURRENT_TIMESTAMP;
                `, [hentaiId, epNum, JSON.stringify(servers)]);
                scrapedCount++;
            }
        } catch (err) {
            console.error(`[HentaiBot] Error obteniendo episodio ${epNum} de ${slug}:`, err.message);
        }
    }
    return scrapedCount;
}

async function syncHentaiItem(pool, item) {
    let synopsis = item.synopsis || null;
    let genres = item.genres || null;
    let status = item.status || 'Finalizado';
    let episodesList = [];

    try {
        const details = await hentailaScraper.getMediaDetails(item.slug);
        if (details) {
            synopsis = details.synopsis || synopsis;
            genres = details.genres || genres;
            status = details.status || status;
            episodesList = details.episodes || [];
        }
    } catch (fetchErr) {
        console.error(`[HentaiBot] Error obteniendo detalles para ${item.slug}:`, fetchErr.message);
    }

    const resContent = await pool.query(`
        INSERT INTO hentai_content (slug, title, poster_url, status, synopsis, genres, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (slug)
        DO UPDATE SET
            title = EXCLUDED.title,
            poster_url = EXCLUDED.poster_url,
            status = EXCLUDED.status,
            synopsis = COALESCE(EXCLUDED.synopsis, hentai_content.synopsis),
            genres = COALESCE(EXCLUDED.genres, hentai_content.genres),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id;
    `, [item.slug, item.title, item.poster_path, status, synopsis, genres ? JSON.stringify(genres) : null]);

    const hentaiId = resContent.rows[0].id;
    const episodesSynced = await upsertEpisodesForHentai(pool, hentaiId, item.slug, episodesList);
    return { hentaiId, episodesSynced };
}

/**
 * Sincroniza el catálogo de Hentaila (/hub) y obtiene todos los enlaces de episodios
 * guardándolos en PostgreSQL para no depender del scraper en tiempo real.
 */
export async function syncHentaiCatalog(pool) {
    if (isSyncingHentaiCatalog) {
        console.log('[HentaiBot] Sincronización ya en curso, omitiendo ejecución simultánea.');
        return { ok: true, count: 0, skipped: true };
    }
    isSyncingHentaiCatalog = true;
    console.log('[HentaiBot] Iniciando sincronización del catálogo de Hentaila (/hub)...');

    try {
        const latestAnimes = await hentailaScraper.getLatestHentai();
        if (!latestAnimes || latestAnimes.length === 0) {
            console.log('[HentaiBot] No se encontró contenido nuevo o la web no responde.');
            return { ok: false, count: 0 };
        }

        let syncedCount = 0;
        let episodesCount = 0;
        for (const item of latestAnimes) {
            const { episodesSynced } = await syncHentaiItem(pool, item);
            syncedCount++;
            episodesCount += episodesSynced;
        }

        console.log(`[HentaiBot] Sincronización /hub completada. ${syncedCount} títulos y ${episodesCount} episodios procesados.`);
        return { ok: true, count: syncedCount, episodesCount };
    } catch (error) {
        console.error('[HentaiBot] Error en la sincronización:', error);
        return { ok: false, count: 0 };
    } finally {
        isSyncingHentaiCatalog = false;
    }
}

/**
 * Scraper incremental del catálogo paginado (/catalogo?page=N),
 * equivalente a syncNextCatalogPage() de animes.
 */
export async function syncNextHentaiCatalogPage(pool) {
    if (isSyncingHentaiCatalog) {
        return { ok: true, count: 0, skipped: true };
    }
    isSyncingHentaiCatalog = true;
    const page = currentHentaiCatalogPage;
    console.log(`[HentaiBot] Sincronizando página ${page} del catálogo de Hentaila...`);

    try {
        const { items, totalPages } = await hentailaScraper.getCatalogPage(page);
        if (!items || items.length === 0) {
            currentHentaiCatalogPage = 1;
            return { ok: false, page, count: 0 };
        }

        let syncedCount = 0;
        let episodesCount = 0;
        for (const item of items) {
            const { episodesSynced } = await syncHentaiItem(pool, item);
            syncedCount++;
            episodesCount += episodesSynced;
        }

        currentHentaiCatalogPage = page >= totalPages ? 1 : page + 1;
        console.log(`[HentaiBot] Página ${page}/${totalPages} completada (${syncedCount} títulos, ${episodesCount} episodios). Próxima: ${currentHentaiCatalogPage}`);
        return { ok: true, page, totalPages, count: syncedCount, episodesCount };
    } catch (error) {
        console.error(`[HentaiBot] Error sincronizando página ${page}:`, error.message);
        return { ok: false, page, count: 0 };
    } finally {
        isSyncingHentaiCatalog = false;
    }
}

/**
 * Sincroniza los detalles y episodios de un solo anime Hentai bajo demanda (On-Demand).
 * Usado cuando un usuario entra a ver un Hentai que no tiene capítulos en la BD.
 */
export async function syncHentaiSingle(pool, slug) {
    console.log(`[HentaiBot] Extracción On-Demand para: ${slug}`);
    let synopsis = null;
    let genres = null;
    let status = null;
    let episodesList = [];

    try {
        const details = await hentailaScraper.getMediaDetails(slug);
        if (details) {
            synopsis = details.synopsis;
            genres = details.genres;
            status = details.status;
            episodesList = details.episodes;
        }
    } catch (fetchErr) {
        console.error(`[HentaiBot] Error obteniendo detalles para ${slug} (On-Demand):`, fetchErr.message);
    }

    const resContent = await pool.query(`
        UPDATE hentai_content
        SET synopsis = COALESCE($1, synopsis),
            genres = COALESCE($2, genres),
            status = COALESCE($3, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE slug = $4
        RETURNING id;
    `, [synopsis, genres ? JSON.stringify(genres) : null, status, slug]);

    if (resContent.rows.length === 0) return false;

    const hentaiId = resContent.rows[0].id;
    const scrapedCount = await upsertEpisodesForHentai(pool, hentaiId, slug, episodesList);

    console.log(`[HentaiBot] Extracción On-Demand completada. ${scrapedCount} episodios extraídos.`);
    return true;
}
