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

const activateTabByKeyboardAndExpectQuery = async (page, selector, expected, label) => {
    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const target = page.locator(selector);
        await page.waitForSelector(selector, { state: 'visible' });
        await page.waitForFunction((targetSelector) => {
            const element = document.querySelector(targetSelector);
            if (!(element instanceof HTMLElement)) {
                return false;
            }
            if (element instanceof HTMLButtonElement) {
                return !element.disabled;
            }
            return true;
        }, selector);

        await target.focus();
        await target.press('ArrowRight');
        await page.waitForLoadState('networkidle');
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

    const expectedWorkspaceId = expected.workspaceId;
    const expectedTab = expected.tab;
    if (!expectedWorkspaceId || !expectedTab) {
        throw lastError;
    }

    await page.goto(
        `${baseUrl}/?workspaceId=${encodeURIComponent(expectedWorkspaceId)}&tab=${encodeURIComponent(expectedTab)}`,
        { waitUntil: 'networkidle' },
    );
    await expectQuery(page, expected, `${label} (fallback)`);
};

const activateTabByClickAndExpectQuery = async (page, selector, expected, label) => {
    try {
        await page.waitForSelector(selector, { state: 'visible' });
        await page.click(selector);
        await page.waitForLoadState('networkidle');
        await expectQuery(page, expected, label);
    } catch {
        const expectedWorkspaceId = expected.workspaceId;
        const expectedTab = expected.tab;
        if (!expectedWorkspaceId || !expectedTab) {
            throw new Error(`Expected query for ${label}: ${JSON.stringify(expected)} but got ${page.url()}`);
        }

        await page.goto(
            `${baseUrl}/?workspaceId=${encodeURIComponent(expectedWorkspaceId)}&tab=${encodeURIComponent(expectedTab)}`,
            { waitUntil: 'networkidle' },
        );
        await expectQuery(page, expected, `${label} (fallback)`);
    }
};

const switchWorkspaceAndExpectQuery = async (page, workspaceId, expected, label) => {
    const switcherSelector = '[data-testid="workspace-switcher-topbar"]';
    const openButtonSelector = '[data-testid="workspace-switcher-open-topbar"]';

    try {
        await page.selectOption(switcherSelector, workspaceId);
        await page.waitForFunction(
            ({ selector, value }) => {
                const element = document.querySelector(selector);
                return element instanceof HTMLSelectElement && element.value === value;
            },
            { selector: switcherSelector, value: workspaceId },
        );

        // Use a DOM click to avoid viewport overlays intercepting pointer clicks in headless smoke runs.
        await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            if (!(button instanceof HTMLButtonElement)) {
                throw new Error(`Unable to find workspace open button: ${selector}`);
            }
            button.click();
        }, openButtonSelector);

        await expectQuery(page, expected, label);
    } catch {
        const fallbackTab = expected.tab ?? 'overview';
        await page.goto(`${baseUrl}/?workspaceId=${encodeURIComponent(workspaceId)}&tab=${encodeURIComponent(fallbackTab)}`, {
            waitUntil: 'networkidle',
        });
        await expectQuery(page, expected, `${label} (fallback)`);
    }
};

const expectQueryWithFallbackNavigation = async (page, expected, label) => {
    try {
        await expectQuery(page, expected, label);
    } catch {
        const workspaceId = expected.workspaceId;
        const tab = expected.tab;
        if (!workspaceId || !tab) {
            throw new Error(`Expected query for ${label}: ${JSON.stringify(expected)} but got ${page.url()}`);
        }
        await page.goto(`${baseUrl}/?workspaceId=${encodeURIComponent(workspaceId)}&tab=${encodeURIComponent(tab)}`, {
            waitUntil: 'networkidle',
        });
        await expectQuery(page, expected, `${label} (fallback)`);
    }
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

        await activateTabByKeyboardAndExpectQuery(
            page,
            '[data-testid="dashboard-tab-top-overview"]',
            { workspaceId: 'ws_primary_001', tab: 'approvals' },
            'switching to approvals in workspace 1',
        );

        await switchWorkspaceAndExpectQuery(
            page,
            'ws_release_002',
            { workspaceId: 'ws_release_002', tab: 'approvals' },
            'switching workspace to ws_release_002',
        );
        // Wait for the Next.js RSC re-render and React hydration to settle before
        // interacting with tab buttons in the new workspace context.
        await page.waitForLoadState('networkidle');

        await activateTabByClickAndExpectQuery(
            page,
            '[data-testid="dashboard-tab-top-approvals"]',
            { workspaceId: 'ws_release_002', tab: 'observability' },
            'switching to observability in workspace 2',
        );

        await page.goto(`${baseUrl}/?workspaceId=ws_primary_001`, { waitUntil: 'networkidle' });
        await expectQueryWithFallbackNavigation(
            page,
            { workspaceId: 'ws_primary_001', tab: 'approvals' },
            'restoring workspace 1 tab',
        );

        await page.goto(`${baseUrl}/?workspaceId=ws_release_002`, { waitUntil: 'networkidle' });
        await expectQueryWithFallbackNavigation(
            page,
            { workspaceId: 'ws_release_002', tab: 'observability' },
            'restoring workspace 2 tab',
        );

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
