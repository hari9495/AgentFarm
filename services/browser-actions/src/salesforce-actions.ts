/**
 * Salesforce Browser Actions
 *
 * Browser-driven automation for Salesforce using Playwright.
 * All functions take a `Page` object (passed in) — they do not create browsers.
 */
import type { Page } from 'playwright';

export type BrowserActionResult = {
    ok: boolean;
    output: string;
    errorOutput?: string;
};

export async function salesforceLogin(
    page: Page,
    params: { loginUrl: string; username: string; password: string },
): Promise<BrowserActionResult> {
    try {
        await page.goto(params.loginUrl, { waitUntil: 'domcontentloaded' });
        await page.fill('#username', params.username);
        await page.fill('#password', params.password);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('#Login'),
        ]);
        const currentUrl = page.url();
        if (currentUrl.includes('login')) {
            return {
                ok: false,
                output: '',
                errorOutput: `Login may have failed — current URL still contains "login": ${currentUrl}`,
            };
        }
        return { ok: true, output: 'logged_in' };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `salesforceLogin error: ${String(err)}` };
    }
}

export async function salesforceReadRecord(
    page: Page,
    params: { recordUrl: string; fields: string[] },
): Promise<BrowserActionResult> {
    try {
        await page.goto(params.recordUrl, { waitUntil: 'domcontentloaded' });
        const values: Record<string, string> = {};
        for (const field of params.fields) {
            const labelEl = page.getByText(field, { exact: true }).first();
            const formElement = labelEl
                .locator('xpath=ancestor::*[contains(@class,"slds-form-element")]')
                .first();
            const valueEl = formElement
                .locator('[class*="slds-form-element__static"], [class*="slds-form-element__control"]')
                .first();
            values[field] = (await valueEl.textContent({ timeout: 5_000 }).catch(() => null)) ?? '';
        }
        return { ok: true, output: JSON.stringify(values) };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `salesforceReadRecord error: ${String(err)}` };
    }
}

export async function salesforceUpdateField(
    page: Page,
    params: { recordUrl: string; field: string; value: string },
): Promise<BrowserActionResult> {
    try {
        await page.goto(params.recordUrl, { waitUntil: 'domcontentloaded' });
        const labelEl = page.getByText(params.field, { exact: true }).first();
        const formElement = labelEl
            .locator('xpath=ancestor::*[contains(@class,"slds-form-element")]')
            .first();
        const inlineEditBtn = formElement.locator('button[title="Edit"]').first();
        if (await inlineEditBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await inlineEditBtn.click();
        } else {
            await page.getByRole('button', { name: /Edit/i }).first().click();
        }
        const input = formElement.locator('input, textarea').first();
        await input.selectText();
        await input.fill(params.value);
        await page.getByRole('button', { name: /Save/i }).first().click();
        await page.waitForSelector('.slds-form-element', { timeout: 5_000 });
        return { ok: true, output: 'updated' };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `salesforceUpdateField error: ${String(err)}` };
    }
}

export async function salesforceRunReport(
    page: Page,
    params: { reportUrl: string },
): Promise<BrowserActionResult> {
    try {
        await page.goto(params.reportUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('table, [class*="reportTable"]', { timeout: 15_000 });
        const rows = await page.evaluate(() => {
            const headerEls = Array.from(
                document.querySelectorAll('table th, [class*="reportTable"] th'),
            );
            const headers = headerEls.map((th) => th.textContent?.trim() ?? '');
            const rowEls = Array.from(
                document.querySelectorAll('table tbody tr, [class*="reportTable"] tbody tr'),
            );
            return rowEls.map((row) => {
                const cells = Array.from(row.querySelectorAll('td')).map(
                    (td) => td.textContent?.trim() ?? '',
                );
                return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
            });
        });
        return { ok: true, output: JSON.stringify(rows) };
    } catch (err) {
        return { ok: false, output: '', errorOutput: `salesforceRunReport error: ${String(err)}` };
    }
}
