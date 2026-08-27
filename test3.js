import fs from 'fs';
import * as cheerio from 'cheerio';
const html = fs.readFileSync('temp_detail.html', 'utf-8');
const $ = cheerio.load(html);
console.log('htitle:', $('.htitle').length);
