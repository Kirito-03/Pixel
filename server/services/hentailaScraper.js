import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://hentaila.com';

class HentailaScraper {
    async fetchHtml(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            console.error(`[HentailaScraper] Error fetching ${url}:`, error.message);
            throw error;
        }
    }

    extractAnimes(html) {
        const $ = cheerio.load(html);
        const animes = [];

        // Hentaila list items
        $('main article').each((i, el) => {
            const title = $(el).find('h2, h3, header').text().trim() || $(el).find('a').attr('title');
            const link = $(el).find('a').first().attr('href');
            let poster = $(el).find('img').attr('src');
            
            if (title && link) {
                let slug = link;
                if (slug.startsWith(BASE_URL)) slug = slug.replace(BASE_URL, '');
                
                // Extraer de /media/slug/1 o /hentai/slug
                const match = slug.match(/\/(?:media|hentai|ver)\/([a-z0-9-]+)/);
                if (match) {
                    slug = match[1];
                } else {
                    slug = slug.replace('/hentai/', '').replace('/ver/', '').replace('/', '');
                }
                
                if (poster && !poster.startsWith('http')) {
                    poster = poster.startsWith('/') ? BASE_URL + poster : BASE_URL + '/' + poster;
                }
                
                animes.push({
                    id: slug,
                    slug,
                    title,
                    poster_path: poster || 'https://via.placeholder.com/300x450?text=No+Poster',
                    type: 'anime',
                    is_nsfw: true
                });
            }
        });

        return animes;
    }

    async getLatestHentai() {
        const html = await this.fetchHtml(`${BASE_URL}`); // Use the home page where latest hentai are usually listed
        return this.extractAnimes(html);
    }

    async getVideoServers(slug, episodeNumber) {
        // Hentaila URLs usually look like /media/{slug}/{episodeNumber}
        const url = `${BASE_URL}/media/${slug}/${episodeNumber}`;
        const html = await this.fetchHtml(url);
        
        // Find the embeds in the JSON string inside a script tag
        const embedsMatch = html.match(/"embeds"\s*:\s*({.*?})/);
        if (!embedsMatch) {
            return [];
        }

        try {
            // The matched string is valid JSON representing the embeds object
            const embedsData = JSON.parse(embedsMatch[1]);
            const servers = [];
            
            // "SUB" usually contains the array of servers
            if (embedsData.SUB && Array.isArray(embedsData.SUB)) {
                embedsData.SUB.forEach(s => {
                    if (s.server && s.url) {
                        servers.push({
                            server: s.server,
                            url: s.url
                        });
                    }
                });
            }

            return servers;
        } catch (error) {
            console.error('[HentailaScraper] Error parsing servers JSON:', error.message);
            return [];
        }
    }
}

export default new HentailaScraper();
