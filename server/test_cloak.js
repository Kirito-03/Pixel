import { launch } from 'cloakbrowser';
import fs from 'fs';
(async () => {
  const browser = await launch({ headless: true, humanize: true });
  const page = await browser.newPage();
  await page.goto('https://dragontranslation.org/manga', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 8000));
  const html = await page.content();
  fs.writeFileSync('cloak_out.html', html);
  await browser.close();
})();
