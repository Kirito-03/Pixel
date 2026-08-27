import fs from 'fs';
import { getBrowserPage } from './services/mangaService.js';

(async () => {
  console.log('Testing CloakBrowser on VPS...');
  let page;
  try {
    const browserData = await getBrowserPage();
    page = browserData.page;
    
    console.log('Navigating to dragontranslation.org...');
    await page.goto('https://dragontranslation.org/manga/i3wt8mwndw41dh8/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Waiting 15 seconds for Cloudflare...');
    await new Promise(r => setTimeout(r, 15000));
    
    const html = await page.content();
    fs.writeFileSync('cloak_out.html', html);
    console.log('Saved HTML to cloak_out.html (Length: ' + html.length + ')');
    
    await page.screenshot({ path: 'cloak_screenshot.png', fullPage: true });
    console.log('Saved screenshot to cloak_screenshot.png');
    
    console.log('Done!');
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
