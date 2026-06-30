import pool from '../db.js'

export async function ensureTranscodeQueueTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transcode_jobs (
      id BIGSERIAL PRIMARY KEY,
      episode_id INTEGER NOT NULL,
      src TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error', 'canceled')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      finished_at TIMESTAMP
    );
  `)
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_transcode_jobs_episode_id ON transcode_jobs(episode_id);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transcode_jobs_status ON transcode_jobs(status, updated_at DESC);`)
}

export async function enqueueTranscodeJob({ episodeId, src }) {
  await ensureTranscodeQueueTables()
  const r = await pool.query(
    `INSERT INTO transcode_jobs (episode_id, src, status, attempts, updated_at)
     VALUES ($1, $2, 'queued', 0, CURRENT_TIMESTAMP)
     ON CONFLICT (episode_id)
     DO UPDATE SET
       src = EXCLUDED.src,
       status = CASE
         WHEN transcode_jobs.status IN ('done', 'error', 'canceled') THEN 'queued'
         ELSE transcode_jobs.status
       END,
       last_error = NULL,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, episode_id, status, attempts`,
    [episodeId, src]
  )
  return r.rows[0]
}

export async function listTranscodeJobs({ status, limit }) {
  await ensureTranscodeQueueTables()
  const lim = typeof limit === 'number' && limit > 0 ? Math.min(limit, 200) : 100
  const params = []
  let sql = `SELECT id, episode_id, src, status, attempts, last_error, created_at, updated_at, started_at, finished_at FROM transcode_jobs`
  if (status) {
    params.push(status)
    sql += ` WHERE status = $1`
  }
  sql += ` ORDER BY updated_at DESC LIMIT ${lim}`
  const r = await pool.query(sql, params)
  return r.rows
}

export async function getTranscodeJobSummary() {
  await ensureTranscodeQueueTables()
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM transcode_jobs
     GROUP BY status`
  )
  const byStatus = {}
  for (const row of r.rows) byStatus[row.status] = row.count
  return byStatus
}

export async function retryTranscodeJob(jobId) {
  await ensureTranscodeQueueTables()
  const r = await pool.query(
    `UPDATE transcode_jobs
     SET status = 'queued',
         last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, episode_id, status`,
    [jobId]
  )
  return r.rows[0] || null
}
