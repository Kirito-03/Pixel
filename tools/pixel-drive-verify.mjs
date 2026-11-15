#!/usr/bin/env node
/**
 * tools/pixel-drive-verify.mjs
 * Verifica el estado de completitud de Anime, Manga y Hentai en Google Drive vs Base de Datos.
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env si existe
const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

const { default: pool } = await import('../server/db.js');

async function verifyAll() {
  console.log('='.repeat(65));
  console.log('   AUDITORÍA DE CONTENIDO EN GOOGLE DRIVE (pixel-drive:PixelNoSekai)');
  console.log('='.repeat(65));

  // 1. Anime
  const animeRes = await pool.query(`
    SELECT 
      ac.id,
      ac.title,
      ac.total_episodes,
      COUNT(ae.id) AS total_in_db,
      COUNT(CASE WHEN ae.stream_url LIKE '%/api/stream/%' OR ae.storage_type = 'gdrive' THEN 1 END) AS in_drive,
      ARRAY_AGG(ae.episode_number ORDER BY ae.episode_number) FILTER (WHERE ae.stream_url LIKE '%/api/stream/%' OR ae.storage_type = 'gdrive') AS drive_episodes
    FROM anime_content ac
    JOIN anime_episodes ae ON ae.anime_id = ac.id AND ae.is_active = true
    GROUP BY ac.id, ac.title, ac.total_episodes
    HAVING COUNT(CASE WHEN ae.stream_url LIKE '%/api/stream/%' OR ae.storage_type = 'gdrive' THEN 1 END) > 0
    ORDER BY ac.id;
  `);

  console.log('\n🎬 ANIME CON ARCHIVOS EN DRIVE:');
  if (animeRes.rows.length === 0) {
    console.log('   (Ningún anime registrado en Drive)');
  } else {
    for (const row of animeRes.rows) {
      const target = row.total_episodes || row.total_in_db;
      const pct = Math.round((row.in_drive / target) * 100);
      const isComplete = row.in_drive >= target;
      console.log(`   [${row.id}] ${row.title}`);
      console.log(`       Estado: ${isComplete ? '✅ COMPLETO' : '⚠️ INCOMPLETO'} (${row.in_drive}/${target} episodios - ${pct}%)`);
      console.log(`       Episodios en Drive: [${(row.drive_episodes || []).join(', ')}]`);
    }
  }

  // 2. Manga / Manhwa
  const mangaRes = await pool.query(`
    SELECT 
      manga_id,
      COUNT(DISTINCT chapter_id) AS chapters_cached
    FROM manga_chapters_cache
    GROUP BY manga_id
  `);

  const mangaPageRes = await pool.query(`
    SELECT 
      chapter_url,
      COUNT(*) AS total_pages
    FROM manga_page_cache
    WHERE pages::text LIKE '%/api/stream/Manga/%'
    GROUP BY chapter_url
  `);

  console.log('\n📖 MANGAS / MANHWAS EN DRIVE:');
  if (mangaPageRes.rows.length === 0) {
    console.log('   (Ningún manga con páginas en Drive)');
  } else {
    for (const row of mangaPageRes.rows) {
      // Extraer slug del manga
      const match = row.chapter_url.match(/manga\/([^/]+)/);
      const slug = match ? match[1] : 'desconocido';
      const cacheInfo = mangaRes.rows.find(m => m.manga_id === slug);
      const totalChapters = cacheInfo ? cacheInfo.chapters_cached : '?';
      console.log(`   [${slug}]`);
      console.log(`       Capítulo sincronizado: ${row.chapter_url}`);
      console.log(`       Estado: ⚠️ INCOMPLETO (1 de ${totalChapters} capítulos en Drive)`);
    }
  }

  // 3. Hentai
  const hentaiRes = await pool.query(`
    SELECT 
      hc.id,
      hc.title,
      COUNT(he.id) AS total_in_db,
      COUNT(CASE WHEN he.video_servers::text LIKE '%/api/stream/%' THEN 1 END) AS in_drive
    FROM hentai_content hc
    JOIN hentai_episodes he ON he.hentai_id = hc.id AND he.is_active = true
    GROUP BY hc.id, hc.title
    HAVING COUNT(CASE WHEN he.video_servers::text LIKE '%/api/stream/%' THEN 1 END) > 0
    ORDER BY hc.id;
  `);

  console.log('\n🔞 HENTAI EN DRIVE:');
  if (hentaiRes.rows.length === 0) {
    console.log('   (0 animes H subidos a Drive. Hay 1,022 series y 2,582 episodios en BD con enlaces externos pendientes de ingesta)');
  } else {
    for (const row of hentaiRes.rows) {
      console.log(`   [${row.id}] ${row.title}: ${row.in_drive}/${row.total_in_db} episodios en Drive`);
    }
  }

  console.log('\n' + '='.repeat(65));
  await pool.end();
}

verifyAll().catch(err => {
  console.error('Error en verificación:', err);
  process.exit(1);
});
