import pool from '../db.js'
import { ensureTranscodeQueueTables } from './transcodeQueueService.js'
import { transcodeHls } from './transcodeHlsService.js'

export function startTranscodeQueueWorker({ concurrency = 1 } = {}) {
  const max = typeof concurrency === 'number' && concurrency > 0 ? Math.min(concurrency, 4) : 1
  let stopped = false
  let running = 0

  async function runOne() {
    if (stopped) return
    if (running >= max) return
    running += 1
    let jobId = null
    let episodeId = null
    try {
      await ensureTranscodeQueueTables()

      const lock = await pool.query(
        `SELECT id, episode_id, src, attempts
         FROM transcode_jobs
         WHERE status = 'queued'
         ORDER BY updated_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      )

      const job = lock.rows[0]
      if (!job) return
      jobId = job.id
      episodeId = job.episode_id

      await pool.query(
        `UPDATE transcode_jobs
         SET status = 'processing',
             started_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [jobId]
      )

      await pool.query(
        `UPDATE anime_episodes
         SET status = 'processing',
             updated_at = NOW()
         WHERE id = $1`,
        [episodeId]
      )

      const result = await transcodeHls({ src: job.src, episodeId })

      await pool.query(
        `UPDATE anime_episodes
         SET stream_url = $2,
             storage_type = 'r2',
             status = 'ready',
             updated_at = NOW()
         WHERE id = $1`,
        [episodeId, result.stream_url]
      )

      await pool.query(
        `UPDATE transcode_jobs
         SET status = 'done',
             finished_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [jobId]
      )
    } catch (e) {
      try {
        if (!jobId) return
        const msg = e?.message ? String(e.message) : 'Error'
        await pool.query(
          `UPDATE transcode_jobs
           SET status = 'error',
               attempts = attempts + 1,
               last_error = $2,
               finished_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [jobId, msg]
        )
        if (episodeId) {
          await pool.query(
            `UPDATE anime_episodes
             SET status = 'error',
                 updated_at = NOW()
             WHERE id = $1 AND status = 'processing'`,
            [episodeId]
          )
        }
      } catch {
      }
    } finally {
      running -= 1
    }
  }

  async function tick() {
    await runOne()
    if (!stopped) setTimeout(tick, 1200)
  }

  tick()

  return {
    stop: () => {
      stopped = true
    },
  }
}
