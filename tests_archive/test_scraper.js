import { fetchHtmlWithCloak } from './services/mangaService.js';
import * as cheerio from 'cheerio';

async function run() {
  try {
    const html = await fetchHtmlWithCloak('https://dragontranslation.org/manga/');
    const $ = cheerio.load(html);
    console.log("Found .acard:", $('.acard').length);
    console.log("Found .page-item-detail:", $('.page-item-detail').length);
    console.log("Found .manga-item:", $('.manga-item').length);
    console.log("Found .item:", $('.item').length);
    console.log("Found .bsx:", $('.bsx').length);
    console.log("Found .post-title:", $('.post-title').length);
    
    // print out some inner html of the body to see the structure
    console.log("First 1000 chars of body:", $('body').html().substring(0, 1000));
  } catch (err) {
    console.error(err);
  }
}

run();
