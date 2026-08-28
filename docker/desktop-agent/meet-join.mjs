#!/usr/bin/env node
/**
 * meet-join.mjs — Google Meet auto-join for the desktop-agent container.
 *
 * Launches Chromium under Playwright with media-stream permissions
 * auto-granted, navigates to a Meet URL, sets the agent's display name
 * (when prompted), and clicks "Ask to join" / "Join now".
 *
 * Designed to run inside the desktop-agent container where Xvfb is already
 * supplying a virtual display via the DISPLAY env var. The launched
 * Chromium uses the agent's PulseAudio sink, so anything injected via the
 * voice sidecar (`/v1/inject`) is heard as the agent's microphone by the
 * meeting.
 *
 * Usage:
 *   node /app/meet-join.mjs <meetingUrl> [--name "Agent Name"] [--timeout 60000]
 *
 * Environment:
 *   MEET_DISPLAY_NAME   — fallback display name (default "AgentFarm Agent")
 *   MEET_JOIN_TIMEOUT_MS — overall timeout in ms (default 60000)
 *   PLAYWRIGHT_BROWSER   — "chromium" (default) or "chrome"
 *
 * Exit codes:
 *   0 — joined (or waiting in lobby with request submitted)
 *   1 — argument / configuration error
 *   2 — Chromium launch failure
 *   3 — could not find any join control in time
 *   4 — page navigation / timeout error
 */

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('-')) {
    console.error('usage: meet-join.mjs <meetingUrl> [--name "Display Name"] [--timeout 60000]');
    process.exit(1);
}

const meetingUrl = args[0];
let displayName = process.env.MEET_DISPLAY_NAME || 'AgentFarm Agent';
let timeoutMs = Number(process.env.MEET_JOIN_TIMEOUT_MS || 60000);
for (let i = 1; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) { displayName = args[++i]; }
    else if (args[i] === '--timeout' && args[i + 1]) { timeoutMs = Number(args[++i]); }
}

if (!/^https?:\/\/meet\.google\.com\//.test(meetingUrl)) {
    console.error(`refusing to join non-Meet URL: ${meetingUrl}`);
    process.exit(1);
}

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch (err) {
    console.error('playwright is not installed in this container:', err.message);
    process.exit(2);
}

// Delete stale Chromium profile to prevent "Restore pages?" crash-recovery
// dialog from blocking the name input and join button on subsequent runs.
import { rmSync } from 'fs';
try { rmSync('/tmp/meet-profile', { recursive: true, force: true }); } catch { /* ignore */ }

const browser = await chromium.launchPersistentContext('/tmp/meet-profile', {
    headless: false,
    args: [
        '--use-fake-ui-for-media-stream', // auto-allow mic + camera (real PulseAudio device used)
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Real PulseAudio input via AgentMic null-sink (pulse-setup.sh).
        // Omitting --use-fake-device-for-media-stream lets Chromium pick up
        // the AgentMic.monitor source so injected TTS audio reaches Meet.
        `--window-size=1280,800`,
    ],
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone', 'camera'],
}).catch((err) => {
    console.error('failed to launch Chromium:', err.message);
    process.exit(2);
});

const page = browser.pages()[0] ?? await browser.newPage();
const overall = setTimeout(() => {
    console.error(`meet-join: overall timeout after ${timeoutMs}ms`);
    process.exit(4);
}, timeoutMs).unref();

try {
    console.log(`meet-join: navigating to ${meetingUrl}`);
    // Use 'commit' (fires as soon as navigation starts) so the goto
    // doesn't block waiting for DOMContentLoaded on a heavy SPA like Meet.
    // We'll wait for the pre-join screen element instead.
    await page.goto(meetingUrl, { waitUntil: 'commit', timeout: 30000 }).catch(() => undefined);
    // Wait for the pre-join panel to appear (name input or join button).
    await page.waitForSelector(
        'input[placeholder*="Your name" i], button:has-text("Join now"), button:has-text("Ask to join")',
        { timeout: 60000 },
    ).catch(() => { console.log('meet-join: pre-join selector wait timed out — proceeding anyway'); });

    // Dismiss the "Sign in with your Google account" / "Got it" tooltip
    // that Google Meet shows to unauthenticated guests. It overlays the
    // name input and blocks automation if left open.
    try {
        const gotIt = page.locator('button:has-text("Got it"), [aria-label*="Got it" i]').first();
        if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
            await gotIt.click({ timeout: 3000 }).catch(() => undefined);
            console.log('meet-join: dismissed "Got it" tooltip');
            await page.waitForTimeout(500);
        }
    } catch { /* no tooltip */ }

    // Best-effort: if Meet asks for a display name (guest flow), fill it.
    try {
        const nameInput = page.locator('input[aria-label*="Your name" i], input[placeholder*="Your name" i]').first();
        if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nameInput.fill(displayName);
            console.log(`meet-join: set display name "${displayName}"`);
            await page.waitForTimeout(800);
        }
    } catch { /* not a guest flow */ }

    // Try each candidate join control in order. Meet's button text varies:
    //   - "Join now"           (you're admitted directly)
    //   - "Ask to join"        (host-controlled lobby)
    //   - "Switch here"        (already joined on another tab)
    //   - aria-labels in non-English locales
    // Wait for the button to be enabled (not disabled) before clicking.
    const candidates = [
        'button:has-text("Join now"):not([disabled])',
        'button:has-text("Ask to join"):not([disabled])',
        '[aria-label="Join now"]',
        '[aria-label="Ask to join"]',
        'button:has-text("Switch here")',
    ];

    const deadline = Date.now() + timeoutMs;
    let clicked = false;
    while (Date.now() < deadline && !clicked) {
        for (const selector of candidates) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
                await btn.click({ timeout: 5000 }).catch(() => undefined);
                console.log(`meet-join: clicked "${selector}"`);
                clicked = true;
                break;
            }
        }
        if (!clicked) {
            await page.waitForTimeout(750);
        }
    }

    if (!clicked) {
        console.error('meet-join: no join control found before timeout');
        process.exit(3);
    }

    // Wait for one of: in-meeting toolbar, lobby waiting copy, or denial.
    // Meet's lobby text varies by version/locale — cover multiple variants.
    const lobbyOrJoined = page.locator(
        '[aria-label*="Leave call" i], [data-tooltip*="Leave call" i], ' +
        'div:has-text("Asking to be let in"), div:has-text("waiting for someone"), ' +
        'div:has-text("Waiting for"), div:has-text("let you in"), ' +
        'div:has-text("Someone will let you in"), [data-call-ended]',
    ).first();
    await lobbyOrJoined.waitFor({ timeout: timeoutMs }).catch(() => undefined);

    console.log('meet-join: join request submitted (or in meeting). Keeping browser alive.');
    clearTimeout(overall);
    // Keep this process — and therefore the Playwright-launched Chromium —
    // ALIVE so the bot stays in the meeting/lobby. Calling process.exit() here
    // (the previous behaviour) tore down the browser a split-second after the
    // join click, so the bot never persisted for the host to admit. The
    // desktop-agent tracks this PID and sends SIGTERM on leave.
    const shutdown = async () => {
        try { await browser.close(); } catch { /* ignore */ }
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    await new Promise(() => {}); // hold open until the desktop-agent terminates us
} catch (err) {
    console.error('meet-join: unexpected error:', err.message);
    process.exit(4);
}
