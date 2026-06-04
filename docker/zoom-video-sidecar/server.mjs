#!/usr/bin/env node
/**
 * zoom-video-sidecar — lightweight Node.js orchestration service for Zoom screen share.
 *
 * Provides the same REST surface as docker/teams-media-bot but for Zoom.
 * Instead of managing a custom media protocol, this service delegates all
 * browser-join and screen-capture operations to the desktop-agent container,
 * which already runs Playwright + Chromium + zoom-join.mjs.
 *
 * ── Session lifecycle ──────────────────────────────────────────────────────────
 *
 *   1. POST /v1/sessions/join
 *        → desktop-agent POST /v1/meeting/join { platform: 'zoom', url, screenShare: true }
 *        ← { sessionId, pid }
 *
 *   2. POST /v1/sessions/:id/share/start { hlsUrl }
 *        → desktop-agent POST /v1/screen-share/inject { platform: 'zoom' }
 *           (xdotool triggers the Share button in the running Chromium window;
 *            Chromium's --auto-select-desktop-capture-source auto-approves the picker)
 *        ← { ok, streamUrl }
 *
 *   3. POST /v1/sessions/:id/share/stop
 *        (session marked inactive; FFmpeg lifecycle managed by the caller via
 *         desktop-agent /v1/screen-share/stop — not duplicated here)
 *        ← { ok }
 *
 *   4. POST /v1/sessions/:id/leave
 *        → desktop-agent POST /v1/meeting/leave { pid } if the browser is still running
 *        ← { ok }
 *
 * ── Environment variables ──────────────────────────────────────────────────────
 *   PORT              HTTP listen port          (default 8091)
 *   DESKTOP_AGENT_URL Desktop-agent base URL    (default http://desktop-agent:5003)
 *   SIDECAR_TOKEN     Optional bearer token for auth on inbound requests
 */

'use strict';

import { createServer }   from 'node:http';
import { randomUUID }      from 'node:crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT             = parseInt(process.env.PORT ?? '8091', 10);
const DESKTOP_AGENT    = (process.env.DESKTOP_AGENT_URL ?? 'http://desktop-agent:5003').replace(/\/+$/, '');
const SIDECAR_TOKEN    = (process.env.SIDECAR_TOKEN ?? '').trim();
const REQUEST_TIMEOUT  = 20_000; // ms

// ── Session store ─────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   sessionId:   string,
 *   meetingUrl:  string,
 *   displayName: string | null,
 *   pid:         number | null,
 *   status:      'joining' | 'active' | 'sharing' | 'left',
 *   shareActive: boolean,
 *   joinedAt:    string,
 * }} ZoomSession
 */

/** @type {Map<string, ZoomSession>} */
const sessions = new Map();

// ── Utilities ─────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }

/**
 * POST JSON to `url` and return `{ ok, status, body }`.
 * @param {string} url
 * @param {unknown} payload
 * @returns {Promise<{ ok: boolean, status: number, body: unknown }>}
 */
async function postJson(url, payload) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, body };
    } catch (err) {
        return { ok: false, status: 0, body: { error: err.message } };
    } finally {
        clearTimeout(timer);
    }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Parse JSON request body.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
            catch { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
}

function checkAuth(req) {
    if (!SIDECAR_TOKEN) return true;
    const header = req.headers['authorization'] ?? '';
    return header === `Bearer ${SIDECAR_TOKEN}`;
}

// ── Request handler ───────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url    = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path   = url.pathname;

    try {
        // ── Health ────────────────────────────────────────────────────────────
        if (method === 'GET' && path === '/health') {
            return send(res, 200, {
                status: 'ok',
                service: 'zoom-video-sidecar',
                activeSessions: sessions.size,
                desktopAgent: DESKTOP_AGENT,
            });
        }

        if (!checkAuth(req)) {
            return send(res, 401, { error: 'unauthorized' });
        }

        // ── POST /v1/sessions/join ─────────────────────────────────────────────
        if (method === 'POST' && path === '/v1/sessions/join') {
            let body;
            try { body = await readBody(req); }
            catch { return send(res, 400, { error: 'Invalid JSON body' }); }

            const meetingUrl  = typeof body.meetingUrl  === 'string' ? body.meetingUrl.trim()  : '';
            const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;

            if (!meetingUrl) return send(res, 400, { error: 'meetingUrl is required' });

            // Delegate to desktop-agent browser join with --screen-share flag so
            // Chromium launches with --auto-select-desktop-capture-source pre-set.
            const result = await postJson(`${DESKTOP_AGENT}/v1/meeting/join`, {
                platform: 'zoom',
                url: meetingUrl,
                displayName: displayName ?? undefined,
                screenShare: true,  // primes Chromium for getDisplayMedia() auto-approve
            });

            if (!result.ok) {
                const detail = typeof result.body === 'object' ? JSON.stringify(result.body) : String(result.body);
                console.error(`[zoom-sidecar] join failed (${result.status}): ${detail.slice(0, 200)}`);
                return send(res, 502, { ok: false, error: `desktop-agent join ${result.status}: ${detail.slice(0, 200)}` });
            }

            const data = /** @type {{ pid?: number }} */(result.body);
            const sessionId = randomUUID();
            /** @type {ZoomSession} */
            const session = {
                sessionId,
                meetingUrl,
                displayName,
                pid: typeof data.pid === 'number' ? data.pid : null,
                status: 'joining',
                shareActive: false,
                joinedAt: now(),
            };
            sessions.set(sessionId, session);

            console.log(`[zoom-sidecar] session created: ${sessionId} pid=${session.pid} url=${meetingUrl}`);
            return send(res, 201, { ok: true, sessionId, pid: session.pid, joinedAt: session.joinedAt });
        }

        // ── Routes that need a session ID ─────────────────────────────────────
        const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)(\/\S+)?$/);
        if (!sessionMatch) {
            return send(res, 404, { error: 'not_found', path });
        }

        const sessionId = sessionMatch[1];
        const action    = sessionMatch[2] ?? '';
        const session   = sessions.get(sessionId);

        // ── GET /v1/sessions/:id ──────────────────────────────────────────────
        if (method === 'GET' && action === '') {
            if (!session) return send(res, 404, { error: 'session_not_found' });
            const { sessionId: id, meetingUrl, status, shareActive, joinedAt, pid } = session;
            return send(res, 200, { sessionId: id, meetingUrl, status, shareActive, joinedAt, pid });
        }

        // ── POST /v1/sessions/:id/share/start ────────────────────────────────
        if (method === 'POST' && action === '/share/start') {
            if (!session) return send(res, 404, { error: 'session_not_found' });
            if (session.status === 'left') return send(res, 409, { error: 'session_ended' });

            let body;
            try { body = await readBody(req); }
            catch { return send(res, 400, { error: 'Invalid JSON body' }); }

            const hlsUrl = typeof body.hlsUrl === 'string' ? body.hlsUrl.trim() : '';
            if (!hlsUrl) return send(res, 400, { error: 'hlsUrl is required' });

            // Trigger the in-meeting Share button in the running Chromium window.
            // desktop-agent uses xdotool to focus Chromium and send the Alt+S shortcut;
            // Chromium's --auto-select-desktop-capture-source auto-approves the picker.
            const injectResult = await postJson(`${DESKTOP_AGENT}/v1/screen-share/inject`, {
                platform: 'zoom',
            });

            if (!injectResult.ok) {
                const detail = JSON.stringify(injectResult.body).slice(0, 200);
                console.warn(`[zoom-sidecar] inject failed (${injectResult.status}): ${detail} — share UI trigger skipped`);
                // Non-fatal: FFmpeg HLS stream is already running (caller started it).
                // The xdotool inject is best-effort; the caller can retry.
            }

            session.status      = 'sharing';
            session.shareActive = true;
            console.log(`[zoom-sidecar] share started: ${sessionId} hlsUrl=${hlsUrl}`);
            return send(res, 200, { ok: true, sessionId, streamUrl: hlsUrl });
        }

        // ── POST /v1/sessions/:id/share/stop ─────────────────────────────────
        if (method === 'POST' && action === '/share/stop') {
            if (!session) return send(res, 404, { error: 'session_not_found' });

            session.status      = session.status === 'left' ? 'left' : 'active';
            session.shareActive = false;
            console.log(`[zoom-sidecar] share stopped: ${sessionId}`);
            return send(res, 200, { ok: true, sessionId });
        }

        // ── POST /v1/sessions/:id/leave ───────────────────────────────────────
        if (method === 'POST' && action === '/leave') {
            if (!session) return send(res, 404, { error: 'session_not_found' });

            // Best-effort: ask desktop-agent to leave / kill the Chromium process.
            if (session.pid !== null) {
                await postJson(`${DESKTOP_AGENT}/v1/meeting/leave`, { pid: session.pid })
                    .catch(() => { /* non-fatal */ });
            }

            session.status      = 'left';
            session.shareActive = false;
            sessions.delete(sessionId);
            console.log(`[zoom-sidecar] session left: ${sessionId}`);
            return send(res, 200, { ok: true });
        }

        return send(res, 404, { error: 'not_found', path });

    } catch (err) {
        console.error('[zoom-sidecar] unhandled error:', err);
        send(res, 500, { error: 'internal_error', detail: err.message });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[zoom-sidecar] listening on port ${PORT}`);
    console.log(`[zoom-sidecar] desktop-agent: ${DESKTOP_AGENT}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
