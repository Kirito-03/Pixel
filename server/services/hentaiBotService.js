import hentailaScraper from './hentailaScraper.js';

/**
 * Sincroniza el catálogo de Hentaila y obtiene todos los enlaces de episodios
 * y los guarda en la base de datos PostgreSQL local para no depender del scraper
 * en tiempo real durante la navegación de los usuarios.
 */
export async function syncHentaiCatalog(pool) {
    console.log('[HentaiBot] Iniciando sincronización del catálogo de Hentaila...');
    try {
        const latestAnimes = await hentailaScraper.getLatestHentai();
        if (!latestAnimes || latestAnimes.length === 0) {
            console.log('[HentaiBot] No se encontró contenido nuevo o la web no responde.');
            return { ok: false, count: 0 };
        }

        let syncedCount = 0;

        for (const item of latestAnimes) {
            // 1. Upsert Hentai Content
            const resContent = await pool.query(`
                INSERT INTO hentai_content (slug, title, poster_url, status, is_active)
                VALUES ($1, $2, $3, 'Finalizado', true)
                ON CONFLICT (slug) 
                DO UPDATE SET 
                    title = EXCLUDED.title,
                    poster_url = EXCLUDED.poster_url,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id;
            `, [item.slug, item.title, item.poster_path]);

            const hentaiId = resContent.rows[0].id;

            // 2. Fetch and Upsert Episodes
            // Por lo general, los hentais nuevos en Hentaila tienen 1 episodio inicial.
            // Trataremos de obtener el episodio 1. (Se podría mejorar iterando hasta que falle).
            const episodeNumber = 1; 
            const servers = await hentailaScraper.getVideoServers(item.slug, episodeNumber);

            if (servers && servers.length > 0) {
                await pool.query(`
                    INSERT INTO hentai_episodes (hentai_id, episode_number, video_servers, is_active)
                    VALUES ($1, $2, $3, true)
                    ON CONFLICT (hentai_id, episode_number)
                    DO UPDATE SET
                        video_servers = EXCLUDED.video_servers,
                        updated_at = CURRENT_TIMESTAMP;
                `, [hentaiId, episodeNumber, JSON.stringify(servers)]);
            }

            syncedCount++;
        }

        console.log(`[HentaiBot] Sincronización completada. ${syncedCount} items procesados.`);
        return { ok: true, count: syncedCount };

    } catch (error) {
        console.error('[HentaiBot] Error en la sincronización:', error);
        return { ok: false, count: 0 };
    }
}
