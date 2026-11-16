import { getNSFWCatalog } from '../services/nsfwCatalog.js';
import express from 'express';
import hentailaScraper from '../services/hentailaScraper.js';
import { syncHentaiSingle } from '../services/hentaiBotService.js';
import pool from '../db.js';

const router = express.Router();
const inFlightHentaiSyncs = new Map();

// GET /api/nsfw/latest
router.get('/latest', async (req, res) => {
    try {
        const result = await getNSFWCatalog(pool, req.query);
        res.json(req.query.page !== undefined ? result : result.items);
    } catch (error) {
        console.error('Error in /nsfw/latest:', error);
        res.status(500).json({ error: 'Failed to fetch latest NSFW content from DB' });
    }
});

// GET /api/nsfw/details/:slug
router.get('/details/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await pool.query(`
            SELECT id::TEXT, slug, title, poster_url as poster_path, status, synopsis, genres, is_active
            FROM hentai_content
            WHERE slug = $1 AND is_active = true
            LIMIT 1
        `, [slug]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Hentai not found' });
        }

        let hentai = result.rows[0];

        // Fetch episodes
        let episodesResult = await pool.query(`
            SELECT episode_number as number
            FROM hentai_episodes
            WHERE hentai_id = $1 AND is_active = true
            ORDER BY episode_number DESC
        `, [hentai.id]);

        // Si no hay episodios, intentamos buscarlos en vivo (On-Demand) con deduplicación en memoria
        if (episodesResult.rows.length === 0 && /^[a-z0-9-]+$/i.test(slug)) {
            console.log(`[API] 0 episodios para ${slug}, disparando búsqueda On-Demand...`);
            let syncPromise = inFlightHentaiSyncs.get(slug);
            if (!syncPromise) {
                syncPromise = syncHentaiSingle(pool, slug).finally(() => {
                    inFlightHentaiSyncs.delete(slug);
                });
                inFlightHentaiSyncs.set(slug, syncPromise);
            }
            const synced = await syncPromise;
            if (synced) {
                // Re-consultar la base de datos tras la sincronización
                const refreshedResult = await pool.query(`
                    SELECT id::TEXT, slug, title, poster_url as poster_path, status, synopsis, genres, is_active
                    FROM hentai_content
                    WHERE slug = $1 AND is_active = true
                    LIMIT 1
                `, [slug]);
                
                if (refreshedResult.rows.length > 0) {
                    hentai = refreshedResult.rows[0];
                }

                episodesResult = await pool.query(`
                    SELECT episode_number as number
                    FROM hentai_episodes
                    WHERE hentai_id = $1 AND is_active = true
                    ORDER BY episode_number DESC
                `, [hentai.id]);
            }
        }

        hentai.episodes = episodesResult.rows;

        res.json(hentai);
    } catch (error) {
        console.error('Error in /nsfw/details:', error);
        res.status(500).json({ error: 'Failed to fetch NSFW details from DB' });
    }
});

// GET /api/nsfw/servers/:slug/:episode
router.get('/servers/:slug/:episode', async (req, res) => {
    try {
        const { slug, episode } = req.params;
        const result = await pool.query(`
            SELECT he.video_servers
            FROM hentai_episodes he
            JOIN hentai_content hc ON hc.id = he.hentai_id
            WHERE hc.slug = $1 AND he.episode_number = $2 AND he.is_active = true
            LIMIT 1
        `, [slug, parseInt(episode) || 1]);

        if (result.rows.length > 0 && result.rows[0].video_servers) {
            res.json(result.rows[0].video_servers);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Error in /nsfw/servers:', error);
        res.status(500).json({ error: 'Failed to fetch video servers from DB' });
    }
});

export default router;
