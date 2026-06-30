import app from './app.js';
import { ensurePixelNoSekaiTables } from './db/ensureTables.js';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

(async () => {
  // Crear / verificar tablas de Pixel no Sekai
  try {
    await ensurePixelNoSekaiTables();
  } catch (e) {
    console.error('Error asegurando tablas Pixel no Sekai:', e.message);
  }

  // Iniciar schedulers
  try {
    const { startNewsScheduler } = await import('./services/newsScheduler.js');
    startNewsScheduler({ pool: (await import('./db.js')).default });
  } catch (e) {
    console.error('Error iniciando scheduler de noticias:', e.message);
  }

  try {
    const { startMangaScheduler } = await import('./services/mangaScheduler.js');
    startMangaScheduler({ pool: (await import('./db.js')).default });
  } catch (e) {
    console.error('Error iniciando scheduler de manga:', e.message);
  }

  try {
    const { startTranscodeQueueWorker } = await import('./services/transcodeQueueWorker.js');
    startTranscodeQueueWorker({ concurrency: 1 });
  } catch (e) {
    console.error('Error iniciando worker de transcode:', e.message);
  }

  // Arrancar servidor
  app.listen(PORT, HOST, () => {
    console.log(`Backend escuchando en http://${HOST}:${PORT}`);
    console.log(`Acceso local: http://localhost:${PORT}`);
    console.log(`Acceso desde emulador Android: http://10.0.2.2:${PORT}`);
  });
})();
