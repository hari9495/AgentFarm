#!/usr/bin/env node
/**
 * webex-join.mjs — Cisco Webex web-client join for the desktop-agent container.
 *
 * Joins a Webex meeting entirely in-browser without the native Webex desktop
 * app. Works with standard Webex invite URLs:
 *
 *   https://company.webex.com/meet/<user>
 *   https://company.webex.com/webappng/sites/<site>/meeting/download/<id>
 *   https://webex.com/meet/<room>
 *
 * The browser runs on the Xvfb virtual display and uses the PulseAudio
 * AgentMic null-sink so injected TTS audio (via pipecat_sidecar.py) is
 * heard by meeting participants as the agent's microphone input.
 *
 * Usage:
 *   node /app/webex-join.mjs <meetingUrl> [--name "Agent Name"] [--timeout 90000]
 *
 * Environment:
 *   WEBEX_DISPLAY_NAME    — fallback display name (default "AgentFarm Agent")
 *   WEBEX_JOIN_TIMEOUT_MS — overall timeout in ms (default 90000)
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
    console.error('usage: webex-join.mjs <meetingUrl> [--name "Display Name"] [--timeout 90000]');
    process.exit(1);
}

const meetingUrl = args[0];
let displayName = process.env.WEBEX_DISPLAY_NAME || 'AgentFarm Agent';
let timeoutMs = Number(process.env.WEBEX_JOIN_TIMEOUT_MS || 90000);
for (let i = 1; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) { displayName = args[++i]; }
    else if (args[i] === '--timeout' && args[i + 1]) { timeoutMs = Number(args[++i]); }
}

if (!/^https?:\/\/([a-z0-9-]+\.)?webex\.com\//i.test(meetingUrl)) {
    console.error(`refusing to join non-Webex URL: ${meetingUrl}`);
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
try { rmSync('/tmp/webex-profile', { recursive: true, force: true }); } catch { /* ignore */ }

const browser = await chromium.launchPersistentContext('/tmp/webex-profile', {
    headless: false,
    args: [
        '--use-fake-ui-for-media-stream', // auto-allow mic + camera (real PulseAudio device used)
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // Real PulseAudio input via AgentMic null-sink (pulse-setup.sh).
        '--window-size=1280,800',
        // Webex web app checks user-agent; use a normal Chrome string.
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
    viewport: { width: 1280, height: 800 },
    permissions: ['microphone', 'camera'],
}).catch((err) => {
    console.error('failed to launch Chromium:', err.message);
    process.exit(2);
});

const page = browser.pages()[0] ?? await browser.newPage();
const overall = setTimeout(() => {
    console.error(`webex-join: overall timeout after ${timeoutMs}ms`);
    process.exit(4);
}, timeoutMs).unref();

console.log(`webex-join: navigating to ${meetingUrl}`);
await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch((err) => {
    console.error('navigation failed:', err.message);
    process.exit(4);
});

// Webex often prompts to open the native desktop app — click "Join from your
// browser" to stay in the web client instead.
try {
    const browserLink = page.locator([
        'text="Join from your browser"',
        'text="Join from browser"',
        'text="Use web app"',
        'a[href*="joinBrowser"]',
        '[data-cy="join-from-browser"]',
        'button:has-text("Join from your browser")',
    ].join(','));
    await browserLink.first().click({ timeout: 10_000 });
    console.log('webex-join: clicked "Join from your browser"');
    // Give the web app time to load after clicking.
    await page.waitForTimeout(2_000);
} catch {
    // Not shown — already in the web join form, or URL goes directly there.
    console.log('webex-join: no "Join from browser" link — assuming web form is present');
}

// Guest flow: Webex prompts for a display name before the pre-join screen.
try {
    const nameField = page.locator([
        'input[name="name"]',
        'input[placeholder*="name" i]',
        'input[aria-label*="name" i]',
        'input[id*="name" i]',
        '[data-cy="guest-name-input"]',
        '#guest-input-name',
    ].join(','));
    const field = nameField.first();
    await field.waitFor({ state: 'visible', timeout: 12_000 });
    await field.fill(displayName);
    console.log(`webex-join: filled display name "${displayName}"`);
    await page.waitForTimeout(500);
    // Some Webex flows require pressing Enter or clicking a "Next" button
    // after the name to advance to the pre-join screen.
    try {
        const nextBtn = page.locator([
            'button:has-text("Next")',
            'button[type="submit"]',
            '[data-cy="next-btn"]',
        ].join(','));
        if (await nextBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
            await nextBtn.first().click();
            console.log('webex-join: clicked Next after name');
            await page.waitForTimeout(1_000);
        } else {
            await field.press('Enter');
        }
    } catch {
        await field.press('Enter').catch(() => undefined);
    }
} catch {
    console.log('webex-join: no name field found — may already have a name cached');
}

// Pre-join screen: turn off camera to avoid "no camera" warning blocking join.
try {
    const cameraToggle = page.locator([
        'button[aria-label*="camera" i]',
        'button[aria-label*="video" i]',
        '[data-cy="videoToggle"]',
        'button[title*="camera" i]',
    ].join(','));
    const cam = cameraToggle.first();
    if (await cam.isVisible({ timeout: 4_000 }).catch(() => false)) {
        const label = (await cam.getAttribute('aria-label') ?? '').toLowerCase();
        if (!label.includes('off') && !label.includes('stop')) {
            await cam.click();
            console.log('webex-join: camera turned off');
        }
    }
} catch { /* optional */ }

// Click the Join button on the pre-join screen.
const joinSelectors = [
    'button:has-text("Join meeting"):not([disabled])',
    'button:has-text("Join Meeting"):not([disabled])',
    'button:has-text("Join"):not([disabled])',
    '[data-cy="join-btn"]',
    'button[aria-label*="join" i]:not([disabled])',
    'button[type="submit"]:has-text("Join")',
];
let joined = false;
const deadline = Date.now() + timeoutMs;
while (Date.now() < deadline && !joined) {
    for (const sel of joinSelectors) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
                await btn.click({ timeout: 5_000 });
                joined = true;
                console.log(`webex-join: clicked join via "${sel}"`);
                break;
            }
        } catch { /* try next */ }
    }
    if (!joined) {
        await page.waitForTimeout(750);
    }
}

if (!joined) {
    console.error('webex-join: could not find any join button');
    process.exit(3);
}

// Wait for confirmation that we are in the meeting or the waiting room/lobby.
try {
    await page.waitForSelector([
        // Webex in-meeting controls
        '[data-cy="leave-btn"]',
        'button[aria-label*="leave" i]',
        'button[aria-label*="end meeting" i]',
        // Lobby / waiting room messages
        'text="Waiting for the host to start the meeting"',
        'text="Waiting for the host"',
        'text="The host will let you in"',
        'text="Meeting has not started"',
        // Meeting canvas
        '.meeting-container',
        '#meeting-container',
        '[data-cy="meeting-info"]',
    ].join(','), { timeout: 30_000 });
    console.log('webex-join: in meeting (or waiting in lobby)');
} catch {
    console.log('webex-join: could not confirm meeting entry — continuing anyway');
}

clearTimeout(overall);
console.log('webex-join: done');
// Keep the browser open — the desktop-agent process keeps it alive.
