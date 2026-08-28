import express from 'express';
import hentailaScraper from '../services/hentailaScraper.js';

const router = express.Router();

// GET /api/nsfw/latest
router.get('/latest', async (req, res) => {
    try {
        const data = await hentailaScraper.getLatestHentai();
        res.json(data);
    } catch (error) {
        console.error('Error fetching latest NSFW content:', error);
        res.status(500).json({ error: 'Failed to fetch NSFW content' });
    }
});

export default router;
