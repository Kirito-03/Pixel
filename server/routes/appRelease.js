import express from 'express';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

export function createAppReleaseRouter(directory = fileURLToPath(new URL('../releases/android/', import.meta.url))) {
  const router = express.Router();
  const root = resolve(directory);
  async function currentRelease() {
    const file = join(root, 'latest.json');
    if ((await stat(file)).size > 16384) throw new Error('Invalid manifest');
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (!Number.isSafeInteger(data.versionCode) || data.versionCode < 1 || !/^\d+\.\d+\.\d+$/.test(data.version) ||
        data.filename !== `pixel-${data.version}-${data.versionCode}.apk` || !/^[a-f0-9]{64}$/.test(data.sha256) ||
        !Number.isSafeInteger(data.size) || data.size <= 0) throw new Error('Invalid manifest');
    const artifact = await stat(join(root, data.filename));
    if (!artifact.isFile() || artifact.size !== data.size) throw new Error('Artifact unavailable');
    return data;
  }
  router.get('/android', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const release = await currentRelease();
      res.json({ version: release.version, versionCode: release.versionCode, sha256: release.sha256, size: release.size,
        notes: typeof release.notes === 'string' ? release.notes.slice(0,1500) : '',
        downloadUrl: `https://pixelnosekai.com/api/app-release/android/download?build=${release.versionCode}` });
    } catch (error) { res.status(error.code === 'ENOENT' ? 404 : 503).json({ message: 'Todavía no hay una versión disponible para descargar.' }); }
  });
  router.get('/android/download', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const release = await currentRelease();
      if (req.query.build && String(req.query.build) !== String(release.versionCode)) return res.status(409).json({ message: 'Hay una versión más reciente. Comprueba las actualizaciones de nuevo.' });
      res.type('application/vnd.android.package-archive');
      res.download(join(root, release.filename), release.filename, error => { if (error && !res.headersSent) res.status(503).end(); });
    } catch { res.status(404).json({ message: 'APK no disponible.' }); }
  });
  return router;
}
export default createAppReleaseRouter();
