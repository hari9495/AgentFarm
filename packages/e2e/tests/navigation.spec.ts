import { test, expect } from '@playwright/test'
import { loginAs, TEST_USER } from '../helpers/auth'

const PAGES_TO_CHECK = [
    '/',
    '/agents',
    '/billing',
    '/onboarding',
    '/analytics',
    '/webhooks',
    '/knowledge-graph',
    '/connector-marketplace',
    '/audit',
    '/live',
]

test.describe('Navigation smoke tests', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)
    })

    for (const path of PAGES_TO_CHECK) {
        test(`${path} loads without a server error`, async ({ page }) => {
            await page.goto(path)
            await page.waitForLoadState('networkidle', { timeout: 15_000 })
            await expect(page.locator('body')).not.toContainText(
                /500 internal server error|application error/i,
                { timeout: 5_000 },
            )
        })
    }
})
