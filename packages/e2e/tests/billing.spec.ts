import { test, expect } from '@playwright/test'
import { loginAs, TEST_USER } from '../helpers/auth'

test.describe('Billing page', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)
        await page.goto('/billing')
        await page.waitForLoadState('networkidle')
    })

    test('billing page loads without a server error', async ({ page }) => {
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i)
    })

    test('subscription section is visible', async ({ page }) => {
        await expect(page.locator('body')).toContainText(/subscription|plan|status/i, {
            timeout: 10_000,
        })
    })

    test('usage summary section is visible', async ({ page }) => {
        await expect(page.locator('body')).toContainText(/usage|tokens|invocations|cost/i, {
            timeout: 10_000,
        })
    })
})
