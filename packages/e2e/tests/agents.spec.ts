import { test, expect } from '@playwright/test'
import { loginAs, TEST_USER } from '../helpers/auth'

test.describe('Agents page', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)
    })

    test('agents page loads and shows Agent Builder header', async ({ page }) => {
        await page.goto('/agents')
        await expect(page.getByText('Agent Builder')).toBeVisible({ timeout: 10_000 })
    })

    test('clicking + New Agent shows create form inputs', async ({ page }) => {
        await page.goto('/agents')
        await page.getByText('+ New Agent').click()
        await expect(page.getByPlaceholder(/e\.g\. Developer Agent/i)).toBeVisible()
        await expect(page.getByPlaceholder(/ws_/i)).toBeVisible()
    })

    test('create form accepts Role and Workspace ID values', async ({ page }) => {
        await page.goto('/agents')
        await page.getByText('+ New Agent').click()

        const roleInput = page.getByPlaceholder(/e\.g\. Developer Agent/i)
        await expect(roleInput).toBeVisible()
        await roleInput.fill('developer_agent')

        const wsInput = page.getByPlaceholder(/ws_/i)
        await expect(wsInput).toBeVisible()
        await wsInput.fill('ws_test')
    })

    test('agent list renders or shows empty state without a server error', async ({ page }) => {
        await page.goto('/agents')
        await page.waitForLoadState('networkidle')
        await expect(page.locator('body')).not.toContainText(
            /500|internal server error/i,
            { timeout: 10_000 },
        )
    })
})
