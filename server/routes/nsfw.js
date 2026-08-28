import express from 'express';
import hentailaScraper from '../services/hentailaScraper.js';

const router = express.Router();

// GET /api/nsfw/latest
router.get('/latest', async (req, res) => {
    try {
        const latest = await hentailaScraper.getLatestHentai();
        res.json(latest);
    } catch (error) {
        console.error('Error in /nsfw/latest:', error);
        res.status(500).json({ error: 'Failed to fetch latest NSFW content' });
    }
});

// GET /api/nsfw/servers/:slug/:episode
router.get('/servers/:slug/:episode', async (req, res) => {
    try {
        const { slug, episode } = req.params;
        const servers = await hentailaScraper.getVideoServers(slug, episode);
        res.json(servers);
    } catch (error) {
        console.error('Error in /nsfw/servers:', error);
        res.status(500).json({ error: 'Failed to fetch video servers' });
    }
});

export default router;
