/**
 * Generic web automation actions using Playwright.
 * Works on any website — no hardcoded app-specific selectors.
 *
 * All functions accept a BrowserContext and create their own page via
 * context.newPage() so sessions (cookies, storage) are shared within
 * the context across calls.
 */
import type { BrowserContext } from 'playwright';

export interface WebActionResult {
    ok: boolean;
    output: string;
    reason?: string;
}

const USERNAME_SELECTORS = [
    'input[type="email"]',
    'input[name="username"]',
    'input[name="logonname"]',
    'input[name="email"]',
    'input[name="sap-user"]',
    '#username',
];

const PASSWORD_SELECTORS = [
    'input[type="password"]',
    'input[name="sap-password"]',
];

function isLoginPage(url: string): boolean {
    return /login|signin|auth|logon/i.test(url);
}

export async function webLogin(
    context: BrowserContext,
    params: { url: string; username: string; password: string },
): Promise<WebActionResult> {
    const page = await context.newPage();
    try {
        await page.goto(params.url, { waitUntil: 'domcontentloaded' });

        if (!isLoginPage(page.url())) {
            return { ok: true, output: 'already_logged_in' };
        }

        // Fill username — try selectors in order
        let filledUsername = false;
        for (const sel of USERNAME_SELECTORS) {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
                await el.fill(params.username);
                filledUsername = true;
                break;
            }
        }
        if (!filledUsername) {
            return { ok: false, output: 'login_failed', reason: 'Could not find username input' };
        }

        await page.keyboard.press('Tab');

        // Fill password — try selectors in order
        let filledPassword = false;
        for (const sel of PASSWORD_SELECTORS) {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
                await el.fill(params.password);
                filledPassword = true;
                break;
            }
        }
        if (!filledPassword) {
            return { ok: false, output: 'login_failed', reason: 'Could not find password input' };
        }

        await Promise.all([
            page.waitForLoadState('networkidle').catch(() => null),
            page.keyboard.press('Enter'),
        ]);

        if (isLoginPage(page.url())) {
            return { ok: false, output: 'login_failed', reason: 'Still on login page' };
        }

        return { ok: true, output: 'logged_in' };
    } catch (e) {
        return { ok: false, output: 'error', reason: String(e) };
    } finally {
        await page.close();
    }
}

export async function webNavigate(
    context: BrowserContext,
    params: { url: string },
): Promise<WebActionResult> {
    const page = await context.newPage();
    try {
        await page.goto(params.url, { waitUntil: 'networkidle' });
        return { ok: true, output: page.url() };
    } catch (e) {
        return { ok: false, output: 'error', reason: String(e) };
    } finally {
        await page.close();
    }
}

export async function webReadPage(
    context: BrowserContext,
    params: { url?: string },
): Promise<WebActionResult> {
    const page = await context.newPage();
    try {
        if (params.url) {
            await page.goto(params.url, { waitUntil: 'domcontentloaded' });
        }
        const text = await page.innerText('body');
        return { ok: true, output: text.trim().slice(0, 4_000) };
    } catch (e) {
        return { ok: false, output: 'error', reason: String(e) };
    } finally {
        await page.close();
    }
}

export async function webFillForm(
    context: BrowserContext,
    params: { url?: string; fields: Record<string, string>; submit: boolean },
): Promise<WebActionResult> {
    const page = await context.newPage();
    try {
        if (params.url) {
            await page.goto(params.url, { waitUntil: 'domcontentloaded' });
        }

        for (const [fieldName, value] of Object.entries(params.fields)) {
            const escapedName = fieldName.replace(/"/g, '\\"');

            // Try label with matching text (case-insensitive via filter)
            const label = page
                .locator('label')
                .filter({ hasText: new RegExp(escapedName, 'i') })
                .first();

            let filled = false;

            if (await label.isVisible({ timeout: 2_000 }).catch(() => false)) {
                const forAttr = await label.getAttribute('for').catch(() => null);
                if (forAttr) {
                    const input = page.locator(`[id="${forAttr.replace(/"/g, '\\"')}"]`).first();
                    if (await input.isVisible({ timeout: 1_000 }).catch(() => false)) {
                        await input.fill(value);
                        filled = true;
                    }
                }
                if (!filled) {
                    // Try sibling input immediately after the label
                    const sibling = label
                        .locator('xpath=following-sibling::input[1] | following-sibling::*[1]//input[1]')
                        .first();
                    if (await sibling.isVisible({ timeout: 1_000 }).catch(() => false)) {
                        await sibling.fill(value);
                        filled = true;
                    }
                }
            }

            if (!filled) {
                // Fall back to name or placeholder attribute containing fieldName
                const fallback = page
                    .locator(
                        `input[name*="${escapedName}" i], input[placeholder*="${escapedName}" i], textarea[name*="${escapedName}" i]`,
                    )
                    .first();
                if (await fallback.isVisible({ timeout: 1_000 }).catch(() => false)) {
                    await fallback.fill(value);
                    filled = true;
                }
            }

            if (!filled) {
                return {
                    ok: false,
                    output: 'error',
                    reason: `Could not find input for field: ${fieldName}`,
                };
            }
        }

        if (params.submit) {
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1_500);
        }

        return { ok: true, output: 'form_filled' };
    } catch (e) {
        return { ok: false, output: 'error', reason: String(e) };
    } finally {
        await page.close();
    }
}

export async function webClick(
    context: BrowserContext,
    params: { url?: string; target: string },
): Promise<WebActionResult> {
    const page = await context.newPage();
    try {
        if (params.url) {
            await page.goto(params.url, { waitUntil: 'domcontentloaded' });
        }

        const element = page
            .locator(
                `button, a, [role="button"], input[type="submit"], input[type="button"]`,
            )
            .filter({ hasText: new RegExp(params.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
            .first();

        if (!(await element.isVisible({ timeout: 3_000 }).catch(() => false))) {
            return {
                ok: false,
                output: 'error',
                reason: `Could not find clickable element matching: ${params.target}`,
            };
        }

        await element.click();
        await page.waitForTimeout(1_000);

        return { ok: true, output: `clicked:${params.target}` };
    } catch (e) {
        return { ok: false, output: 'error', reason: String(e) };
    } finally {
        await page.close();
    }
}

export async function webExtractData(
    context: BrowserContext,
    params: { url?: string; target: 'table' | 'list' | 'fields' | 'all' },
): Promise<WebActionResult> {
    const page = await context.newPage();
    try {
        if (params.url) {
            await page.goto(params.url, { waitUntil: 'domcontentloaded' });
        }

        const result: Record<string, unknown> = {};

        const shouldExtract = (key: 'table' | 'list' | 'fields') =>
            params.target === key || params.target === 'all';

        if (shouldExtract('table')) {
            result['table'] = await page.evaluate(() => {
                const rows: Record<string, string>[] = [];
                for (const table of document.querySelectorAll('table')) {
                    const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map(
                        (th) => th.textContent?.trim() ?? '',
                    );
                    if (headers.length === 0) continue;
                    for (const row of table.querySelectorAll('tbody tr')) {
                        const cells = Array.from(row.querySelectorAll('td')).map(
                            (td) => td.textContent?.trim() ?? '',
                        );
                        rows.push(Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
                    }
                }
                return rows;
            });
        }

        if (shouldExtract('list')) {
            result['list'] = await page.evaluate(() =>
                Array.from(document.querySelectorAll('li'))
                    .map((li) => li.textContent?.trim() ?? '')
                    .filter(Boolean),
            );
        }

        if (shouldExtract('fields')) {
            result['fields'] = await page.evaluate(() => {
                const pairs: Record<string, string> = {};
                for (const label of document.querySelectorAll('label')) {
                    const labelText = label.textContent?.trim();
                    if (!labelText) continue;
                    const forId = label.getAttribute('for');
                    if (forId) {
                        const input = document.getElementById(forId) as HTMLInputElement | null;
                        if (input) {
                            pairs[labelText] = input.value ?? input.textContent?.trim() ?? '';
                            continue;
                        }
                    }
                    const sibling = label.nextElementSibling;
                    if (sibling) {
                        pairs[labelText] = sibling.textContent?.trim() ?? '';
                    }
                }
                return pairs;
            });
        }

        const output = params.target === 'all' ? result : result[params.target];
        return { ok: true, output: JSON.stringify(output) };
    } catch (e) {
        return { ok: false, output: 'error', reason: String(e) };
    } finally {
        await page.close();
    }
}
