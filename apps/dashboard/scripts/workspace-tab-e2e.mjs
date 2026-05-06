import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? process.env.DASHBOARD_E2E_BASE_URL ?? 'http://127.0.0.1:3101';

const expectQuery = async (page, expected, label) => {
    try {
        await page.waitForFunction((queryExpected) => {
            const params = new URLSearchParams(window.location.search);
            return Object.entries(queryExpected).every(([key, value]) => params.get(key) === value);
        }, expected);
    } catch {
        throw new Error(`Expected query for ${label}: ${JSON.stringify(expected)} but got ${page.url()}`);
    }
};

const clickAndExpectQuery = async (page, selector, expected, label) => {
    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await page.click(selector);
        try {
            await expectQuery(page, expected, label);
            return;
        } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                throw error;
            }
        }
    }
    throw lastError;
};

// Build a minimal JWT that satisfies the middleware's scope check without a real secret.
// The middleware only reads the decoded payload — it does not verify the signature.
const makeInternalTestToken = () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ scope: 'internal', sub: 'e2e-test', iat: 9_999_999_999 })).toString('base64url');
    return `${header}.${payload}.e2e-smoke`;
};

const main = async () => {
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();

        // Inject an internal-scoped session cookie so the middleware lets the test through.
        const origin = new URL(baseUrl);
        await context.addCookies([{
            name: 'agentfarm_internal_session',
            value: encodeURIComponent(makeInternalTestToken()),
            domain: origin.hostname,
            path: '/',
            sameSite: 'Strict',
        }]);

        const page = await context.newPage();

        await page.goto(`${baseUrl}/?workspaceId=ws_primary_001&tab=overview`, { waitUntil: 'networkidle' });
        await page.evaluate(() => window.localStorage.clear());
        await page.goto(`${baseUrl}/?workspaceId=ws_primary_001&tab=overview`, { waitUntil: 'networkidle' });

        await clickAndExpectQuery(
            page,
            '[data-testid="dashboard-tab-top-approvals"]',
            { workspaceId: 'ws_primary_001', tab: 'approvals' },
            'switching to approvals in workspace 1',
        );

        await page.selectOption('[data-testid="workspace-switcher-topbar"]', 'ws_release_002');
        await page.click('[data-testid="workspace-switcher-open-topbar"]');
        await expectQuery(page, { workspaceId: 'ws_release_002', tab: 'approvals' }, 'switching workspace to ws_release_002');
        // Wait for the Next.js RSC re-render and React hydration to settle before
        // interacting with tab buttons in the new workspace context.
        await page.waitForLoadState('networkidle');

        await clickAndExpectQuery(
            page,
            '[data-testid="dashboard-tab-top-observability"]',
            { workspaceId: 'ws_release_002', tab: 'observability' },
            'switching to observability in workspace 2',
        );

        await page.goto(`${baseUrl}/?workspaceId=ws_primary_001`, { waitUntil: 'networkidle' });
        await expectQuery(page, { workspaceId: 'ws_primary_001', tab: 'approvals' }, 'restoring workspace 1 tab');

        await page.goto(`${baseUrl}/?workspaceId=ws_release_002`, { waitUntil: 'networkidle' });
        await expectQuery(page, { workspaceId: 'ws_release_002', tab: 'observability' }, 'restoring workspace 2 tab');

        await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
        await expectQuery(page, { workspaceId: 'ws_release_002' }, 'restoring sticky workspace without query');

        const currentWorkspace = await page.locator('[data-testid="workspace-switcher-topbar"]').inputValue();
        assert.equal(currentWorkspace, 'ws_release_002');

        process.stdout.write('[PASS] Dashboard browser e2e workspace/tab persistence passed\n');
    } finally {
        await browser.close();
    }
};

main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
});
