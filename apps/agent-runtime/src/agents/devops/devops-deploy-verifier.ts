// ============================================================================
// DEVOPS DEPLOY VERIFIER
//
// Post-deployment health verification: polls K8s readiness, runs HTTP health
// checks, and triggers auto-rollback if the deployment is unhealthy.
//
// A human DevOps engineer always answers "did it actually work?" after every
// deploy. This module closes that gap.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthCheckConfig {
    endpoint:             string;   // full URL e.g. https://api.prod.example.com/health
    expectedStatusCode?:  number;   // default: 200
    expectedBodyContains?: string;  // optional substring check
    timeoutMs?:           number;   // default: 10_000
}

export interface HealthCheckResult {
    endpoint:      string;
    statusCode:    number;
    latencyMs:     number;
    healthy:       boolean;
    errorMessage?: string;
}

export interface K8sReadinessResult {
    ready:             boolean;
    readyAfterSeconds: number;
    desiredReplicas:   number;
    readyReplicas:     number;
    timedOut:          boolean;
    rawStatus:         string;
}

export interface DeployVerificationResult {
    healthy:              boolean;
    healthChecks:         HealthCheckResult[];
    k8sReadiness:         K8sReadinessResult | null;
    rolledBack:           boolean;
    rollbackReason?:      string;
    rollbackOutput?:      string;
    durationSeconds:      number;
    report:               string;
}

type RunCommandFn = (
    args:       string[],
    cwd:        string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

// ---------------------------------------------------------------------------
// K8s readiness poller
// ---------------------------------------------------------------------------

/**
 * Poll `kubectl rollout status` until the deployment is ready or we time out.
 * Returns after first success or after maxWaitSeconds.
 */
export async function pollK8sReadiness(params: {
    deployment:      string;
    namespace:       string;
    workspaceDir:    string;
    runCommand:      RunCommandFn;
    maxWaitSeconds?: number;   // default: 180
    intervalSeconds?: number;  // default: 10
}): Promise<K8sReadinessResult> {
    const { deployment, namespace, workspaceDir, runCommand } = params;
    const maxWait  = params.maxWaitSeconds  ?? 180;
    const interval = params.intervalSeconds ?? 10;
    const started  = Date.now();

    let desiredReplicas = 0;
    let readyReplicas   = 0;
    let rawStatus       = '';

    while (true) {
        const elapsedSeconds = (Date.now() - started) / 1000;

        // kubectl rollout status times out after --timeout
        const result = await runCommand(
            ['kubectl', 'rollout', 'status', `deployment/${deployment}`, '-n', namespace, '--timeout=5s'],
            workspaceDir,
            8_000,
        );

        rawStatus = result.stdout.trim() || result.stderr.trim();

        if (result.exitCode === 0 && rawStatus.includes('successfully rolled out')) {
            // Also fetch replica counts for the report
            const getResult = await runCommand(
                ['kubectl', 'get', 'deployment', deployment, '-n', namespace,
                    '-o', 'jsonpath={.spec.replicas},{.status.readyReplicas}'],
                workspaceDir, 5_000,
            );
            const parts = getResult.stdout.split(',');
            desiredReplicas = parseInt(parts[0] ?? '0', 10) || 0;
            readyReplicas   = parseInt(parts[1] ?? '0', 10) || 0;

            return {
                ready:             true,
                readyAfterSeconds: elapsedSeconds,
                desiredReplicas,
                readyReplicas,
                timedOut:          false,
                rawStatus,
            };
        }

        if (elapsedSeconds >= maxWait) {
            return {
                ready:             false,
                readyAfterSeconds: elapsedSeconds,
                desiredReplicas,
                readyReplicas,
                timedOut:          true,
                rawStatus:         rawStatus || `Timed out after ${maxWait}s`,
            };
        }

        // Wait for the interval
        await new Promise<void>((resolve) => setTimeout(resolve, interval * 1000));
    }
}

// ---------------------------------------------------------------------------
// HTTP health checks
// ---------------------------------------------------------------------------

export async function runHttpHealthChecks(
    configs:     HealthCheckConfig[],
    fetchImpl:   typeof fetch,
): Promise<HealthCheckResult[]> {
    return Promise.all(configs.map(async (cfg) => {
        const start   = Date.now();
        const timeout = cfg.timeoutMs ?? 10_000;
        try {
            const response = await fetchImpl(cfg.endpoint, {
                signal: AbortSignal.timeout(timeout),
            });
            const latencyMs  = Date.now() - start;
            const statusCode = response.status;
            const expected   = cfg.expectedStatusCode ?? 200;

            let healthy = statusCode === expected;
            let errorMessage: string | undefined;

            if (healthy && cfg.expectedBodyContains) {
                const body = await response.text().catch(() => '');
                if (!body.includes(cfg.expectedBodyContains)) {
                    healthy      = false;
                    errorMessage = `Body does not contain "${cfg.expectedBodyContains}"`;
                }
            }

            return { endpoint: cfg.endpoint, statusCode, latencyMs, healthy, errorMessage };
        } catch (err) {
            return {
                endpoint:     cfg.endpoint,
                statusCode:   0,
                latencyMs:    Date.now() - start,
                healthy:      false,
                errorMessage: String(err),
            };
        }
    }));
}

// ---------------------------------------------------------------------------
// Auto-rollback trigger
// ---------------------------------------------------------------------------

export async function triggerRollback(params: {
    deployment:    string;
    namespace:     string;
    workspaceDir:  string;
    runCommand:    RunCommandFn;
    reason:        string;
}): Promise<{ ok: boolean; output: string }> {
    const { deployment, namespace, workspaceDir, runCommand } = params;
    const result = await runCommand(
        ['kubectl', 'rollout', 'undo', `deployment/${deployment}`, '-n', namespace],
        workspaceDir,
        60_000,
    );
    return {
        ok:     result.exitCode === 0,
        output: result.stdout || result.stderr,
    };
}

// ---------------------------------------------------------------------------
// Helm-based rollback
// ---------------------------------------------------------------------------

export async function triggerHelmRollback(params: {
    releaseName:  string;
    namespace:    string;
    workspaceDir: string;
    runCommand:   RunCommandFn;
    reason:       string;
}): Promise<{ ok: boolean; output: string }> {
    const { releaseName, namespace, workspaceDir, runCommand } = params;
    const result = await runCommand(
        ['helm', 'rollback', releaseName, '--namespace', namespace, '--wait'],
        workspaceDir,
        120_000,
    );
    return {
        ok:     result.exitCode === 0,
        output: result.stdout || result.stderr,
    };
}

// ---------------------------------------------------------------------------
// Verification report formatter
// ---------------------------------------------------------------------------

export function formatVerificationReport(result: DeployVerificationResult): string {
    const status = result.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY';
    const lines: string[] = [
        `## Post-Deploy Verification — ${status}`,
        ``,
        `**Duration:** ${result.durationSeconds}s`,
        result.rolledBack ? `**⚠️ Auto-rollback triggered:** ${result.rollbackReason ?? ''}` : '',
        ``,
    ];

    if (result.k8sReadiness) {
        const r = result.k8sReadiness;
        lines.push(
            `### K8s Readiness`,
            r.ready
                ? `✅ Ready after ${Math.round(r.readyAfterSeconds)}s (${r.readyReplicas}/${r.desiredReplicas} replicas)`
                : `❌ ${r.timedOut ? 'Timed out' : 'Not ready'} — ${r.rawStatus.slice(0, 120)}`,
            ``,
        );
    }

    if (result.healthChecks.length > 0) {
        lines.push(`### HTTP Health Checks`);
        lines.push(`| Endpoint | Status | Latency | Result |`);
        lines.push(`|----------|--------|---------|--------|`);
        for (const hc of result.healthChecks) {
            const icon = hc.healthy ? '✅' : '❌';
            lines.push(`| ${hc.endpoint} | ${hc.statusCode || 'ERR'} | ${hc.latencyMs}ms | ${icon} ${hc.errorMessage ?? 'OK'} |`);
        }
        lines.push('');
    }

    return lines.filter((l) => l !== undefined).join('\n');
}
