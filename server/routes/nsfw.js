import express from 'express';
import hentailaScraper from '../services/hentailaScraper.js';
import pool from '../db.js';

const router = express.Router();

// GET /api/nsfw/latest
router.get('/latest', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id::TEXT, slug, title, poster_url as poster_path, status, is_active
            FROM hentai_content
            WHERE is_active = true
            ORDER BY updated_at DESC
            LIMIT 50
        `);
        
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
