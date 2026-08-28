import * as cheerio from 'cheerio';
import fs from 'fs';

async function run() {
    const r = await fetch('https://hentaila.com');
    const html = await r.text();
    fs.writeFileSync('hentaila_home.html', html);
    const $ = cheerio.load(html);
    const links = [];
    $('a').each((i, el) => {
        links.push($(el).attr('href'));
    });
    console.log([...new Set(links)].filter(l => l && l.includes('media')).slice(0, 20));
}
run();
