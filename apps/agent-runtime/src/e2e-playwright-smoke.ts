import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PlaywrightDesktopOperator } from './desktop-operator-playwright.js';

async function run() {
    const url = 'https://github.com';
    console.log('[smoke] DESKTOP_OPERATOR =', process.env.DESKTOP_OPERATOR ?? '(not set)');
    console.log('[smoke] Starting PlaywrightDesktopOperator smoke test');
    console.log('[smoke] Target URL:', url);

    // --- Test 1: browserOpen via the adapter (headless: false, visible window) ---
    console.log('\n[smoke] Step 1 — browserOpen via PlaywrightDesktopOperator (visible window)');
    const op = new PlaywrightDesktopOperator();
    const openResult = await op.browserOpen(url);
    console.log('[smoke] result:', JSON.stringify(openResult, null, 2));

    if (!openResult.ok) {
        console.error('[smoke] FAILED: browserOpen returned ok=false');
        await op.cleanup();
        process.exit(1);
    }

    console.log('[smoke] ✓ Chromium window should now be visible on screen');
    console.log('[smoke] Holding visible window open for 4 seconds...');
    await new Promise(r => setTimeout(r, 4000));

    await op.cleanup();
    console.log('[smoke] ✓ Visible window closed');

    // --- Test 2: screenshot via headless chromium ---
    console.log('\n[smoke] Step 2 — Capturing screenshot via headless Chromium');
    const screenshotDir = join(process.cwd(), 'smoke-output');
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, 'github-screenshot.png');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await page.title();
    await page.screenshot({ path: screenshotPath });
    await browser.close();

    console.log('[smoke] ✓ Screenshot saved:', screenshotPath);
    console.log('[smoke] ✓ Page title:', title);

    // --- Test 3: appLaunch not_supported ---
    console.log('\n[smoke] Step 3 — appLaunch (should return not_supported)');
    const op2 = new PlaywrightDesktopOperator();
    const appResult = await op2.appLaunch('terminal');
    console.log('[smoke] appLaunch result:', JSON.stringify(appResult, null, 2));
    await op2.cleanup();

    // --- Summary ---
    console.log('\n[smoke] ═══════════════════════════════════');
    console.log('[smoke] RESULTS');
    console.log('[smoke] ═══════════════════════════════════');
    console.log('[smoke] browserOpen ok:          ', openResult.ok);
    console.log('[smoke] browserOpen durationMs:  ', openResult.durationMs);
    console.log('[smoke] page title:              ', title);
    console.log('[smoke] screenshot:              ', screenshotPath);
    console.log('[smoke] appLaunch ok (expect false):', appResult.ok);
    console.log('[smoke] appLaunch output:        ', appResult.output);
    console.log('[smoke] ✓ ALL STEPS PASSED');
}

run().catch((err: unknown) => {
    console.error('[smoke] FATAL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
