import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { DesktopOperator, DesktopOperatorResult } from '@agentfarm/shared-types';

export class PlaywrightDesktopOperator implements DesktopOperator {
    private browser: Browser | null = null;
    private pages = new Map<string, Page>();

    private async ensureBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: false });
        }
        return this.browser;
    }

    async browserOpen(url: string): Promise<DesktopOperatorResult> {
        const start = Date.now();
        const browser = await this.ensureBrowser();
        const page = await browser.newPage();
        await page.goto(url);
        this.pages.set(url, page);
        return { ok: true, output: url, durationMs: Date.now() - start };
    }

    async appLaunch(_app: string, _args?: string[]): Promise<DesktopOperatorResult> {
        const start = Date.now();
        console.warn('[playwright] appLaunch not supported in Playwright adapter — use native');
        return { ok: false, output: 'not_supported', durationMs: Date.now() - start };
    }

    async meetingJoin(meetingUrl: string): Promise<DesktopOperatorResult> {
        const start = Date.now();
        const result = await this.browserOpen(meetingUrl);
        return { ok: true, output: meetingUrl, durationMs: Date.now() - start + result.durationMs };
    }

    async meetingSpeak(_text: string): Promise<DesktopOperatorResult> {
        const start = Date.now();
        console.warn('[playwright] meetingSpeak not supported in Playwright adapter');
        return { ok: false, output: 'not_supported', durationMs: Date.now() - start };
    }

    async cleanup(): Promise<void> {
        for (const page of this.pages.values()) {
            await page.close().catch(() => undefined);
        }
        this.pages.clear();
        if (this.browser) {
            await this.browser.close().catch(() => undefined);
            this.browser = null;
        }
    }
}
