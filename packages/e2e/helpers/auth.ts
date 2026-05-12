import { type Page } from '@playwright/test'

export const TEST_USER = {
    email: process.env['E2E_TEST_EMAIL'] ?? 'test@agentfarm.dev',
    password: process.env['E2E_TEST_PASSWORD'] ?? 'TestPassword123!',
    name: 'E2E Test User',
}

/**
 * Navigate to /login, fill credentials, submit, and wait for redirect away from /login.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 })
}

/**
 * Clear all browser cookies, then navigate to /login.
 */
export async function logout(page: Page): Promise<void> {
    await page.context().clearCookies()
    await page.goto('/login')
    await page.waitForURL('/login')
}
