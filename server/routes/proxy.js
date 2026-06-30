import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import cache from '../services/cacheService.js';

const router = express.Router();

// CORS Proxy para servicios externos de anime
router.get('/cors-proxy', async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Validar que la URL sea de dominios permitidos
  const allowedDomains = [
    'anbuanime.onrender.com',
    'api.consumet.org',
    'api.jikan.moe',
    'graphql.anilist.co',
    'api.animeapiplatform.com',
    'anime-api.canelacho.com',
    'api.animeflix.live',
    'api.animeapi.xyz',
    'api.animeapi.net'
  ];

  try {
    const targetURL = new URL(url);
    const isAllowed = allowedDomains.some(domain => targetURL.hostname.includes(domain));

    if (!isAllowed) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    // Forward request
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    // Return with CORS headers
    res.json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(error.response?.status || 500).json({
      error: 'Proxy request failed',
      details: error.message
    });
  }
});

// Proxy para traducción (LibreTranslate / DeepL)
router.post('/translate', async (req, res) => {
  const { q, target, source, format } = req.body || {};
  if (!q || !target) return res.status(400).json({ message: 'q y target requeridos' });
  const provider = (process.env.TRANSLATE_PROVIDER || 'libre').toLowerCase();
  try {
    if (provider === 'libre') {
      const { data } = await axios.post('https://libretranslate.com/translate', {
        q,
        source: source || 'auto',
        target,
        format: format || 'text'
      }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      return res.json({ translatedText: data?.translatedText || '' });
    }
    if (provider === 'deepl') {
      const key = process.env.DEEPL_API_KEY;
      if (!key) return res.status(500).json({ message: 'DEEPL_API_KEY faltante' });
      const params = new URLSearchParams();
      params.set('auth_key', key);
      params.set('text', q);
      params.set('target_lang', String(target || 'es').toUpperCase());
      if (source) params.set('source_lang', String(source).toUpperCase());
      const { data } = await axios.post('https://api.deepl.com/v2/translate', params);
      const text = data?.translations?.[0]?.text || '';
      return res.json({ translatedText: text });
    }
    return res.status(400).json({ message: 'Proveedor no soportado' });
  } catch (e) {
    return res.status(500).json({ message: 'Error de traducción', error: e.message });
  }
});

// Proxy para AniList GraphQL (evita CORS desde web) — con cache Redis 5 min
router.post('/anilist', async (req, res) => {
  const { query, variables } = req.body || {};
  if (!query) {
    return res.status(400).json({ message: 'Falta el campo "query" para la petición GraphQL' });
  }
  try {
    // Generar clave de cache basada en hash del query + variables
    const hash = crypto.createHash('md5').update(JSON.stringify({ query, variables })).digest('hex');
    const cacheKey = `anilist:${hash}`;

    const data = await cache.getOrSet(cacheKey, 300, async () => {
      const { data: resp } = await axios.post('https://graphql.anilist.co', { query, variables }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });
      if (resp?.errors) {
        throw { isAniListError: true, errors: resp.errors };
      }
      return resp?.data ?? resp;
    });

    return res.json(data);
  } catch (e) {
    if (e.isAniListError) {
      return res.status(502).json({ message: 'Error de AniList', errors: e.errors });
    }
    const status = e.response?.status || 500;
    const errMsg = e.response?.data || { message: e.message };
    console.error('Error proxy AniList:', e.message);
    return res.status(status).json({ message: 'Fallo al consultar AniList', error: errMsg });
  }
});

export default router;
