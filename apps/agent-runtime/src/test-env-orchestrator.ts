/**
 * Test-environment orchestration for the tester agent (Cluster 2).
 *
 * Drives Docker Compose in the task workspace so the tester can bring up the
 * application under test, watch its health, read service logs, and tear the
 * environment down again. All functions take an injected command runner and
 * file-existence check, so the orchestration is fully unit-testable.
 *
 * Hard-fail contract (same as the FSD diagnostics): when Docker cannot run
 * or the compose file is missing, these fail loudly — never a fabricated
 * "environment ready".
 */

export type RunFn = (
    args: string[],
    cwd: string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export type FileExistsFn = (path: string) => boolean;

export type TestEnvService = { name: string; state: string; health: string };

export type TestEnvResult = {
    ok: boolean;
    summary: string;
    services?: TestEnvService[];
    error?: string;
};

const COMPOSE_FILE_CANDIDATES = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
];

const joinPath = (dir: string, file: string): string =>
    `${dir.replace(/[\\/]+$/, '')}/${file}`;

/** Resolve the compose file to use — explicit override first, then convention. */
export function detectComposeFile(
    workspaceDir: string,
    fileExists: FileExistsFn,
    override?: string,
): string | null {
    if (override && override.trim()) {
        const candidate = override.trim();
        return fileExists(joinPath(workspaceDir, candidate)) ? candidate : candidate;
    }
    for (const candidate of COMPOSE_FILE_CANDIDATES) {
        if (fileExists(joinPath(workspaceDir, candidate))) return candidate;
    }
    return null;
}

type BaseParams = {
    workspaceDir: string;
    run: RunFn;
    fileExists: FileExistsFn;
    composeFile?: string;
    timeoutMs?: number;
};

const resolveComposeOrFail = (params: BaseParams): { composeFile: string } | { error: TestEnvResult } => {
    const composeFile = detectComposeFile(params.workspaceDir, params.fileExists, params.composeFile);
    if (!composeFile) {
        return {
            error: {
                ok: false,
                summary: '',
                error:
                    'No compose file found in the workspace (looked for ' +
                    `${COMPOSE_FILE_CANDIDATES.join(', ')}). Provide compose_file explicitly if it lives elsewhere.`,
            },
        };
    }
    return { composeFile };
};

const composeCmd = (composeFile: string, ...rest: string[]): string[] => [
    'docker', 'compose', '-f', composeFile, ...rest,
];

const dockerUnavailable = (verb: string, err: unknown): TestEnvResult => ({
    ok: false,
    summary: '',
    error: `docker compose ${verb} could not run: ${err instanceof Error ? err.message : String(err)}. Ensure Docker is installed and the daemon is running.`,
});

const parsePsOutput = (stdout: string): TestEnvService[] =>
    stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('{'))
        .flatMap((line) => {
            try {
                const parsed = JSON.parse(line) as { Service?: string; Name?: string; State?: string; Health?: string };
                return [{
                    name: parsed.Service ?? parsed.Name ?? '(unknown)',
                    state: parsed.State ?? 'unknown',
                    health: parsed.Health ?? '',
                }];
            } catch {
                return [];
            }
        });

const describeServices = (services: TestEnvService[]): string =>
    services.map((s) => `${s.name}: ${s.state}${s.health ? ` (${s.health})` : ''}`).join('; ') || '(no services)';

/**
 * Bring the environment up detached and wait for container healthchecks
 * (`up -d --wait` — exits non-zero if any service fails to become healthy).
 */
export async function testEnvUp(
    params: BaseParams & { services?: string[] },
): Promise<TestEnvResult> {
    const resolved = resolveComposeOrFail(params);
    if ('error' in resolved) return resolved.error;
    const { composeFile } = resolved;
    const timeoutMs = params.timeoutMs ?? 180_000;

    let upResult: { stdout: string; stderr: string; exitCode: number };
    try {
        upResult = await params.run(
            composeCmd(composeFile, 'up', '-d', '--wait', ...(params.services ?? [])),
            params.workspaceDir,
            timeoutMs,
        );
    } catch (err) {
        return dockerUnavailable('up', err);
    }
    if (upResult.exitCode !== 0) {
        return {
            ok: false,
            summary: '',
            error: `docker compose up exited ${upResult.exitCode}: ${upResult.stderr.trim().slice(0, 500) || '(no stderr)'}`,
        };
    }

    // Best-effort status snapshot for the summary — up already succeeded.
    let services: TestEnvService[] = [];
    try {
        const psResult = await params.run(
            composeCmd(composeFile, 'ps', '--format', 'json'),
            params.workspaceDir,
            30_000,
        );
        if (psResult.exitCode === 0) services = parsePsOutput(psResult.stdout);
    } catch { /* summary only — up outcome stands */ }

    return {
        ok: true,
        summary: `Test environment up (${composeFile}). ${describeServices(services)}`,
        services,
    };
}

/** Report current service states from `compose ps`. */
export async function testEnvStatus(params: BaseParams): Promise<TestEnvResult> {
    const resolved = resolveComposeOrFail(params);
    if ('error' in resolved) return resolved.error;
    const { composeFile } = resolved;

    let psResult: { stdout: string; stderr: string; exitCode: number };
    try {
        psResult = await params.run(
            composeCmd(composeFile, 'ps', '--format', 'json'),
            params.workspaceDir,
            params.timeoutMs ?? 30_000,
        );
    } catch (err) {
        return dockerUnavailable('ps', err);
    }
    if (psResult.exitCode !== 0) {
        return {
            ok: false,
            summary: '',
            error: `docker compose ps exited ${psResult.exitCode}: ${psResult.stderr.trim().slice(0, 500) || '(no stderr)'}`,
        };
    }

    const services = parsePsOutput(psResult.stdout);
    return { ok: true, summary: describeServices(services), services };
}

/** Tail logs — optionally scoped to one service. */
export async function testEnvLogs(
    params: BaseParams & { service?: string; tailLines?: number },
): Promise<TestEnvResult> {
    const resolved = resolveComposeOrFail(params);
    if ('error' in resolved) return resolved.error;
    const { composeFile } = resolved;
    const tail = String(params.tailLines ?? 100);

    let logsResult: { stdout: string; stderr: string; exitCode: number };
    try {
        logsResult = await params.run(
            composeCmd(composeFile, 'logs', '--no-color', '--tail', tail, ...(params.service ? [params.service] : [])),
            params.workspaceDir,
            params.timeoutMs ?? 60_000,
        );
    } catch (err) {
        return dockerUnavailable('logs', err);
    }
    if (logsResult.exitCode !== 0) {
        return {
            ok: false,
            summary: '',
            error: `docker compose logs exited ${logsResult.exitCode}: ${logsResult.stderr.trim().slice(0, 500) || '(no stderr)'}`,
        };
    }

    const combined = `${logsResult.stdout}\n${logsResult.stderr}`.trim();
    return {
        ok: true,
        summary: combined.slice(-8_000) || '(no log output)',
    };
}

/** Tear the environment down, removing volumes and orphans. */
export async function testEnvDown(params: BaseParams): Promise<TestEnvResult> {
    const resolved = resolveComposeOrFail(params);
    if ('error' in resolved) return resolved.error;
    const { composeFile } = resolved;

    let downResult: { stdout: string; stderr: string; exitCode: number };
    try {
        downResult = await params.run(
            composeCmd(composeFile, 'down', '-v', '--remove-orphans'),
            params.workspaceDir,
            params.timeoutMs ?? 120_000,
        );
    } catch (err) {
        return dockerUnavailable('down', err);
    }
    if (downResult.exitCode !== 0) {
        return {
            ok: false,
            summary: '',
            error: `docker compose down exited ${downResult.exitCode}: ${downResult.stderr.trim().slice(0, 500) || '(no stderr)'}`,
        };
    }

    return { ok: true, summary: `Test environment torn down (${composeFile}); volumes and orphans removed.` };
}
