import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const POLICY = Object.freeze({ version: 1, codec: 'av1', crf: 25, svtPreset: 8, aomCpuUsed: 6, threads: 2 });
const encoderCache = new Map();

function run(bin, args, { timeoutMs = 60_000, progress = false } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', progress ? 'inherit' : 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-1_048_576); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-32_768); });
    const timer = timeoutMs ? setTimeout(() => child.kill('SIGTERM'), timeoutMs) : null;
    child.once('error', error => { if (timer) clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolveResult(stdout);
      else reject(new Error(`${bin} terminó con ${signal || code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

function ratio(value) {
  if (typeof value === 'number') return value;
  const [numerator, denominator = '1'] = String(value || '').split('/').map(Number);
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 ? result : null;
}

export async function probeVideo(path, ffprobeBin = 'ffprobe') {
  const raw = await run(ffprobeBin, [
    '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', path,
  ]);
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('ffprobe no devolvió metadatos de vídeo válidos.'); }
  const video = data.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const duration = Number(video?.duration || data.format?.duration);
  if (!video?.codec_name || !(Number(video.width) > 0) || !(Number(video.height) > 0) || !(duration > 0)) {
    throw new Error('El archivo no contiene un vídeo completo con dimensiones y duración válidas.');
  }
  return {
    codec: video.codec_name, streamIndex: video.index ?? 0, width: Number(video.width), height: Number(video.height), duration,
    fps: ratio(video.avg_frame_rate) || ratio(video.r_frame_rate), pixelFormat: video.pix_fmt,
    audio: (data.streams || []).filter(stream => stream.codec_type === 'audio').map(stream => ({
      codec: stream.codec_name, channels: stream.channels, sampleRate: stream.sample_rate,
    })),
  };
}

async function selectEncoder(ffmpegBin, pixelFormat) {
  if (!encoderCache.has(ffmpegBin)) {
    const pending = run(ffmpegBin, ['-hide_banner', '-encoders']).then(output => ({
      svt: /\blibsvtav1\b/.test(output), aom: /\blibaom-av1\b/.test(output),
    }));
    encoderCache.set(ffmpegBin, pending);
    pending.catch(() => encoderCache.delete(ffmpegBin));
  }
  const available = await encoderCache.get(ffmpegBin);
  if (available.svt && ['yuv420p', 'yuv420p10le'].includes(pixelFormat)) return 'libsvtav1';
  if (available.aom) return 'libaom-av1';
  throw new Error('Este FFmpeg no dispone de un codificador AV1 compatible (libsvtav1 o libaom-av1). Se conserva la descarga para reintentar; no se convierte a H.264.');
}

function validateOutput(input, output) {
  if (output.codec !== 'av1') throw new Error('La salida preparada no es AV1.');
  if (input.width !== output.width || input.height !== output.height) throw new Error('La salida cambió la resolución original.');
  if (input.pixelFormat !== output.pixelFormat) throw new Error('La salida cambió la profundidad o el formato de píxel original.');
  if (Math.abs(input.duration - output.duration) > Math.max(0.5, input.duration * 0.001)) {
    throw new Error('La salida AV1 tiene una duración incompleta o distinta del original.');
  }
  if (input.fps && (!output.fps || Math.abs(input.fps - output.fps) / input.fps > 0.001)) {
    throw new Error('La salida cambió los fotogramas por segundo del original.');
  }
  if (JSON.stringify(input.audio) !== JSON.stringify(output.audio)) throw new Error('La salida no conservó los flujos de audio originales.');
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function fingerprint(path, info) {
  return { path, bytes: info.size, mtimeMs: info.mtimeMs };
}

/** Keep prepared files after failed uploads. The caller removes them only after Drive + DB succeed. */
export async function prepareAv1Video({ inputPath, outputPath, ffmpegBin = 'ffmpeg', ffprobeBin = 'ffprobe', log = console.log }) {
  const input = resolve(inputPath);
  const output = resolve(outputPath);
  if (input === output) throw new Error('La entrada y la salida del vídeo deben ser archivos diferentes.');
  const sourceStat = await stat(input);
  if (!sourceStat.isFile() || sourceStat.size === 0) throw new Error('La descarga de entrada está vacía o no es un archivo.');
  const sourceFingerprint = fingerprint(input, sourceStat);
  const manifestPath = `${output}.manifest.json`;
  const manifestTemp = `${manifestPath}.partial`;
  const partial = `${output}.partial.mp4`;
  const sourceProbe = await probeVideo(input, ffprobeBin);
  const encoder = sourceProbe.codec === 'av1' ? 'copy' : await selectEncoder(ffmpegBin, sourceProbe.pixelFormat);
  const profile = { ...POLICY, encoder, ffmpegBin, pixelFormat: sourceProbe.pixelFormat };

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (JSON.stringify(manifest.input) === JSON.stringify(sourceFingerprint) &&
        JSON.stringify(manifest.profile) === JSON.stringify(profile)) {
      const preparedStat = await stat(output);
      if (preparedStat.size === manifest.output.bytes && await sha256(output) === manifest.output.sha256) {
        const preparedProbe = await probeVideo(output, ffprobeBin);
        validateOutput(sourceProbe, preparedProbe);
        log('[AV1] Archivo preparado verificado: se reanuda la subida sin descargar ni recodificar.');
        return { codec: 'av1', bytes: preparedStat.size, reused: true, mode: manifest.mode, manifestPath };
      }
    }
  } catch { /* Missing, stale or incomplete preparations must never be reused. */ }

  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await rm(partial, { force: true });
  const args = ['-hide_banner', '-nostdin', '-y', '-threads', String(POLICY.threads), '-i', input,
    '-map', `0:${sourceProbe.streamIndex}`, '-map', '0:a?', '-map_metadata', '0'];
  const mode = encoder === 'copy' ? 'remux' : 'encode';
  if (encoder === 'copy') {
    log('[AV1] Vídeo AV1 existente: copia directa de vídeo y audio, sin pérdida de calidad.');
    args.push('-c', 'copy');
  } else {
    log(`[AV1] Conversión única con ${encoder}; resolución, fotogramas y audio originales conservados.`);
    args.push('-c:v', encoder, '-crf', String(POLICY.crf), '-b:v', '0', '-threads', String(POLICY.threads),
      '-filter_threads', '1', '-fps_mode', 'passthrough', '-c:a', 'copy');
    if (sourceProbe.pixelFormat) args.push('-pix_fmt', sourceProbe.pixelFormat);
    if (encoder === 'libsvtav1') args.push('-preset', String(POLICY.svtPreset), '-svtav1-params', `lp=${POLICY.threads}`);
    else args.push('-cpu-used', String(POLICY.aomCpuUsed), '-row-mt', '1');
  }
  args.push('-movflags', '+faststart', '-f', 'mp4', partial);

  try {
    await run(ffmpegBin, args, { timeoutMs: 0, progress: true });
    const preparedProbe = await probeVideo(partial, ffprobeBin);
    validateOutput(sourceProbe, preparedProbe);
    if (JSON.stringify(fingerprint(input, await stat(input))) !== JSON.stringify(sourceFingerprint)) {
      throw new Error('La descarga original cambió durante la preparación del vídeo.');
    }
    const preparedStat = await stat(partial);
    if (!preparedStat.size) throw new Error('La preparación AV1 produjo un archivo vacío.');
    const manifest = { input: sourceFingerprint, profile, mode, output: {
      bytes: preparedStat.size, sha256: await sha256(partial), probe: preparedProbe,
    }, preparedAt: new Date().toISOString() };
    await writeFile(manifestTemp, JSON.stringify(manifest), { mode: 0o600 });
    await rename(partial, output);
    await rename(manifestTemp, manifestPath);
    return { codec: 'av1', bytes: preparedStat.size, reused: false, mode, manifestPath };
  } catch (error) {
    await rm(partial, { force: true });
    await rm(manifestTemp, { force: true });
    throw error;
  }
}
