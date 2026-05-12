import { test, expect } from '@playwright/test'

const STEP_LABELS = ['Account', 'Workspace', 'Agent', 'Plan', 'Done']

test.describe('Onboarding wizard', () => {
    test('renders all 5 step labels', async ({ page }) => {
        await page.goto('/onboarding')
        for (const label of STEP_LABELS) {
            await expect(page.getByText(label)).toBeVisible({ timeout: 8_000 })
        }
    })

    test('account step form is interactive with unique test data', async ({ page }) => {
        const ts = Date.now()
        await page.goto('/onboarding')

        // Fill step 1 (Account) fields — labels are associated via wrapping <label> elements
        await page.getByLabel(/full name/i).fill(`E2E User ${ts}`)
        await page.getByLabel(/work email/i).fill(`e2e-${ts}@agentfarm.dev`)
        await page.getByLabel(/password/i).fill('TestSetup123!')
        await page.getByLabel(/company name/i).fill(`E2E Corp ${ts}`)

        // Submit button on step 1 should be visible and enabled
        const submitButton = page.locator('button[type="submit"]')
        await expect(submitButton).toBeVisible()
        await expect(submitButton).toBeEnabled()
    })
})
