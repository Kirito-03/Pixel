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
            // Obtener más detalles y la lista completa de capítulos extrayendo el payload de SvelteKit
            // desde la página del primer episodio.
            let synopsis = null;
            let genres = null;
            let episodesList = [];
            
            try {
                // Fetch the episode 1 page which contains the SvelteKit hydration payload
                const html = await hentailaScraper.fetchHtml(`https://hentaila.com/media/${item.slug}/1`);
                
                // Buscar el payload específico que contiene la data de media
                const match = html.match(/\{type:"data",data:(\{media:\{.*?\}\}),uses:/);
                if (match) {
                    try {
                        const dataObj = eval('(' + match[1].replace(/void 0/g, 'null') + ')');
                        if (dataObj && dataObj.media) {
                            synopsis = dataObj.media.synopsis || null;
                            if (dataObj.media.genres) {
                                genres = dataObj.media.genres.map(g => g.name);
                            }
                            if (dataObj.media.episodes && Array.isArray(dataObj.media.episodes)) {
                                episodesList = dataObj.media.episodes;
                            }
                        }
                    } catch (evalErr) {
                        console.error(`[HentaiBot] Error evaluando SvelteKit payload para ${item.slug}:`, evalErr.message);
                    }
                }
            } catch (fetchErr) {
                console.error(`[HentaiBot] Error obteniendo detalles para ${item.slug}:`, fetchErr.message);
            }

            // 1. Upsert Hentai Content with new fields
            const resContent = await pool.query(`
                INSERT INTO hentai_content (slug, title, poster_url, status, synopsis, genres, is_active)
                VALUES ($1, $2, $3, 'Finalizado', $4, $5, true)
                ON CONFLICT (slug) 
                DO UPDATE SET 
                    title = EXCLUDED.title,
                    poster_url = EXCLUDED.poster_url,
                    synopsis = COALESCE(EXCLUDED.synopsis, hentai_content.synopsis),
                    genres = COALESCE(EXCLUDED.genres, hentai_content.genres),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id;
            `, [item.slug, item.title, item.poster_path, synopsis, JSON.stringify(genres)]);

            const hentaiId = resContent.rows[0].id;

            // Si no pudimos extraer los episodios del payload, intentamos al menos el episodio 1
            if (episodesList.length === 0) {
                episodesList = [{ number: 1 }];
            }

            // 2. Fetch and Upsert ALL Episodes
            for (const ep of episodesList) {
                try {
                    const servers = await hentailaScraper.getVideoServers(item.slug, ep.number);

                    if (servers && servers.length > 0) {
                        await pool.query(`
                            INSERT INTO hentai_episodes (hentai_id, episode_number, video_servers, is_active)
                            VALUES ($1, $2, $3, true)
                            ON CONFLICT (hentai_id, episode_number)
                            DO UPDATE SET
                                video_servers = EXCLUDED.video_servers,
                                updated_at = CURRENT_TIMESTAMP;
                        `, [hentaiId, ep.number, JSON.stringify(servers)]);
                    }
                } catch (err) {
                    console.error(`[HentaiBot] Error obteniendo episodio ${ep.number} de ${item.slug}:`, err.message);
                }
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
