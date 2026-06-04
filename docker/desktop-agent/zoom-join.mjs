#!/usr/bin/env node
/**
 * zoom-join.mjs — Zoom web-client join for the desktop-agent container.
 *
 * Joins a Zoom meeting entirely in-browser without the native Zoom desktop
 * app. Works with standard Zoom invite URLs:
 *
 *   https://zoom.us/j/<MEETING_ID>?pwd=…
 *   https://*.zoom.us/j/<MEETING_ID>?pwd=…
 *   https://app.zoom.us/wc/<MEETING_ID>/join
 *
 * Standard `/j/…` links redirect to the Zoom download page — we intercept
 * that redirect and navigate to the Web Client (`/wc/<id>/join`) directly.
 *
 * The browser runs on the Xvfb virtual display and uses the PulseAudio
 * AgentMic null-sink so injected TTS audio (via pipecat_sidecar.py) is
 * heard by meeting participants as the agent's microphone input.
 *
 * Usage:
 *   node /app/zoom-join.mjs <meetingUrl> [--name "Agent Name"] [--timeout 90000]
 *
 * Environment:
 *   ZOOM_DISPLAY_NAME    — fallback display name (default "AgentFarm Agent")
 *   ZOOM_JOIN_TIMEOUT_MS — overall timeout in ms (default 90000)
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
    console.error('usage: zoom-join.mjs <meetingUrl> [--name "Display Name"] [--timeout 90000] [--screen-share]');
    process.exit(1);
}

const rawUrl = args[0];
let displayName = process.env.ZOOM_DISPLAY_NAME || 'AgentFarm Agent';
let timeoutMs = Number(process.env.ZOOM_JOIN_TIMEOUT_MS || 90000);
let enableScreenShare = false;
for (let i = 1; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) { displayName = args[++i]; }
    else if (args[i] === '--timeout' && args[i + 1]) { timeoutMs = Number(args[++i]); }
    else if (args[i] === '--screen-share') { enableScreenShare = true; }
}

if (!/^https?:\/\/([a-z0-9-]+\.)?zoom\.us\//.test(rawUrl)) {
    console.error(`refusing to join non-Zoom URL: ${rawUrl}`);
    process.exit(1);
}

/**
 * Convert a standard Zoom invite URL to its web-client equivalent.
 * https://zoom.us/j/12345?pwd=abc  →  https://app.zoom.us/wc/12345/join?pwd=abc
 */
function toWebClientUrl(url) {
    try {
        const u = new URL(url);
        // Already a web-client URL — leave it alone.
        if (u.hostname === 'app.zoom.us' && u.pathname.startsWith('/wc/')) return url;
        // /j/<meetingId> → web client
        const m = u.pathname.match(/^\/j\/(\d+)/);
        if (m) {
            const meetId = m[1];
            const pwd = u.searchParams.get('pwd');
            const wcUrl = new URL(`https://app.zoom.us/wc/${meetId}/join`);
            if (pwd) wcUrl.searchParams.set('pwd', pwd);
            return wcUrl.toString();
        }
    } catch { /* fall through */ }
    return url;
}

const meetingUrl = toWebClientUrl(rawUrl);
console.log(`zoom-join: web-client URL: ${meetingUrl}`);

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch (err) {
    console.error('playwright is not installed in this container:', err.message);
    process.exit(2);
}

import { rmSync } from 'fs';
try { rmSync('/tmp/zoom-profile', { recursive: true, force: true }); } catch { /* ignore */ }

const browser = await chromium.launchPersistentContext('/tmp/zoom-profile', {
    headless: false,
    args: [
        '--use-fake-ui-for-media-stream', // auto-allow mic + camera (real PulseAudio device used)
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Real PulseAudio input via AgentMic null-sink (pulse-setup.sh).
        '--window-size=1280,800',
        // Zoom web client checks user-agent; use a normal Chrome string.
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
    console.error(`zoom-join: overall timeout after ${timeoutMs}ms`);
    process.exit(4);
}, timeoutMs).unref();

// Intercept the Zoom download-page redirect on /j/... and send us to web client.
await page.route('**', async (route) => {
    const url = route.request().url();
    if (/zoom\.us\/download/.test(url) || /zoom\.us\/j\/\d+/.test(url)) {
        const wc = toWebClientUrl(url);
        if (wc !== url) {
            await route.fulfill({ status: 302, headers: { location: wc } });
            return;
        }
    }
    await route.continue();
});

console.log(`zoom-join: navigating to ${meetingUrl}`);
await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch((err) => {
    console.error('navigation failed:', err.message);
    process.exit(4);
});

// Zoom web client sometimes shows a "Join from Your Browser" link before
// the join form — click it to proceed without the native app.
try {
    const webLink = page.locator([
        'text="Join from Your Browser"',
        'a[href*="wc"]',
        '#joinFromBrowser',
    ].join(','));
    await webLink.first().click({ timeout: 8_000 });
    console.log('zoom-join: clicked "Join from Your Browser"');
} catch { /* already on the web join form */ }

// Enter display name.
try {
    const nameField = page.locator([
        'input[placeholder*="name" i]',
        'input[aria-label*="name" i]',
        '#inputname',
        'input[id*="display" i]',
    ].join(','));
    const field = nameField.first();
    await field.waitFor({ state: 'visible', timeout: 15_000 });
    await field.fill(displayName);
    console.log(`zoom-join: filled display name "${displayName}"`);
} catch {
    console.log('zoom-join: no name field found — may already have a name cached');
}

// Accept terms / checkbox if present.
try {
    const terms = page.locator('input[type="checkbox"]').first();
    if (await terms.isVisible({ timeout: 2_000 })) await terms.check();
} catch { /* optional */ }

// Click the Join button.
const joinSelectors = [
    'button:has-text("Join")',
    '#joinBtn',
    'input[type="submit"][value*="Join" i]',
    'button[aria-label*="join" i]',
];
let joined = false;
for (const sel of joinSelectors) {
    try {
        const btn = page.locator(sel).first();
        await btn.waitFor({ state: 'visible', timeout: 8_000 });
        await btn.click();
        joined = true;
        console.log(`zoom-join: clicked join via "${sel}"`);
        break;
    } catch { /* try next */ }
}
if (!joined) {
    console.error('zoom-join: could not find any join button');
    process.exit(3);
}

// Wait for confirmation that we are in the meeting or the waiting room.
try {
    await page.waitForSelector([
        '#suspension-view-tabpanel',           // main meeting canvas
        '.meeting-app',
        'text="Waiting for the host to start"',
        'text="The host has another meeting"',
        'text="Please wait, the meeting host will let you in soon"',
        'button[aria-label*="leave" i]',
        'button[aria-label*="end" i]',
    ].join(','), { timeout: 30_000 });
    console.log('zoom-join: in meeting (or waiting room)');
} catch {
    console.log('zoom-join: could not confirm meeting entry — continuing anyway');
}

clearTimeout(overall);

// ── Screen share (if requested via --screen-share flag) ───────────────────────
// After joining, use Alt+S to open the Zoom share dialog.
// Chromium's --auto-select-desktop-capture-source=Entire screen auto-approves
// the getDisplayMedia() picker, so the share starts without user interaction.
if (enableScreenShare) {
    console.log('zoom-join: initiating screen share');
    try {
        // Brief settle time so the Zoom meeting controls are fully rendered.
        await page.waitForTimeout(3_000);

        // Try clicking the Share Screen toolbar button first (most reliable).
        const shareSelectors = [
            'button[aria-label*="Share Screen" i]',
            'button[aria-label*="share screen" i]',
            '[class*="share-screen"]',
        ];
        let shareClicked = false;
        for (const sel of shareSelectors) {
            try {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 2_000 })) {
                    await el.click();
                    shareClicked = true;
                    console.log(`zoom-join: clicked share button via ${sel}`);
                    break;
                }
            } catch { /* try next */ }
        }

        // Fallback: keyboard shortcut Alt+S
        if (!shareClicked) {
            await page.keyboard.press('Alt+s');
            console.log('zoom-join: sent Alt+S shortcut for screen share');
        }

        // If a share-type picker appears, click "Screen" or "Entire Screen".
        await page.waitForTimeout(1_500);
        const screenOptionSelectors = [
            'button[aria-label*="Screen" i]',
            'button[aria-label*="Entire Screen" i]',
            '[class*="share-screen-option"]',
        ];
        for (const sel of screenOptionSelectors) {
            try {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 2_000 })) {
                    await el.click();
                    console.log(`zoom-join: selected screen option via ${sel}`);
                    break;
                }
            } catch { /* try next */ }
        }
        console.log('zoom-join: screen share initiated');
    } catch (err) {
        console.warn(`zoom-join: screen share initiation failed: ${err.message}`);
        // Non-fatal — the meeting join itself succeeded
    }
}

console.log('zoom-join: done');
// Keep the browser open — the desktop-agent process keeps it alive.
