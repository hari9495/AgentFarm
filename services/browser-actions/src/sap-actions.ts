/**
 * SAP Browser Actions
 *
 * Browser-driven automation for SAP Fiori and SAP Web GUI using Playwright.
 * All functions take a `Page` object (passed in) — they do not create browsers.
 *
 * SAP GUI for Windows (native client) is NOT supported — the user will be
 * instructed to perform the action manually.
 */
import type { Page } from 'playwright';

export type SapUiType = 'fiori' | 'webgui' | 'sapgui_windows' | 'unknown';

export type BrowserActionResult = {
    ok: boolean;
    output: string;
    errorOutput?: string;
    reason?: string;
};

const NOT_SUPPORTED: BrowserActionResult = {
    ok: false,
    output: 'not_supported',
    reason: 'SAP GUI for Windows cannot be browser-automated. Ask a human to perform this action.',
};

export function detectSapUiType(url: string): SapUiType {
    if (url.startsWith('sapgui://') || url.includes('.exe')) {
        return 'sapgui_windows';
    }
    if (
        url.includes('/ui#') ||
        url.includes('/sap/bc/ui5_ui5') ||
        url.includes('/sap/bc/ushell')
    ) {
        return 'fiori';
    }
    if (url.includes('/sap/bc/gui/sap/its/webgui')) {
        return 'webgui';
    }
    return 'unknown';
}

export async function sapLogin(
    page: Page,
    params: { loginUrl: string; username: string; password: string; client?: string },
): Promise<BrowserActionResult> {
    const uiType = detectSapUiType(params.loginUrl);
    if (uiType === 'sapgui_windows') {
        return NOT_SUPPORTED;
    }
    try {
        await page.goto(params.loginUrl, { waitUntil: 'domcontentloaded' });
        if (uiType === 'webgui') {
            await page.fill('input[name="sap-user"]', params.username);
            await page.fill('input[name="sap-password"]', params.password);
            if (params.client) {
                await page.fill('input[name="sap-client"]', params.client);
            }
        } else {
            // Fiori or unknown — try common selectors in priority order
            const usernameInput = page
                .locator('#USERNAME_FIELD, input[name="logonname"], input[name="username"]')
                .first();
            await usernameInput.fill(params.username);
            const passwordInput = page
                .locator('#PASSWORD_FIELD, input[name="password"], input[type="password"]')
                .first();
            await passwordInput.fill(params.password);
        }
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.keyboard.press('Enter'),
        ]);
        return { ok: true, output: 'logged_in' };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `sapLogin error: ${String(err)}` };
    }
}

export async function sapNavigateTransaction(
    page: Page,
    params: { baseUrl: string; transaction: string },
): Promise<BrowserActionResult> {
    const uiType = detectSapUiType(params.baseUrl);
    if (uiType === 'sapgui_windows') {
        return NOT_SUPPORTED;
    }
    try {
        const base = params.baseUrl.replace(/\/$/, '');
        const url =
            uiType === 'webgui'
                ? `${base}?~transaction=${encodeURIComponent(params.transaction)}`
                : `${base}/ui#${encodeURIComponent(params.transaction)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return { ok: true, output: 'navigated' };
    } catch (err) {
        return {
            ok: false,
            output: '',
            errorOutput: `sapNavigateTransaction error: ${String(err)}`,
        };
    }
}

export async function sapReadScreen(
    page: Page,
    params: { fields?: string[] },
): Promise<BrowserActionResult> {
    try {
        const uiType = detectSapUiType(page.url());
        let values: Record<string, string>;

        if (uiType === 'webgui') {
            values = await page.evaluate(() => {
                const result: Record<string, string> = {};
                for (const label of document.querySelectorAll('label')) {
                    const forId = label.getAttribute('for');
                    if (!forId) continue;
                    const input = document.getElementById(forId) as HTMLInputElement | null;
                    const labelText = label.textContent?.trim();
                    if (input && labelText) {
                        result[labelText] = input.value;
                    }
                }
                return result;
            });
        } else {
            // Fiori: read sapMLabel + adjacent value element
            values = await page.evaluate(() => {
                const result: Record<string, string> = {};
                for (const el of document.querySelectorAll(
                    '[class*="sapMLabel"], [class*="sapMText"]',
                )) {
                    const labelText = el.textContent?.trim();
                    if (!labelText) continue;
                    const sibling = el.nextElementSibling;
                    if (sibling) {
                        result[labelText] = sibling.textContent?.trim() ?? '';
                    }
                }
                return result;
            });
        }

        if (params.fields && params.fields.length > 0) {
            const filtered: Record<string, string> = {};
            for (const f of params.fields) {
                filtered[f] = values[f] ?? '';
            }
            return { ok: true, output: JSON.stringify(filtered) };
        }
        return { ok: true, output: JSON.stringify(values) };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `sapReadScreen error: ${String(err)}` };
    }
}

export async function sapFillForm(
    page: Page,
    params: { fields: Record<string, string>; submit: boolean },
): Promise<BrowserActionResult> {
    try {
        for (const [fieldName, value] of Object.entries(params.fields)) {
            const label = page.locator(`label:has-text("${fieldName}")`).first();
            if (await label.isVisible({ timeout: 2_000 }).catch(() => false)) {
                const forAttr = await label.getAttribute('for').catch(() => null);
                if (forAttr) {
                    // Use attribute selector to avoid CSS.escape dependency in Node.js context
                    await page
                        .locator(`[id="${forAttr.replace(/"/g, '\\"')}"]`)
                        .fill(value);
                } else {
                    const siblingInput = label
                        .locator('xpath=following-sibling::input | following-sibling::*/input')
                        .first();
                    await siblingInput.fill(value);
                }
            } else {
                // Fall back to name or placeholder attribute
                await page
                    .locator(`input[name="${fieldName}"], input[placeholder="${fieldName}"]`)
                    .first()
                    .fill(value);
            }
        }

        if (params.submit) {
            const submitBtn = page
                .locator(
                    'button[title="Execute"], button[title="Enter"], button[title="Save"], button[type="submit"]',
                )
                .first();
            if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
                await submitBtn.click();
            } else {
                await page.keyboard.press('Enter');
            }
            await page.waitForLoadState('domcontentloaded');
        }
        return { ok: true, output: 'submitted' };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `sapFillForm error: ${String(err)}` };
    }
}
