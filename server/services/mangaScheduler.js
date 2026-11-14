import { refreshMangaPopularCache } from './mangaService.js';

async function getLastRun(pool, jobKey) {
  const r = await pool.query(`SELECT last_run_at FROM pns_job_runs WHERE job_key = $1 LIMIT 1`, [jobKey]);
  return r.rows[0]?.last_run_at ? new Date(r.rows[0].last_run_at).getTime() : 0;
}

async function setLastRun(pool, jobKey) {
  await pool.query(
    `
    INSERT INTO pns_job_runs (job_key, last_run_at, updated_at)
    VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (job_key)
    DO UPDATE SET last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `,
    [jobKey]
  );
}

export function startMangaScheduler({ pool }) {
  const jobKey = 'manga_refresh_popular';
  const intervalMs = 12 * 60 * 60 * 1000;

  const run = async (reason) => {
    try {
      const last = await getLastRun(pool, jobKey);
      if (Date.now() - last < intervalMs) return;
      const result = await refreshMangaPopularCache(pool);
      if (result?.ok) await setLastRun(pool, jobKey);
      console.log('[MangaScheduler]', reason, { ok: !!result?.ok, count: Number(result?.count || 0) });
    } catch (e) {
      console.log('[MangaScheduler][ERR]', e?.message);
    }
  };

  run('startup');
  setInterval(() => run('interval'), intervalMs);
}

