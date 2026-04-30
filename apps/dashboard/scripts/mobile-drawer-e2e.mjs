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

const expectDrawerState = async (page, expectedExpanded) => {
    const toggle = page.locator('[data-testid="dashboard-drawer-toggle"]');
    const scrim = page.locator('[data-testid="dashboard-drawer-scrim"]');

    await page.waitForFunction(
        ([toggleSelector, scrimSelector, expanded]) => {
            const toggleElement = document.querySelector(toggleSelector);
            const scrimElement = document.querySelector(scrimSelector);

            if (!(toggleElement instanceof HTMLElement) || !(scrimElement instanceof HTMLElement)) {
                return false;
            }

            const toggleExpanded = toggleElement.getAttribute('aria-expanded') === 'true';
            const scrimVisible = scrimElement.classList.contains('visible');
            return toggleExpanded === expanded && scrimVisible === expanded;
        },
        ['[data-testid="dashboard-drawer-toggle"]', '[data-testid="dashboard-drawer-scrim"]', expectedExpanded],
    );

    assert.equal(await toggle.getAttribute('aria-expanded'), expectedExpanded ? 'true' : 'false');
};

const main = async () => {
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();

        await page.goto(`${baseUrl}/?workspaceId=ws_primary_001&tab=overview`, { waitUntil: 'networkidle' });
        await page.evaluate(() => window.localStorage.clear());
        await page.goto(`${baseUrl}/?workspaceId=ws_primary_001&tab=overview`, { waitUntil: 'networkidle' });

        await expectDrawerState(page, false);

        await page.click('[data-testid="dashboard-drawer-toggle"]');
        await expectDrawerState(page, true);

        await page.click('[data-testid="dashboard-drawer-scrim"]');
        await expectDrawerState(page, false);

        await page.click('[data-testid="dashboard-drawer-toggle"]');
        await expectDrawerState(page, true);
        await page.click('[data-testid="dashboard-tab-sidebar-approvals"]');
        await expectQuery(page, { workspaceId: 'ws_primary_001', tab: 'approvals' }, 'opening approvals from the mobile drawer');
        await expectDrawerState(page, false);

        await page.focus('[data-testid="dashboard-tab-top-approvals"]');
        await page.keyboard.press('End');
        await expectQuery(page, { workspaceId: 'ws_primary_001', tab: 'audit' }, 'jumping to the last tab with End');

        await page.focus('[data-testid="dashboard-tab-top-audit"]');
        await page.keyboard.press('Home');
        await expectQuery(page, { workspaceId: 'ws_primary_001', tab: 'overview' }, 'jumping to the first tab with Home');

        await page.focus('[data-testid="dashboard-tab-top-overview"]');
        await page.keyboard.press('ArrowRight');
        await expectQuery(page, { workspaceId: 'ws_primary_001', tab: 'approvals' }, 'moving to the next tab with ArrowRight');

        process.stdout.write('[PASS] Dashboard mobile drawer and keyboard navigation e2e passed\n');
    } finally {
        await browser.close();
    }
};

main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
});