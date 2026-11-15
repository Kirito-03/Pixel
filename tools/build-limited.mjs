#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!['android', 'web', 'check'].includes(target)) {
  console.error('Uso: node tools/build-limited.mjs android | web | check');
  process.exit(1);
}
if (process.platform !== 'linux') {
  console.error('Este flujo usa los límites de recursos de systemd en Linux.');
  process.exit(1);
}
const home = os.homedir();
const jdk = process.env.JAVA_HOME || '';
const sdk = process.env.ANDROID_HOME || path.join(home, 'Android/Sdk');
if (target === 'android' && (!jdk || !fs.existsSync(path.join(jdk, 'bin/java')))) {
  console.error('Define JAVA_HOME con un JDK 21 instalado.');
  process.exit(1);
}
const gradleArgs = [':app:assembleRelease', '--no-daemon', '--no-parallel', '--max-workers=1',
  '-Pkotlin.compiler.execution.strategy=in-process', '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2'];
if (target === 'android' && process.argv[3] === '--run-task') {
  if (!fs.readFileSync('/proc/self/cgroup', 'utf8').includes('/pixel-build-')) {
    console.error('Ejecuta la compilación mediante npm run build:android.');
    process.exit(1);
  }
  const prepared = spawnSync(process.execPath, ['tools/android-release.mjs', 'prepare'], { cwd: root, stdio: 'inherit' });
  if (prepared.status !== 0) process.exit(prepared.status ?? 1);
  const built = spawnSync(path.join(root, 'android/gradlew'), gradleArgs, { cwd: path.join(root, 'android'), stdio: 'inherit' });
  process.exit(built.status ?? 1);
}
const availableKb = Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0);
if (target !== 'check' && availableKb < 5 * 1024 * 1024) {
  console.error('Hay menos de 5 GiB disponibles. Libera memoria antes de compilar.');
  process.exit(1);
}
const projectKey = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
const lock = path.join(os.tmpdir(), `pixel-build-${process.getuid()}-${projectKey}.lock`);
const unit = `pixel-build-${process.pid}.scope`;
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk,
  PATH: jdk ? `${path.join(jdk, 'bin')}${path.delimiter}${process.env.PATH}` : process.env.PATH,
  NODE_OPTIONS: '--max-old-space-size=1024', CMAKE_BUILD_PARALLEL_LEVEL: '1',
  JAVA_TOOL_OPTIONS: '-XX:ActiveProcessorCount=2' };
const properties = ['CPUQuota=200%', 'CPUWeight=10', 'IOWeight=10', 'MemoryHigh=3G', 'MemoryMax=4G', 'MemorySwapMax=512M'];
let command;
if (target === 'android') {
  command = [process.execPath, fileURLToPath(import.meta.url), 'android', '--run-task'];
} else if (target === 'web') {
  command = [process.execPath, path.join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--max-workers', '1', ...process.argv.slice(3)];
} else {
  // Report the effective kernel limits from inside the same scope as a build.
  command = [process.execPath, '-e', `const fs=require('node:fs');const c=fs.readFileSync('/proc/self/cgroup','utf8').trim().split(':').at(-1);const p='/sys/fs/cgroup'+c;for(const f of ['cpu.max','memory.high','memory.max','memory.swap.max'])console.log(f+': '+fs.readFileSync(p+'/'+f,'utf8').trim());`];
}
const args = ['--nonblock', '--conflict-exit-code', '75', lock, 'systemd-run', '--user', '--scope', '--quiet', `--unit=${unit}`,
  ...properties.flatMap(value => ['--property', value]), '--', 'nice', '-n', '15', 'ionice', '-c', '3', ...command];
console.log('Compilación limitada: 2 CPU, 4 GiB máximo, 1 tarea; sin compilaciones simultáneas.');
const child = spawn('flock', args, { cwd: target === 'android' ? path.join(root, 'android') : root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  spawnSync('systemctl', ['--user', 'stop', unit], { stdio: 'ignore' });
  child.kill(signal);
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (code === 75) console.error('Ya hay otra compilación de Pixel activa. Espera a que termine.');
  if (code && code !== 75) console.error('La compilación terminó con error. Se mantienen los límites; revisa el registro.');
  process.exitCode = code ?? (signal ? 1 : 0);
});
