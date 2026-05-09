/**
 * Browser action executor.
 *
 * Provides a fire-and-forget capable browser automation fallback for connector
 * types that do not have a native provider implementation. Uses Playwright via
 * the existing getDesktopOperator() / PlaywrightDesktopOperator infrastructure.
 *
 * Screenshots are written to /tmp so that evidence can be attached to the
 * action-result record without additional object-store configuration.
 */

import type { Page } from 'playwright';
import { getDesktopOperator } from './desktop-operator-factory.js';
import { PlaywrightDesktopOperator } from './desktop-operator-playwright.js';

export interface BrowserActionInput {
    url: string;
    instructions: string;
    taskId: string;
}

export interface BrowserActionResult {
    ok: boolean;
    output: string;
    reason?: string;
    screenshotBefore?: string; // file path
    screenshotAfter?: string;  // file path
}

export async function executeBrowserAction(input: BrowserActionInput): Promise<BrowserActionResult> {
    const prevOperator = process.env['DESKTOP_OPERATOR'];
    process.env['DESKTOP_OPERATOR'] = 'playwright';

    let operator: PlaywrightDesktopOperator | null = null;

    const screenshotBeforePath = `/tmp/agentfarm-browser-${input.taskId}-before.png`;
    const screenshotAfterPath = `/tmp/agentfarm-browser-${input.taskId}-after.png`;

    const restoreEnv = (): void => {
        if (prevOperator === undefined) {
            delete process.env['DESKTOP_OPERATOR'];
        } else {
            process.env['DESKTOP_OPERATOR'] = prevOperator;
        }
    };

    try {
        const op = await getDesktopOperator();
        // Restore env immediately — we only needed it to select the playwright adapter.
        restoreEnv();

        if (!(op instanceof PlaywrightDesktopOperator)) {
            return {
                ok: false,
                output: '',
                reason: 'Playwright operator not available in this environment',
            };
        }
        operator = op;

        // Navigate to the target URL.
        const navResult = await operator.browserOpen(input.url);
        if (!navResult.ok) {
            return {
                ok: false,
                output: navResult.output,
                reason: `Navigation failed: ${navResult.output}`,
            };
        }

        // Access the internal pages map to take screenshots.
        // PlaywrightDesktopOperator stores pages by URL after browserOpen.
        const pages = (operator as unknown as { pages: Map<string, Page> }).pages;
        const page = pages.get(input.url);

        let screenshotBefore: string | undefined;
        let screenshotAfter: string | undefined;

        if (page) {
            await page.screenshot({ path: screenshotBeforePath });
            screenshotBefore = screenshotBeforePath;
        }

        // Execute the natural language instructions via the operator.
        await operator.meetingSpeak(input.instructions);

        if (page) {
            await page.screenshot({ path: screenshotAfterPath });
            screenshotAfter = screenshotAfterPath;
        }

        return {
            ok: true,
            output: `Completed: ${input.instructions.slice(0, 120)}`,
            screenshotBefore,
            screenshotAfter,
        };
    } catch (err) {
        return {
            ok: false,
            output: '',
            reason: err instanceof Error ? err.message : String(err),
        };
    } finally {
        if (operator) {
            await operator.cleanup().catch(() => undefined);
        }
        // Safety net: always restore env even if the try block threw before
        // the explicit restore above ran.
        restoreEnv();
    }
}
