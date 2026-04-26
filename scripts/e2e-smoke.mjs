import process from 'node:process';
import { spawn } from 'node:child_process';

const root = process.cwd();
const dashboardPort = Number.parseInt(process.env.SMOKE_DASHBOARD_PORT ?? '3101', 10);
const websitePort = Number.parseInt(process.env.SMOKE_WEBSITE_PORT ?? '3102', 10);
const dashboardBaseUrl = `http://127.0.0.1:${dashboardPort}`;
const websiteBaseUrl = `http://127.0.0.1:${websitePort}`;

const logPhase = (message) => process.stdout.write(`\n[SMOKE] ${message}\n`);
const logPass = (message) => process.stdout.write(`[PASS] ${message}\n`);

const shellQuote = (value) => {
    if (/^[a-zA-Z0-9_./:@-]+$/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '\\"')}"`;
};

const run = (command, args) => new Promise((resolveRun) => {
    const commandLine = [command, ...args].map(shellQuote).join(' ');

    const child = spawn(commandLine, [], {
        cwd: root,
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

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const terminateProcessTree = async (pid) => {
    if (!pid) {
        return;
    }

    if (process.platform === 'win32') {
        await run('taskkill', ['/pid', String(pid), '/t', '/f']);
        return;
    }

    try {
        process.kill(pid, 'SIGTERM');
    } catch {
        // Ignore process teardown errors.
    }
};

const waitForHttp = async (url, timeoutMs = 90_000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url, { method: 'GET' });
            if (response.ok) {
                return true;
            }
        } catch {
            // keep waiting until timeout
        }

        await delay(1000);
    }

    return false;
};

const assertOk = async (url, message) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${message} with status ${response.status}.`);
    }
    return response;
};

const assertRedirectToLogin = async (url) => {
    const response = await fetch(url, { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';
    if (response.status < 300 || response.status >= 400 || !location.includes('/login')) {
        throw new Error(`Expected unauthenticated redirect to /login for ${url}, got ${response.status} (${location || 'no location'}).`);
    }
};

const runDashboardSmoke = async () => {
    logPhase('Dashboard smoke: build + start + route checks');
    const dashboardBuild = await run('pnpm', ['--filter', '@agentfarm/dashboard', 'exec', 'next', 'build', '--no-lint']);
    if (dashboardBuild.code !== 0) {
        throw new Error('Dashboard build failed.');
    }
    logPass('Dashboard build succeeded');

    const dashboardCommand = `pnpm --filter @agentfarm/dashboard exec next start -p ${dashboardPort}`;
    const dashboardProcess = spawn(dashboardCommand, [], {
        cwd: root,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    dashboardProcess.stdout.on('data', (chunk) => process.stdout.write(chunk.toString()));
    dashboardProcess.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));

    try {
        const ready = await waitForHttp(dashboardBaseUrl);
        if (!ready) {
            throw new Error('Dashboard did not become ready within timeout.');
        }
        logPass(`Dashboard server ready on ${dashboardBaseUrl}`);

        const homeResponse = await assertOk(`${dashboardBaseUrl}/`, 'Dashboard home smoke failed');
        const homeHtml = await homeResponse.text();
        if (!homeHtml.toLowerCase().includes('agentfarm')) {
            throw new Error('Dashboard home smoke failed: expected AgentFarm marker missing.');
        }
        logPass('Dashboard home route check passed');

        await assertOk(`${dashboardBaseUrl}/login`, 'Dashboard login page smoke failed');
        logPass('Dashboard login route check passed');
    } finally {
        await terminateProcessTree(dashboardProcess.pid);
        await delay(1000);
    }
};

const runWebsiteAuthSmoke = async () => {
    logPhase('Website auth smoke: build + start + signup/session/protected/logout');
    const websiteBuild = await run('pnpm', ['--filter', '@agentfarm/website', 'exec', 'next', 'build', '--no-lint']);
    if (websiteBuild.code !== 0) {
        throw new Error('Website build failed.');
    }
    logPass('Website build succeeded');

    const websiteCommand = `pnpm --filter @agentfarm/website exec next start -p ${websitePort}`;
    const websiteProcess = spawn(websiteCommand, [], {
        cwd: root,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            AGENTFARM_ALLOWED_SIGNUP_DOMAINS: process.env.AGENTFARM_ALLOWED_SIGNUP_DOMAINS ?? 'example.com',
            AGENTFARM_ADMIN_DOMAINS: process.env.AGENTFARM_ADMIN_DOMAINS ?? 'example.com',
            AGENTFARM_COMPANY_DOMAINS: process.env.AGENTFARM_COMPANY_DOMAINS ?? 'example.com',
        },
    });

    websiteProcess.stdout.on('data', (chunk) => process.stdout.write(chunk.toString()));
    websiteProcess.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));

    try {
        const ready = await waitForHttp(websiteBaseUrl);
        if (!ready) {
            throw new Error('Website did not become ready within timeout.');
        }
        logPass(`Website server ready on ${websiteBaseUrl}`);

        await assertRedirectToLogin(`${websiteBaseUrl}/dashboard`);
        logPass('Unauthenticated protected-route redirect check passed');

        const email = `e2e-${Date.now()}@example.com`;
        const password = `AgentFarm!${Date.now()}`;
        const signupResponse = await fetch(`${websiteBaseUrl}/api/auth/signup`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: 'E2E User',
                company: 'AgentFarm QA',
                email,
                password,
                agreeToTerms: true,
            }),
        });

        if (!signupResponse.ok) {
            const body = await signupResponse.text();
            throw new Error(`Website signup smoke failed with status ${signupResponse.status}: ${body}`);
        }
        logPass('Signup API check passed');

        const sessionCookie = signupResponse.headers.get('set-cookie');
        if (!sessionCookie || !sessionCookie.includes('agentfarm_session=')) {
            throw new Error('Website signup smoke failed: session cookie not set.');
        }
        logPass('Session cookie issuance check passed');

        const cookieHeader = sessionCookie.split(';')[0];
        const dashboardResponse = await fetch(`${websiteBaseUrl}/dashboard`, {
            headers: { cookie: cookieHeader },
        });

        if (!dashboardResponse.ok) {
            throw new Error(`Website authenticated dashboard smoke failed with status ${dashboardResponse.status}.`);
        }

        const dashboardHtml = await dashboardResponse.text();
        if (!dashboardHtml.toLowerCase().includes('customer dashboard')) {
            throw new Error('Website authenticated dashboard smoke failed: expected dashboard marker missing.');
        }
        logPass('Authenticated dashboard access check passed');

        const logoutResponse = await fetch(`${websiteBaseUrl}/api/auth/logout`, {
            method: 'POST',
            headers: { cookie: cookieHeader },
        });

        if (!logoutResponse.ok) {
            throw new Error(`Website logout smoke failed with status ${logoutResponse.status}.`);
        }
        logPass('Logout API check passed');
    } finally {
        await terminateProcessTree(websiteProcess.pid);
        await delay(1000);
    }
};

const main = async () => {
    try {
        await runDashboardSmoke();
        await runWebsiteAuthSmoke();
        logPhase('All smoke checks completed successfully');
    } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
    }
};

await main();
