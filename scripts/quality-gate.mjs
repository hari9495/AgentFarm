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
        id: 'website-e2e-smoke',
        title: 'Website E2E smoke lane',
        command: 'pnpm',
        args: ['smoke:e2e'],
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
