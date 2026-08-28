#!/usr/bin/env node
/**
 * teams-join.mjs — Microsoft Teams web join for the desktop-agent container.
 *
 * Joins a Teams meeting via Chromium (web client — no native Teams app
 * required). Works with both the consumer Teams Live URLs and the enterprise
 * meetup-join deep-link format:
 *
 *   https://teams.microsoft.com/l/meetup-join/…
 *   https://teams.live.com/meet/…
 *   https://teams.microsoft.com/meet/…
 *
 * The browser runs on the Xvfb virtual display and uses the PulseAudio
 * AgentMic null-sink so injected TTS audio (via pipecat_sidecar.py) is
 * heard by meeting participants as the agent's microphone input.
 *
 * Usage:
 *   node /app/teams-join.mjs <meetingUrl> [--name "Agent Name"] [--timeout 90000]
 *
 * Environment:
 *   TEAMS_DISPLAY_NAME    — fallback display name (default "AgentFarm Agent")
 *   TEAMS_JOIN_TIMEOUT_MS — overall timeout in ms (default 90000)
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
    console.error('usage: teams-join.mjs <meetingUrl> [--name "Display Name"] [--timeout 90000] [--screen-share]');
    process.exit(1);
}

const meetingUrl = args[0];
let displayName = process.env.TEAMS_DISPLAY_NAME || 'AgentFarm Agent';
let timeoutMs = Number(process.env.TEAMS_JOIN_TIMEOUT_MS || 90000);
let enableScreenShare = false;
for (let i = 1; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) { displayName = args[++i]; }
    else if (args[i] === '--timeout' && args[i + 1]) { timeoutMs = Number(args[++i]); }
    else if (args[i] === '--screen-share') { enableScreenShare = true; }
}

const VALID_TEAMS_ORIGINS = [
    /^https:\/\/teams\.microsoft\.com\//,
    /^https:\/\/teams\.live\.com\//,
];
if (!VALID_TEAMS_ORIGINS.some((re) => re.test(meetingUrl))) {
    console.error(`refusing to join non-Teams URL: ${meetingUrl}`);
    process.exit(1);
}

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch (err) {
    console.error('playwright is not installed in this container:', err.message);
    process.exit(2);
}

import { rmSync } from 'fs';
try { rmSync('/tmp/teams-profile', { recursive: true, force: true }); } catch { /* ignore */ }

const browser = await chromium.launchPersistentContext('/tmp/teams-profile', {
    headless: false,
    args: [
        '--use-fake-ui-for-media-stream', // auto-allow mic + camera (real PulseAudio device used)
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Real PulseAudio input via AgentMic null-sink (pulse-setup.sh).
        '--window-size=1280,800',
        // Teams web requires a real user-agent; avoid "browser not supported" page.
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Auto-approve the getDisplayMedia() screen-picker when screen share is triggered.
        '--auto-select-desktop-capture-source=Entire screen',
    ],
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone', 'camera'],
}).catch((err) => {
    console.error('failed to launch Chromium:', err.message);
    process.exit(2);
});

const page = browser.pages()[0] ?? await browser.newPage();
const overall = setTimeout(() => {
    console.error(`teams-join: overall timeout after ${timeoutMs}ms`);
    process.exit(4);
}, timeoutMs).unref();

console.log(`teams-join: navigating to ${meetingUrl}`);
await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch((err) => {
    console.error('navigation failed:', err.message);
    process.exit(4);
});

// Teams often shows a redirect page prompting to open the Teams app.
// Click "Continue on this browser" to stay in the web client.
try {
    const continueBtn = page.locator([
        'text="Continue on this browser"',
        'text="Use the web app instead"',
        '[data-tid="joinOnWeb"]',
        'a[href*="launchInBrowser"]',
    ].join(','));
    await continueBtn.first().click({ timeout: 10_000 });
    console.log('teams-join: clicked "Continue on this browser"');
} catch {
    // Not present — already in the web client.
}

// Guest flow: Teams prompts for a display name.
// Try common selectors used across Teams consumer + enterprise versions.
try {
    const nameField = page.locator([
        'input[placeholder*="name" i]',
        'input[aria-label*="name" i]',
        '#username',
        '[data-tid="prejoin-display-name-input"]',
    ].join(','));
    const field = nameField.first();
    await field.waitFor({ state: 'visible', timeout: 15_000 });
    await field.fill(displayName);
    console.log(`teams-join: filled display name "${displayName}"`);
} catch {
    console.log('teams-join: no name field found (may already be signed in)');
}

// Helper: dismiss the "Are you sure you don't want audio or video?" modal that
// Teams Light shows when it detects no camera/mic. This can appear before OR
// after clicking the Join button, so we call it in both places.
// Returns 'joined' if the modal's own "Join now" was clicked (i.e. we're in),
// 'dismissed' if "Continue without" was clicked (back to pre-join screen),
// or null if no modal was present.
async function dismissNoAvModal() {
    // Search page-wide — Teams Light does not use role="dialog" for this overlay.
    try {
        // Try the affirmative button first if it appears to be scoped inside a modal
        // (i.e. there's also a "Continue without" button on page).
        const continueBtn = page.locator('button').filter({ hasText: /continue without audio or video/i }).first();
        if (await continueBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await continueBtn.click();
            console.log('teams-join: dismissed no-audio/video overlay via "Continue without audio or video"');
            return 'dismissed';
        }
    } catch { /* not present */ }
    return null;
}

// Teams Light may show the no-A/V modal immediately on page load.
// If it shows "Join now" we use it directly; if it only shows "Continue without"
// we dismiss and fall through to the pre-join Join button below.
// Small wait gives Teams time to render the overlay.
await page.waitForTimeout(3_000);

// Debug: log all visible button texts to diagnose selector mismatches.
try {
    const btnTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
            .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0)
            .map(b => b.textContent?.trim())
    );
    console.log('teams-join: visible buttons =', JSON.stringify(btnTexts));
} catch { /* non-critical */ }

const earlyResult = await dismissNoAvModal();
if (earlyResult === 'joined') {
    console.log('teams-join: entered meeting via no-audio/video dialog Join now');
} else {
    // Either modal was dismissed (back to pre-join) or no modal — run the normal flow.
    if (earlyResult === 'dismissed') {
        // Give the pre-join screen a moment to settle after the modal is gone.
        await page.waitForTimeout(1_500);
    } else {
        // No modal — turn off camera if present (optional).
        try {
            const cameraToggle = page.locator([
                '[data-tid="toggle-video"]',
                'button[aria-label*="camera" i]',
                'button[aria-label*="video" i]',
            ].join(','));
            const cam = cameraToggle.first();
            if (await cam.isVisible({ timeout: 3_000 })) {
                const label = await cam.getAttribute('aria-label') ?? '';
                if (!label.toLowerCase().includes('off')) {
                    await cam.click();
                    console.log('teams-join: camera turned off');
                }
            }
        } catch { /* optional step */ }
    }

    // Click Join / "Join now" button on the pre-join screen.
    let joined = false;
    const joinAttempts = [
        () => page.locator('[data-tid="prejoin-join-button"]').first().click(),
        () => page.getByRole('button', { name: /^join now$/i }).last().click(),
        () => page.getByRole('button', { name: /^join$/i }).last().click(),
        () => page.locator('button[aria-label*="join" i]').last().click(),
    ];
    for (const attempt of joinAttempts) {
        try {
            await attempt();
            joined = true;
            console.log('teams-join: clicked join button');
            break;
        } catch { /* try next */ }
    }
    if (!joined) {
        console.error('teams-join: could not find any join button');
        process.exit(3);
    }

    // After clicking join, Teams may show the no-A/V confirmation again.
    await dismissNoAvModal();
}

// Wait until admitted (lobby dissolves) or confirm we are in the lobby.
try {
    await page.waitForSelector([
        '[data-tid="call-controls"]',              // main call bar
        '[aria-label*="leave" i]',                 // Leave button
        'button[aria-label*="hang up" i]',
        'text="Someone will let you in soon"',     // lobby holding message
        'text="Waiting for others to join"',
    ].join(','), { timeout: 30_000 });
    console.log('teams-join: in meeting (or waiting in lobby)');
} catch {
    console.log('teams-join: could not confirm meeting entry — continuing anyway');
}

clearTimeout(overall);

// ── Screen share (if requested via --screen-share flag) ───────────────────────
// After joining, press Ctrl+Shift+E to open the Teams share tray.
// Chromium's --auto-select-desktop-capture-source=Entire screen auto-approves
// the getDisplayMedia() picker, so the share starts without user interaction.
if (enableScreenShare) {
    console.log('teams-join: initiating screen share via Ctrl+Shift+E');
    try {
        // Brief settle time so the Teams call controls are fully rendered.
        await page.waitForTimeout(3_000);
        await page.keyboard.press('Control+Shift+E');
        await page.waitForTimeout(1_500);

        // Teams may show a share-type picker (Desktop / Window / PowerPoint).
        // Click the first "Screen" / "Desktop" button if it appears.
        const screenOptionSelectors = [
            'button[aria-label*="Screen" i]',
            'button[aria-label*="Desktop" i]',
            '[data-tid="share-screen-option"]',
            '[data-tid="desktop-share"]',
        ];
        for (const sel of screenOptionSelectors) {
            try {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 2_000 })) {
                    await el.click();
                    console.log(`teams-join: clicked screen option via ${sel}`);
                    break;
                }
            } catch { /* try next */ }
        }
        console.log('teams-join: screen share initiated');
    } catch (err) {
        console.warn(`teams-join: screen share initiation failed: ${err.message}`);
        // Non-fatal — the meeting join itself succeeded
    }
}

console.log('teams-join: join request submitted (or in meeting). Keeping browser alive.');
// Explicitly hold this process — and therefore the Playwright-launched Chromium —
// open so the bot persists in the meeting/lobby. Falling off the end can let Node
// exit and tear down the browser (see the meet-join.mjs fix). The desktop-agent
// tracks this PID and sends SIGTERM on leave.
const shutdown = async () => {
    try { await browser.close(); } catch { /* ignore */ }
    process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
await new Promise(() => {}); // hold open until the desktop-agent terminates us
