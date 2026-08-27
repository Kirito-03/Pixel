import fs from 'fs';
import * as cheerio from 'cheerio';
const html = fs.readFileSync('temp_detail.html', 'utf-8');
const $ = cheerio.load(html);
const scriptJson = $('#mk-chapters-data').html();
if(scriptJson){
  try {
    const data = JSON.parse(scriptJson);
    console.log('Items length:', data.items?.length);
    console.log('First item:', data.items?.[0]);
  } catch(e) {
    console.error('Parse error', e.message);
  }
} else {
  console.log('No mk-chapters-data element found in HTML');
}
