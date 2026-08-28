import pool from './db.js';
import { autoFillMetadata } from './services/smartBotService.js';

async function fixRatings() {
  try {
    const res = await pool.query('SELECT id, title FROM anime_content');
    console.log(`Encontrados ${res.rows.length} animes para actualizar.`);
    
    for (const anime of res.rows) {
      console.log(`Actualizando metadatos para: ${anime.title}...`);
      await autoFillMetadata(anime.id);
      // Wait a bit to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('¡Actualización terminada!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixRatings();
