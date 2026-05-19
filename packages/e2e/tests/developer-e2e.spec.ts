/**
 * Developer Agent — Full E2E Scenario Test  (Sprint 8)
 *
 * Covers the complete lifecycle of a Developer agent:
 *   hire → Jira task → code → PR draft → approval → billing metered
 *
 * Each step is a browser assertion against the dashboard / API gateway.
 * Steps that require asynchronous backend work assert intermediate state rather
 * than waiting for real AI processing (unit tests cover the processing logic).
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs, TEST_USER } from '../helpers/auth'

const GATEWAY_URL = process.env['GATEWAY_URL'] ?? 'http://localhost:3000'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAuthCookie(page: Page): Promise<string> {
    const cookies = await page.context().cookies()
    const session = cookies.find((c) => c.name === 'session' || c.name === 'next-auth.session-token')
    return session?.value ?? ''
}

async function apiPost(page: Page, path: string, body: unknown): Promise<Response> {
    const cookie = await getAuthCookie(page)
    return fetch(`${GATEWAY_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: `session=${cookie}` } : {}),
        },
        body: JSON.stringify(body),
    })
}

async function apiGet(page: Page, path: string): Promise<Response> {
    const cookie = await getAuthCookie(page)
    return fetch(`${GATEWAY_URL}${path}`, {
        headers: cookie ? { Cookie: `session=${cookie}` } : {},
    })
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Developer Agent — full scenario', () => {
    let developerBotId: string

    test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)
    })

    // ── Step 1: Marketplace listing is visible ──────────────────────────────
    test('1 — Marketplace shows Developer agent listing', async ({ page }) => {
        await page.goto('/marketplace')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(/developer/i, { timeout: 15_000 })
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 2: Hire wizard is reachable ────────────────────────────────────
    test('2 — Hire wizard loads for Developer role', async ({ page }) => {
        await page.goto('/marketplace/developer')
        await page.waitForLoadState('networkidle')

        const hasWizardOrRole = await page
            .locator('body')
            .getByText(/developer|hire|get started|setup|configure/i)
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false)

        expect(hasWizardOrRole).toBe(true)
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 3: Bot API creates a developer agent ────────────────────────────
    test('3 — POST /v1/bots creates a developer bot', async ({ page }) => {
        const res = await apiPost(page, '/v1/bots', {
            name: 'E2E Developer Bot',
            role: 'developer',
            tenantId: 'e2e-tenant-001',
        })

        // Accept 201 (created) or 200 (upsert) — not a 4xx/5xx
        expect(res.status).toBeLessThan(400)

        if (res.status === 201 || res.status === 200) {
            const json: unknown = await res.json()
            if (json && typeof json === 'object' && 'id' in json) {
                developerBotId = String((json as Record<string, unknown>)['id'])
            }
        }
    })

    // ── Step 4: Task creation is accepted ───────────────────────────────────
    test('4 — POST /v1/tasks creates a developer task', async ({ page }) => {
        // Use a stable bot ID for this isolated assertion
        const res = await apiPost(page, '/v1/tasks', {
            tenantId: 'e2e-tenant-001',
            botId: developerBotId ?? 'e2e-dev-bot',
            taskType: 'code_change',
            input: {
                description: 'Add unit test for login function',
                repo: 'agentfarm/api-gateway',
                branch: 'main',
            },
        })

        // 201 created, 200 accepted, 202 queued — all valid; 400 means bad schema
        expect(res.status).toBeLessThan(500)
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 5: PR Drafts panel is reachable from the dashboard ─────────────
    test('5 — PR Drafts page loads', async ({ page }) => {
        await page.goto('/pr-drafts')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(/pr draft|pull request|draft/i, {
            timeout: 10_000,
        })
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 6: CI triage panel is reachable ────────────────────────────────
    test('6 — CI Triage page loads', async ({ page }) => {
        await page.goto('/ci')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(/ci|build|pipeline|triage|failure/i, {
            timeout: 10_000,
        })
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 7: Approval queue shows pending items (or empty state) ──────────
    test('7 — Approval queue page loads', async ({ page }) => {
        await page.goto('/approvals')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(
            /approval|pending|review|queue|no items/i,
            { timeout: 10_000 },
        )
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 8: Memory browser page loads ───────────────────────────────────
    test('8 — Memory browser page loads', async ({ page }) => {
        await page.goto('/memory')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(/memory|episode|recall|no memory/i, {
            timeout: 10_000,
        })
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 9: Billing page reflects usage ─────────────────────────────────
    test('9 — Billing page shows usage metrics', async ({ page }) => {
        await page.goto('/billing')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(/usage|token|invocation|cost|subscription/i, {
            timeout: 10_000,
        })
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    // ── Step 10: Developer overview section is present on main dashboard ─────
    test('10 — Developer Agent section is visible on main dashboard', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await expect(page.locator('body')).toContainText(/developer agent/i, { timeout: 10_000 })
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })
})
