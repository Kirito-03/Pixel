#!/usr/bin/env node
/**
 * tools/pixel-dedup-animes.mjs
 * Limpia y consolida animes duplicados en la base de datos de Pixel no Sekai.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const projectRoot = join(homedir(), 'server/cloud/proyectos/Pixel');
const envFile = existsSync(join(projectRoot, '.env')) ? join(projectRoot, '.env') : '.env';
if (typeof process.loadEnvFile === 'function' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const { default: pool } = await import('../server/db.js');

async function deduplicate() {
  console.log('[Dedup] Buscando animes con títulos repetidos...');
  const res = await pool.query(`
    SELECT LOWER(TRIM(title)) as norm_title, ARRAY_AGG(id ORDER BY id ASC) as ids
    FROM anime_content
    WHERE is_active = true
    GROUP BY LOWER(TRIM(title))
    HAVING COUNT(*) > 1
  `);

  if (res.rows.length === 0) {
    console.log('[Dedup] No se encontraron animes duplicados.');
    return;
  }

  console.log(`[Dedup] Encontrados ${res.rows.length} grupos de animes duplicados:`);

  for (const row of res.rows) {
    const ids = row.ids;
    const primaryId = ids[0];
    const duplicateIds = ids.slice(1);

    console.log(`\n→ Grupo "${row.norm_title}":`);
    console.log(`   Principal (se conserva): ID ${primaryId}`);
    console.log(`   Duplicados (a eliminar): IDs [${duplicateIds.join(', ')}]`);

    // 1. Borrar episodios asociados a los IDs duplicados
    const epDelete = await pool.query(
      `DELETE FROM anime_episodes WHERE anime_id = ANY($1::int[])`,
      [duplicateIds]
    );
    console.log(`   ✓ ${epDelete.rowCount} episodios duplicados eliminados.`);

    // 2. Borrar alias si existen
    try {
      await pool.query(
        `DELETE FROM anime_title_aliases WHERE anime_id = ANY($1::int[])`,
        [duplicateIds]
      );
    } catch {}

    // 3. Borrar registros de anime_content duplicados
    const animeDelete = await pool.query(
      `DELETE FROM anime_content WHERE id = ANY($1::int[])`,
      [duplicateIds]
    );
    console.log(`   ✓ ${animeDelete.rowCount} fichas de anime duplicadas eliminadas.`);
  }

  console.log('\n[Dedup] ¡Limpieza de duplicados completada con éxito!');
}

deduplicate()
  .then(() => pool.end())
  .catch((e) => {
    console.error('[Dedup] Error:', e);
    pool.end();
    process.exit(1);
  });
