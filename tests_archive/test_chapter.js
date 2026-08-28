import { fetchHtmlWithCloak } from './server/services/mangaService.js';
import * as cheerio from 'cheerio';
import fs from 'fs';

(async () => {
  try {
    console.log('Fetching details...');
    const html = await fetchHtmlWithCloak('https://dragontranslation.org/manga/i3wt8mwndw41dh8/', null, 60000);
    console.log('Fetched! Length:', html.length);
    const $ = cheerio.load(html);
    console.log('mk-chapters-data:', $('#mk-chapters-data').html() ? 'Found' : 'Not found');
    console.log('Chapters li count:', $('li.wp-manga-chapter').length);
    console.log('Chapters div count:', $('div.chapter-list').length);
    
    // Save to temp
    fs.writeFileSync('temp_detail.html', html);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
