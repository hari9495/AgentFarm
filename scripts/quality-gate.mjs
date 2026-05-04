import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const reportDir = resolve(repoRoot, 'operations', 'quality');
const reportPath = resolve(reportDir, '8.1-quality-gate-report.md');

const checks = [
    {
        id: 'api-gateway-coverage',
        title: 'API Gateway coverage gate',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'test:coverage'],
    },
    {
        id: 'agent-runtime-coverage',
        title: 'Agent Runtime coverage gate',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/agent-runtime', 'test:coverage'],
    },
    {
        id: 'api-gateway-typecheck',
        title: 'API Gateway typecheck',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'typecheck'],
    },
    {
        id: 'agent-runtime-typecheck',
        title: 'Agent Runtime typecheck',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/agent-runtime', 'typecheck'],
    },
    {
        id: 'dashboard-typecheck',
        title: 'Dashboard typecheck',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/dashboard', 'typecheck'],
    },
    {
        id: 'provisioning-service-typecheck',
        title: 'Provisioning service typecheck',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/provisioning-service', 'typecheck'],
    },
    {
        id: 'provisioning-service-regression',
        title: 'Provisioning service state-machine regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/provisioning-service', 'test'],
    },
    {
        id: 'website-signup-regression',
        title: 'Website signup flow regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:signup'],
    },
    {
        id: 'website-provisioning-worker-regression',
        title: 'Website provisioning worker regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:provisioning'],
    },
    {
        id: 'website-session-auth-regression',
        title: 'Website session auth and workspace RLS regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:session-auth'],
    },
    {
        id: 'website-provisioning-progress-ui-regression',
        title: 'Website provisioning progress UI regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:provisioning-ui'],
    },
    {
        id: 'website-deployment-regression',
        title: 'Website deployment flow regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:deployments'],
    },
    {
        id: 'website-deployment-ui-regression',
        title: 'Website deployment UI regression',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:deployments:ui'],
    },
    {
        id: 'website-approvals-regression',
        title: 'Website approval queue and decision workflow regression (Task 5.2/5.3)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:approvals'],
    },
    {
        id: 'website-evidence-compliance-regression',
        title: 'Website evidence compliance summary and export regression (Task 6.1/6.2)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/website', 'test:evidence'],
    },
    {
        id: 'website-e2e-smoke',
        title: 'Website E2E smoke lane',
        command: 'pnpm',
        args: ['smoke:e2e'],
    },
    {
        id: 'contract-validation',
        title: 'Contract versioning and compatibility (Epic A4 + Phase 1 WORK_MEMORY/REPRO_PACK)',
        command: 'node',
        args: ['scripts/a4-contract-validation.mjs'],
    },
    {
        id: 'import-boundary-check',
        title: 'Import boundary enforcement (Epic A4)',
        command: 'node',
        args: ['scripts/a4-import-boundary-check.mjs'],
    },
    {
        id: 'orchestrator-typecheck',
        title: 'Orchestrator typecheck (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/orchestrator', 'typecheck'],
    },
    {
        id: 'orchestrator-test',
        title: 'Orchestrator wake model and scheduler tests (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/orchestrator', 'test'],
    },
    {
        id: 'api-gateway-task-lease-concurrency',
        title: 'API Gateway task lease race-condition tests (Epic A1)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/runtime-tasks.lease-concurrency.test.ts'],
    },
    {
        id: 'connector-gateway-typecheck',
        title: 'Connector Gateway typecheck (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/connector-gateway', 'typecheck'],
    },
    {
        id: 'connector-gateway-test',
        title: 'Connector Gateway adapter registry tests (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/connector-gateway', 'test'],
    },
    {
        id: 'approval-service-typecheck',
        title: 'Approval Service typecheck (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/approval-service', 'typecheck'],
    },
    {
        id: 'approval-service-test',
        title: 'Approval Service enforcement and kill-switch tests (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/approval-service', 'test'],
    },
    {
        id: 'evidence-service-typecheck',
        title: 'Evidence Service typecheck (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/evidence-service', 'typecheck'],
    },
    {
        id: 'evidence-service-test',
        title: 'Evidence Service governance KPI tests (Sprint B)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/evidence-service', 'test'],
    },
    {
        id: 'shared-types-typecheck',
        title: 'Shared Types typecheck (Sprint B contracts)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/shared-types', 'typecheck'],
    },
    {
        id: 'connector-contracts-typecheck',
        title: 'Connector Contracts typecheck (Phase 3 C2)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/connector-contracts', 'typecheck'],
    },
    {
        id: 'observability-typecheck',
        title: 'Observability package typecheck (Phase 3 C2)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/observability', 'typecheck'],
    },
    {
        id: 'policy-engine-typecheck',
        title: 'Policy Engine typecheck (Phase 3 C1)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/policy-engine', 'typecheck'],
    },
    {
        id: 'policy-engine-test',
        title: 'Policy Engine governance routing tests (Phase 3 C1)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/policy-engine', 'test'],
    },
    // -----------------------------------------------------------------------
    // Phase 1 VM Realism route test lanes (Sprint 3 + Sprint 4)
    // -----------------------------------------------------------------------
    {
        id: 'phase1-activity-events-test',
        title: 'Phase 1 — F5 Activity Events route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/activity-events.test.ts'],
    },
    {
        id: 'phase1-env-reconciler-test',
        title: 'Phase 1 — F8 Environment Reconciler route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/env-reconciler.test.ts'],
    },
    {
        id: 'phase1-desktop-actions-test',
        title: 'Phase 1 — F3 Desktop Actions route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/desktop-actions.test.ts'],
    },
    {
        id: 'phase1-pull-requests-test',
        title: 'Phase 1 — F6 PR Auto Driver route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/pull-requests.test.ts'],
    },
    {
        id: 'phase1-ci-failures-test',
        title: 'Phase 1 — F7 CI Failure Triage Loop route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/ci-failures.test.ts'],
    },
    {
        id: 'phase1-work-memory-test',
        title: 'Phase 1 — F10 Work Memory + Next-Action Planner route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/work-memory.test.ts'],
    },
    {
        id: 'phase1-sprint3-integration',
        title: 'Phase 1 — Sprint 3 exit-gate integration test',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/sprint3-integration.test.ts'],
    },
    {
        id: 'phase1-repro-packs-test',
        title: 'Phase 1 — F9 Crash Recovery + Repro Pack Generator route tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/repro-packs.test.ts'],
    },
    {
        id: 'phase1-run-recovery-worker-test',
        title: 'Phase 1 — F9 Run Recovery Worker service tests (95% KPI)',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/services/run-recovery-worker.test.ts'],
    },
    {
        id: 'phase1-sprint4-integration',
        title: 'Phase 1 — Sprint 4 exit-gate integration test',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/api-gateway', 'exec', 'tsx', '--test', 'src/routes/sprint4-integration.test.ts'],
    },
    {
        id: 'phase1-orchestrator-recovery-test',
        title: 'Phase 1 — Orchestrator resume/recovery tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/orchestrator', 'exec', 'tsx', '--test', 'src/orchestrator-state-store.test.ts'],
    },
    {
        id: 'phase1-agent-runtime-desktop-actions-test',
        title: 'Phase 1 — Agent Runtime desktop-action governance tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/agent-runtime', 'exec', 'tsx', '--test', 'src/desktop-action-governance.test.ts'],
    },
    {
        id: 'phase1-dashboard-activity-stream-test',
        title: 'Phase 1 — Dashboard activity-stream component tests',
        command: 'pnpm',
        args: ['--filter', '@agentfarm/dashboard', 'test', '--', 'app/components/operational-signal-timeline.test.tsx'],
    },
    {
        id: 'db-runtime-smoke',
        title: 'DB Runtime snapshot smoke lane',
        command: 'pnpm',
        args: ['test:db-lane'],
        // optional: skips gracefully when Postgres is not reachable (e.g. local dev without Docker)
        optional: true,
    },
];

const shellQuote = (value) => {
    if (/^[a-zA-Z0-9_./:@-]+$/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '\\"')}"`;
};

const runCommand = (command, args) => new Promise((resolveRun) => {
    const commandLine = [command, ...args].map(shellQuote).join(' ');

    const child = spawn(commandLine, [], {
        cwd: repoRoot,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stderr.write(text);
    });

    child.on('close', (code) => {
        resolveRun({
            code: code ?? 1,
            output,
        });
    });
});

const startedAt = new Date();
const results = [];

for (const check of checks) {
    process.stdout.write(`\n=== ${check.title} ===\n`);
    const result = await runCommand(check.command, check.args);

    const isDbUnavailable =
        check.optional &&
        result.code !== 0 &&
        (result.output.includes('ECONNREFUSED') ||
            result.output.includes('connect ETIMEDOUT') ||
            result.output.includes('Can\'t reach database server') ||
            result.output.includes('Environment variable not found: DATABASE_URL') ||
            result.output.includes('P1012') ||
            result.output.includes('P1001'));

    if (isDbUnavailable) {
        process.stdout.write(`\n[WARN] ${check.title} skipped — database configuration not available in this environment.\n`);
        results.push({ ...check, ...result, passed: true, skipped: true });
        continue;
    }

    results.push({
        ...check,
        ...result,
        passed: result.code === 0,
    });

    if (result.code !== 0 && !check.optional) {
        break;
    }
}

const endedAt = new Date();
const allPassed = results.length === checks.length && results.every((item) => item.passed);

await mkdir(reportDir, { recursive: true });
const lines = [
    '# Task 8.1 Quality Gate Report',
    '',
    `- Started: ${startedAt.toISOString()}`,
    `- Ended: ${endedAt.toISOString()}`,
    `- Overall: ${allPassed ? 'PASS' : 'FAIL'}`,
    '',
    '## Check Results',
    '',
    '| Check | Result | Exit Code |',
    '| --- | --- | --- |',
    ...results.map((item) => `| ${item.title} | ${item.skipped ? 'SKIP (no DB)' : item.passed ? 'PASS' : 'FAIL'} | ${item.code} |`),
    '',
    '## Coverage Note',
    '',
    '- Coverage thresholds are explicitly enforced at >=80% line coverage on designated critical backend modules, with scope expansion tracked as follow-up uplift.',
    '- Website deployment regressions include backend flow and UI state checks for deployment history lanes.',
    '- E2E smoke lane validates dashboard build/start and website authentication flow (signup, session cookie, protected route access).',
    '',
    '## Raw Logs (Tail)',
    '',
];

for (const item of results) {
    const tail = item.output.split('\n').slice(-20).join('\n');
    lines.push(`### ${item.title}`);
    lines.push('```text');
    lines.push(tail);
    lines.push('```');
    lines.push('');
}

await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');

if (!allPassed) {
    process.exitCode = 1;
}
