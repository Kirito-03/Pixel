import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDriveStages, runDriveStages, tryAcquireDriveJob, getRunningDriveJob, spawnDriveScript } from './drive-job-runner.mjs';

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const command = (script, lane = 'video') => ({ script, lane });

test('verification gates uploads; manga overlaps video, video stages never overlap', async () => {
    const events = [];
    const gates = new Map(['verify', 'anime', 'h', 'manga'].map((name) => [name, deferred()]));
    const commands = [command('verify', 'preflight'), command('anime'), command('h'), command('manga', 'manga')];
    const stages = createDriveStages(commands);
    const pending = runDriveStages(commands, { stages, run: async ({ script }) => {
        events.push(`start:${script}`);
        await gates.get(script).promise;
        events.push(`end:${script}`);
    } });
    assert.deepEqual(events, ['start:verify']);
    gates.get('verify').resolve();
    await tick();
    assert.deepEqual(events, ['start:verify', 'end:verify', 'start:anime', 'start:manga']);
    assert.equal(stages[2].status, 'queued');
    gates.get('anime').resolve();
    await tick();
    assert.equal(events.at(-1), 'start:h');
    gates.get('h').resolve();
    await tick();
    assert.equal(stages[3].status, 'running');
    gates.get('manga').resolve();
    await pending;
    assert.ok(stages.every((stage) => stage.status === 'done' && stage.startedAt && stage.finishedAt));
});

test('a failed anime still allows H and waits for manga before reporting failure', async () => {
    const manga = deferred();
    const events = [];
    let settled = false;
    const stages = createDriveStages([command('anime'), command('h'), command('manga', 'manga')]);
    const pending = runDriveStages([command('anime'), command('h'), command('manga', 'manga')], {
        stages,
        run: async ({ script }) => {
            events.push(script);
            if (script === 'anime') throw new Error('Fuente no disponible');
            if (script === 'manga') await manga.promise;
        },
    }).then(() => { settled = true; }, (error) => { settled = true; return error; });
    await tick();
    assert.deepEqual(events, ['anime', 'manga', 'h']);
    assert.equal(settled, false);
    manga.resolve();
    const error = await pending;
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /Fuente no disponible/);
    assert.deepEqual(stages.map((stage) => stage.status), ['error', 'done', 'done']);
});

test('a failed preflight skips all upload stages', async () => {
    const commands = [command('verify', 'preflight'), command('anime'), command('manga', 'manga')];
    const stages = createDriveStages(commands);
    const events = [];
    await assert.rejects(runDriveStages(commands, { stages, run: async ({ script }) => {
        events.push(script);
        throw new Error('Drive no accesible');
    } }), /Drive no accesible/);
    assert.deepEqual(events, ['verify']);
    assert.deepEqual(stages.map((stage) => stage.status), ['error', 'skipped', 'skipped']);
});

test('aborting a job does not launch the next video stage', async () => {
    const controller = new AbortController();
    const commands = [command('anime'), command('h')];
    const stages = createDriveStages(commands);
    const events = [];
    await assert.rejects(runDriveStages(commands, { stages, signal: controller.signal, run: async ({ script }) => {
        events.push(script);
        controller.abort();
    } }), /interrumpido/);
    assert.deepEqual(events, ['anime']);
    assert.equal(stages[1].status, 'skipped');
});

test('admin and cron share one lease and releasing an old lease cannot release a new job', () => {
    const admin = tryAcquireDriveJob('Manual');
    assert.ok(admin);
    assert.deepEqual(getRunningDriveJob(), { label: 'Manual' });
    assert.equal(tryAcquireDriveJob('Cron'), null);
    admin.release();
    const cron = tryAcquireDriveJob('Cron');
    admin.release();
    assert.deepEqual(getRunningDriveJob(), { label: 'Cron' });
    cron.release();
    assert.equal(getRunningDriveJob(), null);
});

test('only the two bounded upload lanes are accepted', () => {
    assert.throws(() => createDriveStages([command('unknown', 'unbounded')]), /no permitida/);
});

test('CLI stdout is drained and signed URLs are removed from returned errors', { timeout: 4000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixel-drive-runner-'));
    try {
        await writeFile(join(root, 'test.mjs'), `await new Promise(resolve => process.stdout.write('x'.repeat(1024 * 1024), resolve));\nprocess.stderr.write('failed https://provider.invalid/video.mp4?secret=abc');\nprocess.exitCode = 1;\n`);
        await assert.rejects(spawnDriveScript(root, { script: 'test.mjs' }), (error) => {
            assert.match(error.message, /failed \[enlace\]/);
            assert.doesNotMatch(error.message, /secret|provider/);
            return true;
        });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
