import cron from 'node-cron';
import { syncAiringAnimes, updateOngoingAnimes } from './services/smartBotService.js';

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

  console.log('[Cron] Tareas del bot configuradas:');
  console.log(' - Update Ongoing: Cada 4 horas');
  console.log(' - Sync Airing: Diario a las 02:00 AM');
}
