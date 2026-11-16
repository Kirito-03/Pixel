import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const exec = promisify(execFile);
const readJson = async (path) => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const keyHash = (key) => createHash('sha256').update(key).digest('hex');
async function saveJson(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

/** One video pipeline on the tablet, including CLI jobs started outside the dashboard. */
export async function withVideoLock(directory, work) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, '.video-job.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await mkdir(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readJson(join(lock, 'owner.json'));
      if (!owner) {
        // A creator may not have written its PID yet; only recover abandoned directories.
        if (Date.now() - (await stat(lock)).mtimeMs < 60000) throw new Error('Ya hay un proceso de video iniciándose.');
      } else {
        try { process.kill(owner.pid, 0); throw new Error(`Ya hay un proceso de video activo (PID ${owner.pid}).`); }
        catch (check) { if (check.code !== 'ESRCH') throw check; }
      }
      if (attempt) throw new Error('No se pudo recuperar el bloqueo de video.');
      await rm(lock, { recursive: true });
    }
  }
  await saveJson(join(lock, 'owner.json'), { pid: process.pid, startedAt: new Date().toISOString() });
  try { return await work(); } finally { await rm(lock, { recursive: true, force: true }); }
}

/** Preserve complete downloads across failures. Never promote a partial curl output. */
export async function ensureVideoDownload({ filePath, sourceKey, resolve, run, probe, adoptLegacy = false, log = console.log }) {
  const markerPath = `${filePath}.download.json`;
  const marker = await readJson(markerPath);
  const sourceHash = keyHash(sourceKey);
  if (existsSync(filePath)) {
    const bytes = (await stat(filePath)).size;
    if ((marker?.sourceHash === sourceHash && marker.bytes === bytes) || (adoptLegacy && !marker)) {
      await probe(filePath);
      if (!marker) await saveJson(markerPath, { sourceHash, bytes, adopted: true });
      log('[DriveResume] Reutilizando descarga completa; no se descarga otra vez.');
      return { reused: true, bytes };
    }
  }
  const source = await resolve();
  if (!source) throw new Error('No se encontró un servidor de descarga compatible.');
  const partial = `${filePath}.download.part`;
  const args = ['--fail', '-sS', '-L', '--connect-timeout', '20', '--max-time', '1800', '--retry', '2'];
  if (source.referer) args.push('-e', source.referer);
  args.push(source.directUrl, '-o', partial);
  await run('curl', args);
  await probe(partial);
  const bytes = (await stat(partial)).size;
  if (bytes <= 102400) throw new Error('Descarga de video incompleta o vacía.');
  await rename(partial, filePath);
  await saveJson(markerPath, { sourceHash, bytes });
  return { reused: false, bytes };
}

export async function fileMd5(path) {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Ask Drive directly: the streaming bridge may still have cached metadata after upload. */
export async function verifyDriveUpload(localPath, target, rcloneBin = 'rclone', capture = exec) {
  const local = await stat(localPath);
  const [result, md5] = await Promise.all([
    capture(rcloneBin, ['lsjson', target, '--stat', '--hash'], { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 }),
    fileMd5(localPath),
  ]);
  const remote = JSON.parse(typeof result === 'string' ? result : result.stdout);
  if (remote.Size !== local.size || String(remote.Hashes?.MD5 || remote.Hashes?.md5 || '').toLowerCase() !== md5) {
    throw new Error('La verificación de tamaño/MD5 en Drive no coincide. Se conservan los archivos para reintentar.');
  }
  return local.size;
}

export async function cleanVideoCheckpoint(inputPath, outputPath) {
  for (const path of [inputPath, `${inputPath}.download.json`, outputPath, `${outputPath}.manifest.json`]) {
    await rm(path, { force: true });
  }
}
