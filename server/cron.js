import cron from 'node-cron';
import { syncAiringAnimes, updateOngoingAnimes, syncNextCatalogPage, fixMissingImages } from './services/smartBotService.js';
import { runIncrementalMangaScraping } from './services/mangaBotService.js';
import pool from './db.js';

export function startBotSchedulers() {
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

  // Tarea 5: Manga Bot Incremental (Cada 1 hora)
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Ejecutando Manga Bot Incremental...');
    try {
      await runIncrementalMangaScraping(pool, 1, 1);
    } catch (e) {
      console.error('[Cron] Error en Manga Bot:', e.message);
    }
  });

  console.log('[Cron] Tareas del bot configuradas:');
  console.log(' - Update Ongoing: Cada 4 horas');
  console.log(' - Sync Airing: Diario a las 02:00 AM');
  console.log(' - Sync Catalog Incremental: Cada 10 minutos');
  console.log(' - Fix Missing Images: Cada 12 horas');
  console.log(' - Manga Bot Incremental: Cada 1 hora');

  // Inicialización automática si la BD está vacía
  setTimeout(async () => {
    try {
      const res = await pool.query('SELECT COUNT(*) FROM anime_content');
      if (parseInt(res.rows[0].count, 10) === 0) {
        console.log('[Cron] La base de datos de animes está vacía. Iniciando sincronización de estrenos automáticamente...');
        await syncAiringAnimes();
      }
    } catch (e) {
      console.error('[Cron] Error al verificar estado inicial de la BD:', e.message);
    }
  }, 10000); // Esperar 10 segundos para asegurar que todo esté levantado
}
