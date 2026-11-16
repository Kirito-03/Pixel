import { runSpanishSynopsisBatch } from './services/spanishSynopsisService.js';
import cron from 'node-cron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { syncAiringAnimes, updateOngoingAnimes, syncNextCatalogPage, fixMissingImages } from './services/smartBotService.js';
import { syncHentaiCatalog, syncNextHentaiCatalogPage } from './services/hentaiBotService.js';
import { syncLatestManga, syncNextMangaCatalogPage } from './services/mangaBotService.js';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

let isDriveIngestRunning = false;

function runScript(scriptRelPath, args = []) {
  return new Promise((resolve) => {
    const scriptPath = join(projectRoot, scriptRelPath);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.on('error', (err) => {
      console.error(`[CronDrive] Error iniciando ${scriptRelPath}:`, err.message);
      resolve();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[CronDrive] ${scriptRelPath} finalizó con código ${code}`);
      }
      resolve();
    });
  });
}

async function runDriveIngestBatch() {
  if (isDriveIngestRunning) {
    console.log('[CronDrive] Ya hay una ingesta a Google Drive en curso, omitiendo ciclo.');
    return;
  }
  isDriveIngestRunning = true;
  console.log('[CronDrive] Iniciando verificación e ingesta controlada a Google Drive (Imágenes/Trailers primero -> Anime -> Manga -> Hentai)...');
  try {
    await runScript('tools/pixel-drive-verify.mjs', ['--repair']);
    await runScript('tools/pixel-drive-ingest.mjs', ['--trailers', '--limit', '5']);
    await runScript('tools/pixel-drive-ingest.mjs', ['--batch', '--limit', '2']);
    await runScript('tools/pixel-drive-manga.mjs', ['--batch', '--limit', '3']);
    await runScript('tools/pixel-drive-hentai.mjs', ['--batch', '--limit', '2']);
    console.log('[CronDrive] ✓ Ciclo automático a Google Drive finalizado.');
  } catch (e) {
    console.error('[CronDrive] Error en lote automático:', e.message);
  } finally {
    isDriveIngestRunning = false;
  }
}

export function startBotSchedulers() {
  cron.schedule('*/10 * * * *', () => runSpanishSynopsisBatch(pool).catch(error => console.warn('[SynopsisES]', error.message)));
  setTimeout(() => runSpanishSynopsisBatch(pool).catch(error => console.warn('[SynopsisES]', error.message)), 60000);
  console.log('[Cron] Inicializando tareas automáticas del Bot...');

  // Tarea 1: Buscar episodios nuevos de animes existentes en emisión (Cada 4 horas)
  // '0 */4 * * *' -> minuto 0, cada 4 horas
  cron.schedule('0 */4 * * *', async () => {
    console.log('[Cron] Ejecutando búsqueda de nuevos episodios (Update Ongoing)...');
    try {
      await updateOngoingAnimes();
    } catch (e) {
      console.error('[Cron] Error en updateOngoingAnimes:', e.message);
    }
  });

  // Tarea 2: Buscar animes de estreno nuevos en JKAnime (1 vez al día a las 2:00 AM)
  // '0 2 * * *' -> minuto 0, a las 2 AM todos los días
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Ejecutando sincronización de estrenos (Sync Airing)...');
    try {
      await syncAiringAnimes();
    } catch (e) {
      console.error('[Cron] Error en syncAiringAnimes:', e.message);
    }
  });

  // Tarea 3: Scraper incremental de catálogo (Cada 10 minutos)
  // '*/10 * * * *' -> cada 10 minutos
  cron.schedule('*/10 * * * *', async () => {
    try {
      await syncNextCatalogPage();
    } catch (e) {
      console.error('[Cron] Error en syncNextCatalogPage:', e.message);
    }
  });

  // Tarea 4: Buscar imágenes/pósters faltantes (Cada 12 horas a las 5:30 y 17:30)
  // '30 5,17 * * *'
  cron.schedule('30 5,17 * * *', async () => {
    console.log('[Cron] Ejecutando búsqueda de fotos faltantes (Fix Missing Images)...');
    try {
      await fixMissingImages();
    } catch (e) {
      console.error('[Cron] Error en fixMissingImages:', e.message);
    }
  });

  // Tarea 5: Manga Bot Novedades (Cada 30 minutos)
  // '*/30 * * * *' -> cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Ejecutando Manga Bot Novedades...');
    try {
      await syncLatestManga(pool);
    } catch (e) {
      console.error('[Cron] Error en Manga Bot Novedades:', e.message);
    }
  });

  // Tarea 6: Manga Bot Catálogo Incremental (Cada 20 minutos)
  cron.schedule('*/20 * * * *', async () => {
    try {
      await syncNextMangaCatalogPage(pool);
    } catch (e) {
      console.error('[Cron] Error en Manga Bot Catálogo:', e.message);
    }
  });

  // Tarea 7: Hentai Bot Sincronización /hub (Cada 30 minutos)
  // '*/30 * * * *' -> cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Ejecutando Hentai Bot (/hub)...');
    try {
      await syncHentaiCatalog(pool);
    } catch (e) {
      console.error('[Cron] Error en Hentai Bot:', e.message);
    }
  });

  // Tarea 8: Hentai Bot Catálogo Incremental (Cada 15 minutos)
  cron.schedule('*/15 * * * *', async () => {
    try {
      await syncNextHentaiCatalogPage(pool);
    } catch (e) {
      console.error('[Cron] Error en Hentai Bot Catálogo:', e.message);
    }
  });

  // Tarea 9: Verificación e Ingesta Controlada a Google Drive (Cada 45 minutos, secuencial sin saturar CPU/red)
  cron.schedule('*/45 * * * *', async () => {
    try {
      await runDriveIngestBatch();
    } catch (e) {
      console.error('[Cron] Error en Drive Ingest Batch:', e.message);
    }
  });

  console.log('[Cron] Tareas del bot configuradas:');
  console.log(' - Update Ongoing: Cada 4 horas');
  console.log(' - Sync Airing: Diario a las 02:00 AM');
  console.log(' - Sync Catalog Incremental: Cada 10 minutos');
  console.log(' - Fix Missing Images: Cada 12 horas');
  console.log(' - Manga Bot Novedades: Cada 30 minutos');
  console.log(' - Manga Bot Catálogo Incremental: Cada 20 minutos');
  console.log(' - Hentai Bot (/hub): Cada 30 minutos');
  console.log(' - Hentai Bot Catálogo Incremental: Cada 15 minutos');
  console.log(' - Google Drive Ingest & Verify: Cada 45 minutos (+ arranque inicial)');

  // Primer ciclo suave de verificación/ingesta a Drive 45s después del arranque
  setTimeout(() => {
    runDriveIngestBatch().catch((e) => {
      console.error('[CronDrive] Error en ciclo inicial:', e.message);
    });
  }, 45000);

  // Inicialización automática si la BD está vacía
  setTimeout(async () => {
    try {
      const res = await pool.query('SELECT COUNT(*) FROM anime_content');
      if (parseInt(res.rows[0].count, 10) === 0) {
        console.log('[Cron] La base de datos de animes está vacía. Iniciando sincronización de estrenos automáticamente...');
        await syncAiringAnimes();
      }

      const resHentai = await pool.query('SELECT COUNT(*) FROM hentai_content');
      if (parseInt(resHentai.rows[0].count, 10) === 0) {
        console.log('[Cron] La base de datos de H Anime está vacía. Iniciando primera sincronización...');
        await syncHentaiCatalog(pool);
      }

      const resManga = await pool.query('SELECT COUNT(*) FROM manga_cache');
      if (parseInt(resManga.rows[0].count, 10) === 0) {
        console.log('[Cron] La base de datos de Manga está vacía. Iniciando primera sincronización...');
        await syncLatestManga(pool);
      }
    } catch (e) {
      console.error('[Cron] Error al verificar estado inicial de la BD:', e.message);
    }
  }, 10000); // Esperar 10 segundos para asegurar que todo esté levantado
}
