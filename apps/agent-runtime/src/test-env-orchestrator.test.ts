import test from 'node:test';
import assert from 'node:assert/strict';

import { detectComposeFile, testEnvUp, testEnvStatus, testEnvLogs, testEnvDown } from './test-env-orchestrator.js';

type RunCall = { args: string[]; cwd: string };

const makeRun = (
    script: Array<{ stdout?: string; stderr?: string; exitCode?: number } | 'throw'>,
) => {
    const calls: RunCall[] = [];
    let idx = 0;
    const run = async (args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        calls.push({ args, cwd });
        const entry = script[Math.min(idx, script.length - 1)]!;
        idx += 1;
        if (entry === 'throw') throw new Error('spawn ENOENT: docker not found');
        return { stdout: entry.stdout ?? '', stderr: entry.stderr ?? '', exitCode: entry.exitCode ?? 0 };
    };
    return { run, calls };
};

const existsFor = (...files: string[]) => (path: string) => files.some((f) => path.endsWith(`/${f}`));

// ---------------------------------------------------------------------------
// detectComposeFile
// ---------------------------------------------------------------------------

test('detectComposeFile finds docker-compose.yml and prefers explicit override', () => {
    assert.equal(
        detectComposeFile('/ws', existsFor('docker-compose.yml')),
        'docker-compose.yml',
    );
    assert.equal(
        detectComposeFile('/ws', existsFor('compose.yaml')),
        'compose.yaml',
    );
    assert.equal(
        detectComposeFile('/ws', existsFor('docker-compose.yml'), 'infra/compose.test.yml'),
        'infra/compose.test.yml',
    );
    assert.equal(detectComposeFile('/ws', () => false), null);
});

// ---------------------------------------------------------------------------
// testEnvUp
// ---------------------------------------------------------------------------

test('testEnvUp runs compose up --wait and reports running services', async () => {
    const psJson = [
        JSON.stringify({ Service: 'api', State: 'running', Health: 'healthy' }),
        JSON.stringify({ Service: 'db', State: 'running', Health: 'healthy' }),
    ].join('\n');
    const { run, calls } = makeRun([
        { exitCode: 0 }, // up --wait
        { stdout: psJson, exitCode: 0 }, // ps
    ]);

    const result = await testEnvUp({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml') });

    assert.equal(result.ok, true);
    assert.ok(result.summary.includes('api'));
    assert.ok(result.summary.includes('healthy'));
    assert.deepEqual(calls[0]!.args.slice(0, 4), ['docker', 'compose', '-f', 'docker-compose.yml']);
    assert.ok(calls[0]!.args.includes('up'));
    assert.ok(calls[0]!.args.includes('--wait'));
    assert.ok(calls[0]!.args.includes('-d'));
});

test('testEnvUp fails hard when no compose file exists', async () => {
    const { run } = makeRun([{ exitCode: 0 }]);
    const result = await testEnvUp({ workspaceDir: '/ws', run, fileExists: () => false });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /compose file/i);
});

test('testEnvUp fails hard when docker is unavailable', async () => {
    const { run } = makeRun(['throw']);
    const result = await testEnvUp({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml') });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /docker/i);
});

test('testEnvUp fails with stderr detail when compose up exits non-zero', async () => {
    const { run } = makeRun([{ exitCode: 1, stderr: 'service "api" failed to become healthy' }]);
    const result = await testEnvUp({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml') });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /failed to become healthy/);
});

test('testEnvUp limits scope to requested services', async () => {
    const { run, calls } = makeRun([{ exitCode: 0 }, { stdout: '', exitCode: 0 }]);
    await testEnvUp({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml'), services: ['api', 'db'] });
    assert.ok(calls[0]!.args.includes('api'));
    assert.ok(calls[0]!.args.includes('db'));
});

// ---------------------------------------------------------------------------
// testEnvStatus / testEnvLogs / testEnvDown
// ---------------------------------------------------------------------------

test('testEnvStatus parses compose ps json lines into service states', async () => {
    const psJson = [
        JSON.stringify({ Service: 'api', State: 'running', Health: 'healthy' }),
        JSON.stringify({ Service: 'worker', State: 'exited', Health: '' }),
    ].join('\n');
    const { run } = makeRun([{ stdout: psJson, exitCode: 0 }]);

    const result = await testEnvStatus({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml') });

    assert.equal(result.ok, true);
    assert.equal(result.services?.length, 2);
    assert.equal(result.services?.[0]?.name, 'api');
    assert.equal(result.services?.[0]?.health, 'healthy');
    assert.equal(result.services?.[1]?.state, 'exited');
});

test('testEnvLogs tails logs for one service', async () => {
    const { run, calls } = makeRun([{ stdout: 'api | listening on :3000', exitCode: 0 }]);
    const result = await testEnvLogs({
        workspaceDir: '/ws',
        run,
        fileExists: existsFor('docker-compose.yml'),
        service: 'api',
        tailLines: 50,
    });
    assert.equal(result.ok, true);
    assert.ok(result.summary.includes('listening on :3000'));
    assert.ok(calls[0]!.args.includes('logs'));
    assert.ok(calls[0]!.args.includes('--tail'));
    assert.ok(calls[0]!.args.includes('50'));
    assert.ok(calls[0]!.args.includes('api'));
});

test('testEnvDown tears the environment down with volumes removed', async () => {
    const { run, calls } = makeRun([{ exitCode: 0 }]);
    const result = await testEnvDown({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml') });
    assert.equal(result.ok, true);
    assert.ok(calls[0]!.args.includes('down'));
    assert.ok(calls[0]!.args.includes('-v'));
    assert.ok(calls[0]!.args.includes('--remove-orphans'));
});

test('testEnvDown fails hard when compose down errors', async () => {
    const { run } = makeRun([{ exitCode: 1, stderr: 'permission denied on docker socket' }]);
    const result = await testEnvDown({ workspaceDir: '/ws', run, fileExists: existsFor('docker-compose.yml') });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /permission denied/);
});
