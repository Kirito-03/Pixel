import crypto from 'crypto'
import { spawn } from 'child_process'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pool from '../db.js'
import { uploadHlsFolderToR2, deleteLocalHlsFolder } from './r2Service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function waitForFile(filePath, maxMs = 30_000, intervalMs = 300) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let errBuf = ''
    ff.stderr.on('data', (d) => {
      try {
        errBuf += d.toString()
      } catch {
      }
    })

    ff.on('close', (code) => {
      if (code === 0) resolve()
      reject(new Error(`ffmpeg salió con código ${code}.\n${errBuf.slice(-3000)}`))
    })

    ff.on('error', (err) => reject(err))
  })
}

export async function transcodeHls({ src, episodeId }) {
  if (!src) throw new Error('El campo "src" es requerido')

  const id = crypto.createHash('md5').update(src).digest('hex')
  const outDir = join(__dirname, '..', 'hls', id)
  const playlistPath = join(outDir, 'index.m3u8')

  if (episodeId) {
    const existing = await pool.query('SELECT stream_url FROM anime_episodes WHERE id = $1', [episodeId])
    if (existing.rows[0]?.stream_url) {
      return { id, stream_url: existing.rows[0].stream_url, cached: true }
    }
  }

  if (!existsSync(playlistPath)) {
    mkdirSync(outDir, { recursive: true })

    const segmentPattern = join(outDir, 'segment%03d.ts')
    const isMp4 = /\.mp4(\?|$)/i.test(src)

    const ffArgs = [
      '-loglevel',
      'error',
      '-y',
      '-i',
      src,
      ...(isMp4
        ? ['-c:v', 'copy', '-c:a', 'copy']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k']),
      '-f',
      'hls',
      '-hls_time',
      '6',
      '-hls_list_size',
      '0',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      segmentPattern,
      playlistPath,
    ]

    await runFfmpeg(ffArgs)

    const found = await waitForFile(playlistPath, 5_000)
    if (!found) {
      throw new Error('ffmpeg terminó pero index.m3u8 no se creó en disco')
    }
  }

  const streamUrl = await uploadHlsFolderToR2({ localDir: outDir, hlsId: id })

  if (episodeId) {
    await pool.query(
      `UPDATE anime_episodes
       SET stream_url    = $1,
           storage_type  = 'r2',
           updated_at    = NOW()
       WHERE id = $2`,
      [streamUrl, episodeId]
    )
  }

  await deleteLocalHlsFolder(outDir)

  return { id, stream_url: streamUrl }
}
