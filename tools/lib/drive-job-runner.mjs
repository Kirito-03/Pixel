import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';

// Shared by admin and cron within the backend process; CLI media locks cover other processes.
let activeDriveLease = null;
const driveChildren = new Set();
let shutdownHooksInstalled = false;

export function getRunningDriveJob() {
    return activeDriveLease ? { label: activeDriveLease.label } : null;
}

export function tryAcquireDriveJob(label) {
    if (activeDriveLease) return null;
    const controller = new AbortController();
    const lease = { label, controller, release: () => {
        if (activeDriveLease === lease) activeDriveLease = null;
    } };
    activeDriveLease = lease;
    return lease;
}

function stopDriveChild(child) {
    if (!child.pid) return;
    try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
    } catch (error) {
        if (error.code !== 'ESRCH') console.warn('[DriveSync] No se pudo detener un proceso de Drive.');
    }
}

function installShutdownHooks() {
    if (shutdownHooksInstalled) return;
    shutdownHooksInstalled = true;
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            activeDriveLease?.controller.abort();
            for (const child of driveChildren) stopDriveChild(child);
            process.exit(signal === 'SIGINT' ? 130 : 143);
        });
    }
}

/** Drain CLI output and terminate its whole group if the backend stops. */
export function spawnDriveScript(projectRoot, command, { signal } = {}) {
    installShutdownHooks();
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('Trabajo interrumpido.'));
        const child = spawn(process.execPath, [join(projectRoot, command.script), ...(command.args || [])], {
            cwd: projectRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
        });
        driveChildren.add(child);
        // Unread stdout can fill its pipe and block ffmpeg/rclone indefinitely.
        child.stdout?.resume();
        let stderrTail = '';
        child.stderr?.on('data', (chunk) => { stderrTail = (stderrTail + chunk.toString()).slice(-800); });
        const abort = () => stopDriveChild(child);
        signal?.addEventListener('abort', abort, { once: true });
        const cleanup = () => {
            driveChildren.delete(child);
            signal?.removeEventListener('abort', abort);
        };
        child.on('error', (error) => { cleanup(); reject(error); });
        child.on('close', (code, exitSignal) => {
            cleanup();
            if (code === 0) resolve();
            else {
                const safeTail = stderrTail.replace(/https?:\/\/[^\s"'<>]+/gi, '[enlace]').slice(-800);
                reject(new Error(safeTail || `${basename(command.script)} terminó (${exitSignal || code})`));
            }
        });
    });
}


/** One I/O lane for manga, one sequential lane for all video work. */
export function createDriveStages(commands) {
    if (commands.some((command) => command.lane && !['preflight', 'video', 'manga'].includes(command.lane))) {
        throw new Error('Cola de Drive no permitida.');
    }
    return commands.map((command, index) => ({
        id: `stage-${index + 1}`,
        label: command.label || basename(command.script, '.mjs'),
        lane: command.lane || 'video',
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        error: null,
    }));
}

/** Wait for both lanes even when one fails; never overlap video stages. */
export async function runDriveStages(commands, { run, stages = createDriveStages(commands), signal, onStage = () => {} }) {
    const errors = [];
    const publish = (stage) => onStage({ ...stage });
    const skipQueued = () => {
        for (const stage of stages) {
            if (stage.status !== 'queued') continue;
            stage.status = 'skipped';
            stage.finishedAt = new Date().toISOString();
            stage.error = signal?.aborted ? 'Trabajo interrumpido; se puede reanudar.' : 'Verificación previa fallida.';
            publish(stage);
        }
    };
    const execute = async (index) => {
        const stage = stages[index];
        if (signal?.aborted) return false;
        stage.status = 'running';
        stage.startedAt = new Date().toISOString();
        publish(stage);
        try {
            await run(commands[index], { signal });
            stage.status = 'done';
            return true;
        } catch (error) {
            stage.status = 'error';
            stage.error = error?.message || 'Error en sincronización de Drive';
            errors.push(new Error(`${stage.label}: ${stage.error}`));
            return false;
        } finally {
            stage.finishedAt = new Date().toISOString();
            publish(stage);
        }
    };

    // Verification is a gate: no uploads begin while repair is still running.
    for (let index = 0; index < commands.length; index++) {
        if (stages[index].lane !== 'preflight') continue;
        if (!await execute(index)) {
            skipQueued();
            throw new AggregateError(errors, errors.map((error) => error.message).join('; ') || 'Trabajo interrumpido.');
        }
    }

    const lanes = new Map();
    for (let index = 0; index < commands.length; index++) {
        const lane = stages[index].lane;
        if (lane === 'preflight') continue;
        if (!lanes.has(lane)) lanes.set(lane, []);
        lanes.get(lane).push(index);
    }
    // Keep a failed anime source from starving H, while retaining video exclusivity.
    await Promise.allSettled([...lanes.values()].map(async (indices) => {
        for (const index of indices) {
            if (signal?.aborted) break;
            await execute(index);
        }
    }));
    if (signal?.aborted) {
        skipQueued();
        throw new Error('Trabajo interrumpido; los archivos preparados se pueden reanudar.');
    }
    if (errors.length) throw new AggregateError(errors, errors.map((error) => error.message).join('; '));
    return stages;
}
