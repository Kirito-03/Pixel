import { launch } from 'cloakbrowser';
import fs from 'fs';

(async () => {
  console.log('Lanzando CloakBrowser en modo debug...');
  const browser = await launch({ 
    headless: true, 
    humanize: true,
    args: ['--fingerprint-platform=linux']
  });
  
  const page = await browser.newPage();
  console.log('Navegando a DragonTranslation...');
  const res = await page.goto('https://dragontranslation.org/manga/?m_orderby=latest', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('Estado HTTP:', res.status());
  
  try {
    console.log('Esperando .acard hasta 30 segundos...');
    await page.waitForSelector('.acard', { timeout: 30000 });
    console.log('¡.acard ENCONTRADO! El bypass funcionó.');
  } catch (e) {
    console.log('Timeout. No se encontró .acard. Analizando la página...');
  }
  
  const html = await page.content();
  const title = await page.title();
  
  console.log('\nTítulo de la página:', title);
  
  if (html.includes('Cloudflare')) {
    console.log('🚨 CLOUDFLARE DETECTADO.');
    if (html.includes('Access denied') || html.includes('1020')) {
      console.log('🛑 ERROR 1020: Tu IP del servidor está baneada (Access Denied).');
    } else {
      console.log('🔄 Desafío de Cloudflare activo (Turnstile loop).');
    }
  } else if (html.includes('acard')) {
     console.log('✅ Parece que hay acard en el HTML pero el selector falló. (Client-side rendering delay?)');
  } else {
     console.log('❓ Contenido desconocido. Revisa el HTML guardado en /tmp/debug.html');
  }
  
  fs.writeFileSync('/tmp/debug.html', html);
  await browser.close();
  process.exit(0);
})();
