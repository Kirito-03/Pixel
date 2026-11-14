import axios from 'axios';
import * as cheerio from 'cheerio';
import vm from 'vm';

const BASE_URL = 'https://hentaila.com';
const CDN_COVERS_URL = 'https://cdn.hentaila.com/covers';

function extractSvelteKitDataBlocks(html) {
    const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    const target = scriptMatches.find(m => m[1].includes('kit.start(') && m[1].includes('type:"data"'));
    if (target) {
        try {
            let captured = null;
            const patchedScript = target[1].replace(/Promise\.all\(\[[\s\S]*?\]\)/, 'Promise.all([])');
            const sandbox = {
                document: { currentScript: { parentElement: null } },
                location: 'https://hentaila.com/',
                URL,
                Promise: {
                    all: () => ({
                        then: (cb) => cb([{ start: (_app, _el, opts) => { captured = opts?.data; } }, {}])
                    })
                }
            };
            vm.runInNewContext(patchedScript, sandbox, { timeout: 500 });
            if (Array.isArray(captured)) {
                return captured.map(b => b?.data).filter(Boolean);
            }
        } catch {
            // Fallback to regex extraction below
        }
    }

    const blocks = [];
    const regex = /\{type:"data",data:(\{.*?\}),uses:/g;
    for (const match of html.matchAll(regex)) {
        try {
            const code = '(' + match[1].replace(/void 0/g, 'null') + ')';
            const parsed = vm.runInNewContext(code, Object.create(null), { timeout: 250 });
            if (parsed && typeof parsed === 'object') {
                blocks.push(parsed);
            }
        } catch {
            // Ignore malformed block and try next
        }
    }
    return blocks;
}

class HentailaScraper {
    async fetchHtml(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });
            return response.data;
        } catch (error) {
            console.error(`[HentailaScraper] Error fetching ${url}:`, error.message);
            throw error;
        }
    }

    extractFromHubPayload(html) {
        const blocks = extractSvelteKitDataBlocks(html);
        const hubData = blocks.find(b => b.featured || b.latestEpisodes || b.latestMedia);
        if (!hubData) return [];

        const bySlug = new Map();

        const upsertItem = ({ id, slug, title, synopsis = null, genres = null, status = null }) => {
            if (!slug || !title) return;
            const existing = bySlug.get(slug);
            const coverUrl = id ? `${CDN_COVERS_URL}/${id}.jpg` : null;

            if (existing) {
                if (!existing.synopsis && synopsis) existing.synopsis = synopsis;
                if (!existing.genres && genres) existing.genres = genres;
                if (!existing.status && status) existing.status = status;
                if (coverUrl && existing.poster_path.includes('placeholder')) {
                    existing.poster_path = coverUrl;
                }
                return;
            }

            bySlug.set(slug, {
                id: slug,
                media_id: id || null,
                slug,
                title: String(title).trim(),
                poster_path: coverUrl || 'https://via.placeholder.com/300x450?text=No+Poster',
                synopsis,
                genres,
                status,
                type: 'anime',
                is_nsfw: true
            });
        };

        if (Array.isArray(hubData.latestEpisodes)) {
            for (const ep of hubData.latestEpisodes) {
                if (ep?.media) {
                    upsertItem({
                        id: ep.media.id,
                        slug: ep.media.slug,
                        title: ep.media.title,
                    });
                }
            }
        }

        if (Array.isArray(hubData.latestMedia)) {
            for (const item of hubData.latestMedia) {
                upsertItem({
                    id: item.id,
                    slug: item.slug,
                    title: item.title,
                    synopsis: item.synopsis || null,
                });
            }
        }

        if (Array.isArray(hubData.featured)) {
            for (const item of hubData.featured) {
                upsertItem({
                    id: item.id,
                    slug: item.slug,
                    title: item.title,
                    synopsis: item.synopsis || null,
                    genres: Array.isArray(item.genres) ? item.genres.map(g => g.name).filter(Boolean) : null,
                    status: item.status === 2 ? 'En emisión' : 'Finalizado',
                });
            }
        }

        return Array.from(bySlug.values());
    }

    extractAnimes(html) {
        const fromPayload = this.extractFromHubPayload(html);
        if (fromPayload.length > 0) {
            return fromPayload;
        }

        // Fallback DOM extraction if SvelteKit payload format changes
        const $ = cheerio.load(html);
        const bySlug = new Map();

        $('main article').each((i, el) => {
            const mediaLink = $(el).find('a[href*="/media/"]').first();
            const link = mediaLink.attr('href');
            const title = $(el).find('h2, h3').first().text().trim() || mediaLink.attr('title');
            let poster = $(el).find('img').attr('src');

            if (title && link) {
                const match = link.match(/\/media\/([a-z0-9-]+)/i);
                const slug = match ? match[1] : null;
                if (!slug || bySlug.has(slug)) return;

                if (poster && !poster.startsWith('http')) {
                    poster = poster.startsWith('/') ? BASE_URL + poster : BASE_URL + '/' + poster;
                }

                bySlug.set(slug, {
                    id: slug,
                    slug,
                    title,
                    poster_path: poster || 'https://via.placeholder.com/300x450?text=No+Poster',
                    type: 'anime',
                    is_nsfw: true
                });
            }
        });

        return Array.from(bySlug.values());
    }

    async getLatestHentai() {
        const html = await this.fetchHtml(`${BASE_URL}/hub`);
        return this.extractAnimes(html);
    }

    async getCatalogPage(page = 1) {
        const html = await this.fetchHtml(`${BASE_URL}/catalogo?page=${page}`);
        const blocks = extractSvelteKitDataBlocks(html);
        const cat = blocks.find(b => Array.isArray(b.results));
        if (!cat) return { items: [], totalPages: 1, currentPage: page };

        const items = cat.results
            .filter(r => r && r.slug && r.title)
            .map(r => ({
                id: r.slug,
                media_id: r.id || null,
                slug: r.slug,
                title: String(r.title).trim(),
                poster_path: r.id ? `${CDN_COVERS_URL}/${r.id}.jpg` : 'https://via.placeholder.com/300x450?text=No+Poster',
                synopsis: r.synopsis || null,
                genres: null,
                status: null,
                type: 'anime',
                is_nsfw: true
            }));

        return {
            items,
            totalPages: cat.pagination?.totalPages || 1,
            currentPage: cat.pagination?.currentPage || page,
        };
    }

    async getMediaDetails(slug) {
        const html = await this.fetchHtml(`${BASE_URL}/media/${slug}/1`);
        const blocks = extractSvelteKitDataBlocks(html);
        const dataObj = blocks.find(b => b.media);
        if (!dataObj || !dataObj.media) return null;

        const m = dataObj.media;
        return {
            synopsis: m.synopsis || null,
            genres: Array.isArray(m.genres) ? m.genres.map(g => g.name).filter(Boolean) : null,
            episodes: Array.isArray(m.episodes) ? m.episodes : [],
            status: m.status === 2 ? 'En emisión' : 'Finalizado',
        };
    }

    async getVideoServers(slug, episodeNumber) {
        try {
            const url = `${BASE_URL}/media/${slug}/${episodeNumber}`;
            const html = await this.fetchHtml(url);
            const blocks = extractSvelteKitDataBlocks(html);
            const dataObj = blocks.find(b => b.media && b.embeds);

            if (!dataObj || !dataObj.embeds || !Array.isArray(dataObj.embeds.SUB)) return [];

            const servers = [];
            dataObj.embeds.SUB.forEach(s => {
                if (s.server && s.url) {
                    servers.push({
                        server: s.server,
                        url: s.url
                    });
                }
            });
            return servers;
        } catch (error) {
            console.error(`[HentailaScraper] Error en getVideoServers para ${slug} ep ${episodeNumber}:`, error.message);
            return [];
        }
    }
}

export default new HentailaScraper();
