import express from 'express';
import hentailaScraper from '../services/hentailaScraper.js';
import pool from '../db.js';

const router = express.Router();

// GET /api/nsfw/latest
router.get('/latest', async (req, res) => {
    try {
        const { search, status } = req.query;
        let query = `
            SELECT id::TEXT, slug, title, poster_url as poster_path, status, synopsis, genres, is_active
            FROM hentai_content
            WHERE is_active = true
        `;
        const queryParams = [];
        let paramCount = 1;

        if (status && status !== 'Todos') {
            // Asumiremos que 'Nuevos caps' en la UI buscará los actualizados recientemente o estado 'En emisión'
            // Dado que hentaila marca casi todo Finalizado, por ahora filtramos exacto por el estado.
            if (status === 'Nuevos caps') {
                // Ordenaremos por updated_at pero no filtramos por estado exacto si todos son Finalizado
            } else {
                query += ` AND status ILIKE $${paramCount}`;
                queryParams.push(`%${status}%`);
                paramCount++;
            }
        }

        if (search) {
            query += ` AND title ILIKE $${paramCount}`;
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        query += ` ORDER BY updated_at DESC LIMIT 50`;

        const result = await pool.query(query, queryParams);
        
        // Mapear al formato que espera el frontend (NSFWAnime)
        const latest = result.rows.map(r => ({
            ...r,
            type: 'hentai',
            is_nsfw: true
        }));

        res.json(latest);
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

        const hentai = result.rows[0];

        // Fetch episodes
        const episodesResult = await pool.query(`
            SELECT episode_number as number
            FROM hentai_episodes
            WHERE hentai_id = $1 AND is_active = true
            ORDER BY episode_number DESC
        `, [hentai.id]);

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
