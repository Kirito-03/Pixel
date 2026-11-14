import { refreshNews } from './newsService.js';

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

export function startNewsScheduler({ pool }) {
  const jobKey = 'news_refresh';
  const intervalMs = 6 * 60 * 60 * 1000;

  const run = async (reason) => {
    try {
      const last = await getLastRun(pool, jobKey);
      if (Date.now() - last < intervalMs) return;
      const result = await refreshNews(pool);
      if (result?.ok) await setLastRun(pool, jobKey);
      console.log('[NewsScheduler]', reason, {
        ok: !!result?.ok,
        source: result?.source || null,
        fetched: Number(result?.fetched || 0),
        enriched_images: Number(result?.enriched_images || 0),
        inserted: Number(result?.inserted || 0),
        updated: Number(result?.updated || 0),
        skipped: Number(result?.skipped || 0),
        deactivated: Number(result?.deactivated || 0),
        message: result?.message || null,
      });
    } catch (e) {
      console.log('[NewsScheduler][ERR]', e?.message);
    }
  };

  run('startup');
  setInterval(() => run('interval'), intervalMs);
}
