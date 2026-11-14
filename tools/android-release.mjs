#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
function validateConfig() {
  if (!/^\d+\.\d+\.\d+$/.test(config.version) || !Number.isSafeInteger(config.android.versionCode) || config.android.versionCode < 1)
    throw Error('Define expo.version y android.versionCode válidos en app.json.');
}
function writePreservingEol(file, mutate) {
  const original = fs.readFileSync(file, 'utf8'), crlf = original.includes('\r\n');
  const next = mutate(original.replaceAll('\r\n', '\n'));
  fs.writeFileSync(file, crlf ? next.replaceAll('\n', '\r\n') : next);
}
function prepare() {
  validateConfig();
  writePreservingEol(path.join(root, 'android/app/build.gradle'), source => {
    if ((source.match(/\bversionCode\s+\d+/g) || []).length !== 1 || (source.match(/\bversionName\s+"[^"]+"/g) || []).length !== 1) throw Error('No se pudo identificar una versión única en Gradle.');
    return source.replace(/\bversionCode\s+\d+/, `versionCode ${config.android.versionCode}`).replace(/\bversionName\s+"[^"]+"/, `versionName "${config.version}"`);
  });
  writePreservingEol(path.join(root, 'android/app/src/main/res/values/strings.xml'), source => {
    if (!source.includes('name="expo_runtime_version"')) throw Error('Falta el recurso runtimeVersion.');
    return source.replace(/(<string name="expo_runtime_version">)[^<]+/, `$1${config.version}`);
  });
  console.log(`Android preparado: ${config.version} (${config.android.versionCode}).`);
}
function packageRelease() {
  validateConfig();
  const apk = path.resolve(process.argv[3] || path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'));
  const destination = path.resolve(process.argv[4] || path.join(root, 'server/releases/android'));
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Android/Sdk');
  const versions = fs.readdirSync(path.join(sdk, 'build-tools')).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  const tools = versions.map(version => path.join(sdk, 'build-tools', version)).find(dir => fs.existsSync(path.join(dir, 'aapt')) && fs.existsSync(path.join(dir, 'apksigner')));
  if (!tools) throw Error('No se encuentran aapt/apksigner en Android SDK.');
  const badging = execFileSync(path.join(tools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' });
  const info = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  if (!info || info[1] !== config.android.package || Number(info[2]) !== config.android.versionCode || info[3] !== config.version) throw Error('La APK no corresponde a la versión de app.json. Prepara y compila otra vez.');
  const signature = execFileSync(path.join(tools, 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8' });
  const certificate = signature.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1]?.toLowerCase();
  if (!certificate) throw Error('APK sin firma válida.');
  const pinFile = path.join(root, 'config/android-release-certificate.sha256');
  if (!fs.existsSync(pinFile) || fs.readFileSync(pinFile, 'utf8').trim() !== certificate) throw Error('La clave de firma no coincide con las APK instaladas. No publiques esta APK.');
  const bytes = fs.readFileSync(apk), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest = { version: config.version, versionCode: config.android.versionCode, filename: `pixel-${config.version}-${config.android.versionCode}.apk`, size: bytes.length, sha256,
    notes: process.env.PIXEL_RELEASE_NOTES || 'Mejoras de perfil, navegación y administración.' };
  const previousFile = path.join(destination, 'latest.json');
  if (fs.existsSync(previousFile)) {
    const previous = JSON.parse(fs.readFileSync(previousFile, 'utf8'));
    if (previous.versionCode > manifest.versionCode || (previous.versionCode === manifest.versionCode && previous.sha256 !== sha256)) throw Error('Incrementa android.versionCode antes de publicar una APK distinta.');
  }
  fs.mkdirSync(destination, { recursive: true });
  if (path.resolve(apk) !== path.join(destination, manifest.filename)) fs.copyFileSync(apk, path.join(destination, manifest.filename));
  fs.writeFileSync(previousFile + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(previousFile + '.tmp', previousFile);
  console.log(`Paquete verificado en ${destination}: ${manifest.filename}`);
}
try {
  if (process.argv[2] === 'prepare') prepare();
  else if (process.argv[2] === 'package') packageRelease();
  else throw Error('Uso: node tools/android-release.mjs prepare | package [apk] [carpeta de salida]');
} catch (error) { console.error(error.message); process.exitCode = 1; }
