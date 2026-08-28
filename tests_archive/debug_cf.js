import { launch } from 'cloakbrowser';
import fs from 'fs';

(async () => {
  console.log('Lanzando CloakBrowser en modo debug...');
  const browser = await launch({ 
    headless: true, 
    humanize: true,
    args: ['--fingerprint-platform=linux', '--disable-http2', '--proxy-server=socks5://100.95.206.57:1080']
  });
  
  const page = await browser.newPage();
  
  // Cancelar automáticamente cualquier alerta o confirmación para evitar popups de publicidad
  page.on('dialog', async dialog => {
    console.log('Dialog detectado:', dialog.message(), '- Cancelando.');
    await dialog.dismiss();
  });
  
  console.log('Navegando a DragonTranslation...');
  const res = await page.goto('https://dragontranslation.org/manga/?m_orderby=latest', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('Estado HTTP:', res.status());
  
  try {
    console.log('Buscando iframe de Cloudflare Turnstile...');
    const iframe = await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 5000 });
    if (iframe) {
      console.log('Iframe de Turnstile encontrado, intentando hacer clic como humano...');
      const box = await iframe.boundingBox();
      if (box) {
        // Clic en el centro del widget, simulando comportamiento humano
        await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 10 });
        await new Promise(r => setTimeout(r, 1000));
        await page.mouse.click(box.x + 30, box.y + box.height / 2);
        console.log('Clic enviado al widget de Turnstile.');
      }
    }
  } catch (e) {
    console.log('No se mostró el widget interactivo de Turnstile (es invisible o no cargó).');
  }

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
