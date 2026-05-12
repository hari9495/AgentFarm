import { test, expect } from '@playwright/test'
import { loginAs, logout, TEST_USER } from '../helpers/auth'

test.describe('Authentication', () => {
    test('login with valid credentials redirects away from /login', async ({ page }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)
        expect(page.url()).not.toContain('/login')
    })

    test('login with wrong password shows an error message', async ({ page }) => {
        await page.goto('/login')
        await page.locator('input[type="email"]').fill(TEST_USER.email)
        await page.locator('input[type="password"]').fill('WrongPassword000!')
        await page.locator('button[type="submit"]').click()
        await expect(page.locator('body')).toContainText(
            /incorrect|invalid|failed|unauthorized/i,
            { timeout: 8_000 },
        )
    })

    test('unauthenticated user visiting / is redirected to /login', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    })

    test('after clearing cookies, visiting / redirects to /login', async ({ page }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)
        await logout(page)
        await page.goto('/')
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    })
})
