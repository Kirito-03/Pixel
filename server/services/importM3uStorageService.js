import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function getImportsDir() {
  return join(__dirname, '..', 'uploads', 'imports')
}

export async function ensureImportsDir() {
  const dir = getImportsDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

export async function saveM3uText({ content, name }) {
  const dir = await ensureImportsDir()
  const safeName = String(name || 'playlist.m3u').replace(/[^a-zA-Z0-9._-]/g, '_')
  const ts = Date.now()
  const fileName = `m3u-${ts}-${safeName.endsWith('.m3u') ? safeName : `${safeName}.m3u`}`
  const full = join(dir, fileName)
  await writeFile(full, String(content || ''), 'utf8')
  return { fileName, fullPath: full }
}

export async function cleanupImports({ retentionDays = 7 } = {}) {
  const dir = await ensureImportsDir()
  const files = await readdir(dir)
  const now = Date.now()
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000
  let deleted = 0
  for (const f of files) {
    const full = join(dir, f)
    try {
      const st = await stat(full)
      const age = now - st.mtimeMs
      if (age > maxAgeMs) {
        await unlink(full)
        deleted += 1
      }
    } catch {
    }
  }
  return { deleted }
}
