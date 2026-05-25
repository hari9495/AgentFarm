#!/usr/bin/env node
'use strict';

/**
 * agent-entrypoint.js — Desktop Agent Vision Loop (Node.js)
 *
 * Mirrors services/desktop-agent/app.py in Node.js.
 * Runs inside docker/desktop-agent container after Xvfb + noVNC are up.
 *
 * Vision loop: screenshot → LLM decides actions → xdotool executes → repeat
 *
 * HTTP API (APP_PORT, default 5003):
 *   GET  /health
 *   POST /v1/sessions
 *   GET  /v1/sessions/:id
 *   DELETE /v1/sessions/:id
 *   POST /v1/sessions/:id/task        { goal: string }
 *   GET  /v1/sessions/:id/task        ?screenshot=true  to include last frame
 *   POST /v1/meeting/join             { platform: 'meet'|'teams'|'zoom', url, displayName?, timeout? }
 *
 * Env vars:
 *   DISPLAY             virtual display  (default :99)
 *   APP_PORT            HTTP listen port (default 5003)
 *   NOVNC_PORT          used in streamUrl response (default 6080)
 *   LLM_PROVIDER        anthropic | openai | ollama  (default anthropic)
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY
 *   OLLAMA_URL          (default http://host.docker.internal:11434)
 *   LLM_MODEL           override default model per provider
 *   MAX_VISION_STEPS    max loop iterations per task (default 20)
 *   VISION_LOOP_TIMEOUT seconds before task is timed out (default 300)
 */

const http = require('http');
const https = require('https');
const { parse: parseUrl } = require('url');
const { execFileSync, spawn } = require('child_process');
const { randomUUID } = require('crypto');

// ── Config ───────────────────────────────────────────────────────────────────

const DISPLAY = process.env.DISPLAY ?? ':99';
const APP_PORT = parseInt(process.env.APP_PORT ?? '5003', 10);
const NOVNC_PORT = parseInt(process.env.NOVNC_PORT ?? '6080', 10);
const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase().trim();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434').replace(/\/+$/, '');
const LLM_MODEL = (process.env.LLM_MODEL ?? '').trim();
const MAX_VISION_STEPS = Math.max(1, parseInt(process.env.MAX_VISION_STEPS ?? '20', 10));
const VISION_LOOP_TIMEOUT_MS = Math.max(10_000, parseInt(process.env.VISION_LOOP_TIMEOUT ?? '300', 10) * 1000);
// Optional shared secret for /v1/exec — enforced when set
const DESKTOP_AGENT_TOKEN = (process.env.DESKTOP_AGENT_TOKEN ?? '').trim();

// Default models per provider
const DEFAULT_MODELS = {
    anthropic: 'claude-3-haiku-20240307',
    openai: 'gpt-4o',
    ollama: 'llava',
};

// ── Session store ────────────────────────────────────────────────────────────

/**
 * @typedef {{ action:string, target?:string, value?:string }} DesktopAction
 * @typedef {{ step:number, action:string, target:string, value:string, ok:boolean,
 *             durationMs:number, errorMessage?:string, timestamp:string }} StepRecord
 * @typedef {{ taskId:string, goal:string, status:string, steps:StepRecord[],
 *             result:string|null, lastScreenshot:string|null, startedAt:string }} TaskRecord
 * @typedef {{ sessionId:string, status:string, createdAt:string,
 *             currentTask:TaskRecord|null }} SessionRecord
 */

/** @type {Map<string, SessionRecord>} */
const sessions = new Map();

// ── Utilities ────────────────────────────────────────────────────────────────

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {'info'|'warn'|'error'} level
 * @param {string} msg
 */
function log(level, msg) {
    const prefix = `[desktop-agent] ${level.toUpperCase()}`;
    if (level === 'error') {
        console.error(prefix, msg);
    } else if (level === 'warn') {
        console.warn(prefix, msg);
    } else {
        console.log(prefix, msg);
    }
}

// ── Screenshot ───────────────────────────────────────────────────────────────

/**
 * Take a screenshot of the virtual display.
 * @returns {string|null} base64-encoded PNG, or null on failure
 */
function takeScreenshot() {
    try {
        const buf = execFileSync('scrot', ['--silent', '-'], {
            timeout: 10_000,
            env: { ...process.env, DISPLAY },
            maxBuffer: 20 * 1024 * 1024,
        });
        if (!buf || buf.length === 0) return null;
        return buf.toString('base64');
    } catch (err) {
        log('warn', `screenshot failed: ${err.message}`);
        return null;
    }
}

// ── Action execution ─────────────────────────────────────────────────────────

const XDOTOOL_ENV = { ...process.env, DISPLAY };
const ACTION_TIMEOUT_MS = 5_000;
const TYPE_TIMEOUT_MS = 10_000;

/**
 * Execute a single desktop action via xdotool.
 *
 * @param {DesktopAction} act
 * @returns {{ ok: boolean, durationMs: number, errorMessage?: string }}
 */
function executeAction(act) {
    const t0 = Date.now();
    const action = (act.action ?? '').trim();
    const target = String(act.target ?? '').trim();
    const value = String(act.value ?? '').trim();

    try {
        switch (action) {
            case 'click': {
                const parts = target.split(',');
                if (parts.length !== 2) {
                    throw new Error(`click: target must be 'x,y', got: ${JSON.stringify(target)}`);
                }
                const [x, y] = parts.map((p) => p.trim());
                execFileSync('xdotool', ['mousemove', x, y, 'click', '1'], {
                    env: XDOTOOL_ENV,
                    timeout: ACTION_TIMEOUT_MS,
                });
                break;
            }

            case 'type': {
                const text = value || target;
                if (!text) throw new Error('type: value or target required');
                execFileSync('xdotool', ['type', '--clearmodifiers', '--', text], {
                    env: XDOTOOL_ENV,
                    timeout: TYPE_TIMEOUT_MS,
                });
                break;
            }

            case 'key': {
                if (!target) throw new Error('key: target (key name) required');
                execFileSync('xdotool', ['key', '--clearmodifiers', target], {
                    env: XDOTOOL_ENV,
                    timeout: ACTION_TIMEOUT_MS,
                });
                break;
            }

            case 'scroll': {
                const parts = target.split(',');
                if (parts.length < 2) {
                    throw new Error(`scroll: target must be 'x,y', got: ${JSON.stringify(target)}`);
                }
                const [sx, sy] = parts.map((p) => p.trim());
                const button = value.toLowerCase() === 'up' ? '4' : '5';
                execFileSync('xdotool', ['mousemove', sx, sy, 'click', button], {
                    env: XDOTOOL_ENV,
                    timeout: ACTION_TIMEOUT_MS,
                });
                break;
            }

            case 'open_app': {
                const parts = target.split(/\s+/).filter(Boolean);
                if (parts.length === 0) throw new Error('open_app: empty target');
                // Launch detached so the vision loop is not blocked
                const child = spawn(parts[0], parts.slice(1), {
                    env: XDOTOOL_ENV,
                    detached: true,
                    stdio: 'ignore',
                });
                child.unref();
                // Brief synchronous wait so the app has time to appear on screen
                try {
                    execFileSync('sleep', ['2'], { timeout: 3_000 });
                } catch {
                    // sleep might not be available; fall back to nothing
                }
                break;
            }

            case 'done': {
                // Terminal marker — no xdotool call needed
                break;
            }

            default:
                return {
                    ok: false,
                    durationMs: Date.now() - t0,
                    errorMessage: `unknown action: ${JSON.stringify(action)}`,
                };
        }

        return { ok: true, durationMs: Date.now() - t0 };
    } catch (/** @type {any} */ err) {
        return {
            ok: false,
            durationMs: Date.now() - t0,
            errorMessage: err?.message ?? String(err),
        };
    }
}

// ── Prompt templates ─────────────────────────────────────────────────────────

const ACTION_SCHEMA =
    '{"action":"click"|"type"|"key"|"scroll"|"open_app"|"done",' +
    '"target":"x,y coords | key name | app command","value":"text or scroll direction"}';

const FORM_FILLING_RULES = `
Form filling rules (MUST follow):
1. Click the FIRST input field (topmost white/light text box, not the label).
2. {"action":"key","target":"ctrl+a"} then {"action":"key","target":"Delete"} to clear existing text.
3. {"action":"type","value":"<text>"} to type the value.
4. {"action":"key","target":"Tab"} to advance to the NEXT field — do NOT click the next field.
5. For dropdowns: Tab to reach, alt+Down to open, arrow keys to select, Return to confirm.
6. After last field, Tab to Submit then Return, OR click Submit.
Always prefer Tab-key navigation over clicking individual fields once inside the form.
`.trim();

/**
 * Build the LLM prompt for a single vision step.
 *
 * @param {string} goal
 * @param {StepRecord[]} history
 * @returns {string}
 */
function buildPrompt(goal, history) {
    const recent = history.slice(-6);
    let historyNote = '';
    if (recent.length > 0) {
        historyNote = '\nRecent actions (do NOT repeat same action more than twice):\n';
        for (const h of recent) {
            historyNote += `  step ${h.step}: ${h.action} target=${JSON.stringify(h.target)} value=${JSON.stringify(h.value)} ok=${h.ok}\n`;
        }
    }

    return [
        'You are a desktop automation agent controlling a real screen via xdotool.',
        `Goal: ${goal}`,
        FORM_FILLING_RULES,
        historyNote,
        'Analyze the screenshot carefully. Return exactly 1-3 JSON actions to advance toward the goal.',
        `Schema per action: ${ACTION_SCHEMA}`,
        'For coordinates: the screenshot is 1280x800. Measure x,y precisely from the image.',
        "Use 'done' with value=<result summary> ONLY when the goal is fully and visibly complete.",
        'Return ONLY a valid JSON array — no markdown, no explanation, no extra text.',
    ].join('\n');
}

// ── Shell command runner (for test tool dispatch) ─────────────────────────────

/**
 * Run a command in the container and return stdout/stderr/exitCode.
 * Used by the /v1/exec endpoint so the agent-runtime can invoke k6,
 * JMeter, Newman, Playwright CLI, etc. without SSH.
 *
 * @param {string[]} cmd
 * @param {string} workDir
 * @param {number} timeoutMs
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, exitCode:number}>}
 */
function runShellCommand(cmd, workDir, timeoutMs) {
    return new Promise((resolve) => {
        const [bin, ...args] = cmd;
        let stdout = '';
        let stderr = '';

        const child = spawn(bin, args, {
            cwd: workDir,
            env: { ...process.env, DISPLAY },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({ ok: false, stdout, stderr: stderr + '\n[desktop-agent] timeout', exitCode: -1 });
        }, timeoutMs);

        child.on('close', (code) => {
            clearTimeout(timer);
            const exitCode = code ?? -1;
            resolve({ ok: exitCode === 0, stdout, stderr, exitCode });
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ ok: false, stdout, stderr: stderr + '\n' + err.message, exitCode: -1 });
        });
    });
}

/**
 * Probe which test tools are installed and return their versions.
 * @returns {Promise<Record<string, string>>}
 */
async function getToolVersions() {
    /** @param {string[]} cmd @returns {Promise<string>} */
    async function probe(cmd) {
        return runShellCommand(cmd, '/tmp', 5_000).then(
            (r) => (r.ok ? r.stdout.trim().split('\n')[0] ?? 'installed' : 'not found'),
        );
    }

    const [k6, jmeter, newman, appium, playwright, chromium, zap] = await Promise.all([
        probe(['k6', 'version']),
        probe(['jmeter', '--version']),
        probe(['newman', '--version']),
        probe(['appium', '--version']),
        probe(['npx', 'playwright', '--version']),
        probe(['chromium-browser', '--version']),
        probe(['zap', '-version']),
    ]);

    return { k6, jmeter, newman, appium, playwright, chromium, zap };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

/**
 * POST a JSON body and return the parsed response body.
 *
 * @param {string} urlStr
 * @param {{ headers?: Record<string,string>, timeoutMs?: number }} opts
 * @param {unknown} body
 * @returns {Promise<unknown>}
 */
function postJson(urlStr, opts, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const parsed = new URL(urlStr);
        const lib = parsed.protocol === 'https:' ? https : http;
        const port = parsed.port
            ? parseInt(parsed.port, 10)
            : parsed.protocol === 'https:' ? 443 : 80;

        const req = lib.request(
            {
                hostname: parsed.hostname,
                port,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload),
                    ...(opts.headers ?? {}),
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(text));
                    } catch {
                        reject(new Error(`non-JSON LLM response: ${text.slice(0, 200)}`));
                    }
                });
            },
        );

        req.on('error', reject);
        req.setTimeout(opts.timeoutMs ?? 30_000, () =>
            req.destroy(new Error('LLM request timed out')),
        );
        req.write(payload);
        req.end();
    });
}

// ── LLM providers ────────────────────────────────────────────────────────────

/**
 * @param {string} screenshotB64
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callAnthropic(screenshotB64, prompt) {
    const model = LLM_MODEL || DEFAULT_MODELS.anthropic;
    const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        {
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            timeoutMs: 30_000,
        },
        {
            model,
            max_tokens: 512,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: { type: 'base64', media_type: 'image/png', data: screenshotB64 },
                        },
                        { type: 'text', text: prompt },
                    ],
                },
            ],
        },
    );
    return data?.content?.[0]?.text ?? '[]';
}

/**
 * @param {string} screenshotB64
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callOpenAi(screenshotB64, prompt) {
    const model = LLM_MODEL || DEFAULT_MODELS.openai;
    const data = await postJson(
        'https://api.openai.com/v1/chat/completions',
        {
            headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
            timeoutMs: 30_000,
        },
        {
            model,
            max_tokens: 512,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:image/png;base64,${screenshotB64}` },
                        },
                        { type: 'text', text: prompt },
                    ],
                },
            ],
        },
    );
    return data?.choices?.[0]?.message?.content ?? '[]';
}

/**
 * Ollama vision API (requires a vision-capable model, e.g. llava).
 *
 * @param {string} screenshotB64
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callOllama(screenshotB64, prompt) {
    const model = LLM_MODEL || DEFAULT_MODELS.ollama;
    const data = await postJson(
        `${OLLAMA_URL}/api/chat`,
        { timeoutMs: 60_000 },
        {
            model,
            stream: false,
            messages: [
                {
                    role: 'user',
                    images: [screenshotB64],
                    content: prompt,
                },
            ],
        },
    );
    return data?.message?.content ?? '[]';
}

/**
 * Route to the configured LLM provider, with automatic fallback.
 *
 * @param {string} screenshotB64
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callLlm(screenshotB64, prompt) {
    if ((LLM_PROVIDER === 'anthropic' || LLM_PROVIDER === 'claude') && ANTHROPIC_API_KEY) {
        return callAnthropic(screenshotB64, prompt);
    }
    if ((LLM_PROVIDER === 'openai' || LLM_PROVIDER === 'gpt') && OPENAI_API_KEY) {
        return callOpenAi(screenshotB64, prompt);
    }
    if (LLM_PROVIDER === 'ollama') {
        return callOllama(screenshotB64, prompt);
    }
    // Auto-detect: use whichever key is present
    if (ANTHROPIC_API_KEY) return callAnthropic(screenshotB64, prompt);
    if (OPENAI_API_KEY) return callOpenAi(screenshotB64, prompt);
    return '[{"action":"done","value":"No LLM configured — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or LLM_PROVIDER=ollama"}]';
}

/**
 * Parse and validate LLM text into an array of desktop actions.
 * Strips markdown fences and limits to 3 actions per step.
 *
 * @param {string} raw
 * @returns {DesktopAction[]}
 */
function parseLlmResponse(raw) {
    let text = raw.trim();
    // Strip ```json ... ``` or ``` ... ``` fences
    if (text.startsWith('```')) {
        const lines = text.split('\n');
        text = lines.length > 2 ? lines.slice(1, -1).join('\n').trim() : '';
    }
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            return [{ action: 'done', value: String(parsed) }];
        }
        return parsed.slice(0, 3);
    } catch {
        log('warn', `LLM response JSON parse failed: ${text.slice(0, 200)}`);
        return [{ action: 'done', value: `parse_error: ${text.slice(0, 200)}` }];
    }
}

// ── Vision loop ───────────────────────────────────────────────────────────────

/**
 * Run the vision loop for a session. Executes asynchronously — do not await
 * at the HTTP handler level.
 *
 * @param {string} sessionId
 * @param {string} goal
 */
async function runVisionLoop(sessionId, goal) {
    const session = sessions.get(sessionId);
    if (!session?.currentTask) return;

    const task = session.currentTask;
    task.status = 'running';
    const deadline = Date.now() + VISION_LOOP_TIMEOUT_MS;

    for (let step = 0; step < MAX_VISION_STEPS; step++) {
        // Deadline check
        if (Date.now() > deadline) {
            task.status = 'timeout';
            task.result = 'Task timed out';
            break;
        }

        // Cancellation check
        if (task.status === 'cancelled') break;

        // 1. Screenshot
        const screenshotB64 = takeScreenshot();
        if (!screenshotB64) {
            task.steps.push({
                step,
                action: 'screenshot',
                target: '',
                value: '',
                ok: false,
                durationMs: 0,
                errorMessage: 'Screenshot failed — display may not be ready',
                timestamp: nowIso(),
            });
            await sleep(1_000);
            continue;
        }

        task.lastScreenshot = screenshotB64;

        // 2. LLM decision
        let actions;
        try {
            const prompt = buildPrompt(goal, task.steps);
            const raw = await callLlm(screenshotB64, prompt);
            actions = parseLlmResponse(raw);
        } catch (err) {
            log('warn', `LLM call failed at step ${step}: ${err.message}`);
            actions = [{ action: 'done', value: `llm_error: ${err.message}` }];
        }

        // 3. Execute actions
        let done = false;
        for (const act of actions) {
            const result = executeAction(act);
            task.steps.push({
                step,
                action: act.action ?? '',
                target: act.target ?? '',
                value: act.value ?? '',
                ...result,
                timestamp: nowIso(),
            });

            if (act.action === 'done') {
                task.status = 'completed';
                task.result = act.value || 'Task completed';
                done = true;
                break;
            }

            await sleep(400);
        }

        if (done) break;
        await sleep(1_000);
    }

    // If loop exhausted without a terminal action
    if (task.status === 'running') {
        task.status = 'completed';
        task.result = 'Max steps reached';
    }

    const sess = sessions.get(sessionId);
    if (sess) sess.status = 'idle';
}

// ── HTTP server ───────────────────────────────────────────────────────────────

/**
 * Read and JSON-parse the request body.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Record<string,unknown>>}
 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send a JSON response.
 *
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(json),
    });
    res.end(json);
}

const server = http.createServer(async (req, res) => {
    const parsed = parseUrl(req.url ?? '/', true);
    const pathname = parsed.pathname ?? '/';
    const method = req.method ?? 'GET';

    try {
        // GET /health
        if (method === 'GET' && pathname === '/health') {
            return send(res, 200, {
                status: 'ok',
                service: 'desktop-agent',
                display: DISPLAY,
                llmProvider: LLM_PROVIDER,
                maxVisionSteps: MAX_VISION_STEPS,
                activeSessions: sessions.size,
            });
        }

        // POST /v1/sessions — create a new session
        if (method === 'POST' && pathname === '/v1/sessions') {
            const id = randomUUID();
            /** @type {SessionRecord} */
            const session = {
                sessionId: id,
                status: 'idle',
                createdAt: nowIso(),
                currentTask: null,
            };
            sessions.set(id, session);
            return send(res, 201, {
                sessionId: id,
                status: 'idle',
                streamUrl: `http://localhost:${NOVNC_PORT}/vnc.html`,
                createdAt: session.createdAt,
            });
        }

        // Routes that require a sessionId
        const sessionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)(\/task)?$/);
        if (sessionMatch) {
            const sessionId = sessionMatch[1];
            const isTaskPath = sessionMatch[2] === '/task';

            // ── GET /v1/sessions/:id ──────────────────────────────────────────────
            if (!isTaskPath && method === 'GET') {
                const sess = sessions.get(sessionId);
                if (!sess) return send(res, 404, { error: 'Session not found' });
                const task = sess.currentTask;
                return send(res, 200, {
                    sessionId: sess.sessionId,
                    status: sess.status,
                    createdAt: sess.createdAt,
                    streamUrl: `http://localhost:${NOVNC_PORT}/vnc.html`,
                    task: task
                        ? {
                            taskId: task.taskId,
                            status: task.status,
                            result: task.result,
                            stepCount: task.steps.length,
                        }
                        : null,
                });
            }

            // ── DELETE /v1/sessions/:id ───────────────────────────────────────────
            if (!isTaskPath && method === 'DELETE') {
                const sess = sessions.get(sessionId);
                if (!sess) return send(res, 404, { error: 'Session not found' });
                if (sess.currentTask) sess.currentTask.status = 'cancelled';
                sessions.delete(sessionId);
                return send(res, 200, { deleted: true });
            }

            // ── POST /v1/sessions/:id/task ────────────────────────────────────────
            if (isTaskPath && method === 'POST') {
                const sess = sessions.get(sessionId);
                if (!sess) return send(res, 404, { error: 'Session not found' });
                if (sess.status === 'busy') {
                    return send(res, 409, { error: 'Session is already running a task' });
                }

                let body;
                try {
                    body = await readBody(req);
                } catch {
                    return send(res, 400, { error: 'Invalid JSON body' });
                }

                const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
                if (!goal) return send(res, 400, { error: "'goal' is required" });

                const taskId = randomUUID();
                /** @type {TaskRecord} */
                const task = {
                    taskId,
                    goal,
                    status: 'queued',
                    steps: [],
                    result: null,
                    lastScreenshot: null,
                    startedAt: nowIso(),
                };

                sess.currentTask = task;
                sess.status = 'busy';

                // Start the vision loop asynchronously — never await here
                runVisionLoop(sessionId, goal).catch((err) => {
                    log('error', `vision loop crash for session ${sessionId}: ${err.message}`);
                    const s = sessions.get(sessionId);
                    if (s?.currentTask) {
                        s.currentTask.status = 'error';
                        s.currentTask.result = `internal_error: ${err.message}`;
                        s.status = 'idle';
                    }
                });

                return send(res, 202, {
                    taskId,
                    sessionId,
                    status: 'queued',
                    startedAt: task.startedAt,
                });
            }

            // ── GET /v1/sessions/:id/task ─────────────────────────────────────────
            if (isTaskPath && method === 'GET') {
                const sess = sessions.get(sessionId);
                if (!sess) return send(res, 404, { error: 'Session not found' });
                const task = sess.currentTask;
                if (!task) return send(res, 404, { error: 'No active task for this session' });

                const includeScreenshot = parsed.query.screenshot === 'true';
                return send(res, 200, {
                    taskId: task.taskId,
                    sessionId,
                    goal: task.goal,
                    status: task.status,
                    result: task.result,
                    stepCount: task.steps.length,
                    // Return last 10 steps to keep payload manageable
                    steps: task.steps.slice(-10),
                    startedAt: task.startedAt,
                    ...(includeScreenshot && task.lastScreenshot
                        ? { screenshot: task.lastScreenshot }
                        : {}),
                });
            }
        }

        // ── GET /v1/tools — list installed test tool versions ─────────────────
        if (method === 'GET' && pathname === '/v1/tools') {
            const tools = await getToolVersions();
            return send(res, 200, { tools });
        }

        // ── POST /v1/exec — run a shell command inside the container ─────────
        // Protected by DESKTOP_AGENT_TOKEN when the env var is set.
        if (method === 'POST' && pathname === '/v1/exec') {
            if (DESKTOP_AGENT_TOKEN) {
                const authHeader = req.headers['authorization'] ?? '';
                const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
                if (provided !== DESKTOP_AGENT_TOKEN) {
                    return send(res, 401, { error: 'Unauthorized' });
                }
            }

            let body;
            try {
                body = await readBody(req);
            } catch {
                return send(res, 400, { error: 'Invalid JSON body' });
            }

            const cmd = Array.isArray(body.cmd) ? body.cmd.map(String) : [];
            if (cmd.length === 0) return send(res, 400, { error: "'cmd' must be a non-empty string array" });

            // Restrict to known safe executables to prevent arbitrary command injection
            const ALLOWED_COMMANDS = new Set([
                'k6', 'jmeter', 'newman', 'appium', 'zap', 'zap.sh',
                'npx', 'node', 'python3', 'mvn', 'gradle',
                'playwright', 'cypress', 'wdio',
            ]);
            const executable = cmd[0];
            const basename = executable.split('/').pop() ?? '';
            if (!ALLOWED_COMMANDS.has(executable) && !ALLOWED_COMMANDS.has(basename)) {
                return send(res, 403, { error: `Command '${executable}' is not in the allowed list` });
            }

            const workDir = typeof body.workDir === 'string' && body.workDir.trim()
                ? body.workDir.trim()
                : '/workspace';
            const timeoutMs = typeof body.timeoutMs === 'number'
                ? Math.min(Math.max(body.timeoutMs, 5_000), 1_800_000)
                : 300_000;

            const result = await runShellCommand(cmd, workDir, timeoutMs);
            return send(res, 200, result);
        }

        // ── POST /v1/meeting/join — platform-specific meeting join ───────────
        // Dispatches to the appropriate Playwright join script based on platform.
        // body: { platform: 'meet'|'teams'|'zoom', url: string, displayName?: string, timeout?: number }
        if (method === 'POST' && pathname === '/v1/meeting/join') {
            let body;
            try {
                body = await readBody(req);
            } catch {
                return send(res, 400, { error: 'Invalid JSON body' });
            }

            const platform = typeof body.platform === 'string' ? body.platform.toLowerCase().trim() : '';
            const meetUrl = typeof body.url === 'string' ? body.url.trim() : '';
            const joinDisplayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
            const joinTimeout = typeof body.timeout === 'number' ? Math.min(Math.max(body.timeout, 10_000), 300_000) : 90_000;

            if (!platform) return send(res, 400, { error: "'platform' is required ('meet', 'teams', 'zoom', or 'webex')" });
            if (!meetUrl) return send(res, 400, { error: "'url' is required" });

            const PLATFORM_SCRIPTS = {
                meet: '/app/meet-join.mjs',
                teams: '/app/teams-join.mjs',
                zoom: '/app/zoom-join.mjs',
                webex: '/app/webex-join.mjs',
            };
            const script = PLATFORM_SCRIPTS[platform];
            if (!script) {
                return send(res, 400, { error: `unsupported platform '${platform}'; must be one of: meet, teams, zoom, webex` });
            }

            const scriptArgs = [script, meetUrl, '--timeout', String(joinTimeout)];
            if (joinDisplayName) scriptArgs.push('--name', joinDisplayName);

            const child = spawn(process.execPath, scriptArgs, {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, DISPLAY },
            });

            child.stdout.on('data', (d) => log('info', `[${platform}-join] ${d.toString().trimEnd()}`));
            child.stderr.on('data', (d) => log('info', `[${platform}-join] ${d.toString().trimEnd()}`));
            child.on('exit', (code) => log('info', `[${platform}-join] exited with code ${code}`));
            child.unref();

            return send(res, 202, {
                ok: true,
                platform,
                url: meetUrl,
                pid: child.pid ?? null,
                message: `${platform} join script launched; check desktop stream at /vnc.html`,
            });
        }

        // 404 fallthrough
        send(res, 404, { error: 'Not found' });
    } catch (err) {
        log('error', `unhandled request error: ${err.message}`);
        send(res, 500, { error: 'Internal server error' });
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(APP_PORT, '0.0.0.0', () => {
    log('info', `HTTP API listening on port ${APP_PORT}`);
    log('info', `LLM provider: ${LLM_PROVIDER}  model: ${LLM_MODEL || '(provider default)'}`);
    log('info', `Display: ${DISPLAY}`);
    log('info', `noVNC stream: http://localhost:${NOVNC_PORT}/vnc.html`);
    log('info', `Max vision steps: ${MAX_VISION_STEPS}  timeout: ${VISION_LOOP_TIMEOUT_MS / 1000}s`);
});

process.on('SIGTERM', () => {
    log('info', 'SIGTERM received — shutting down');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    log('info', 'SIGINT received — shutting down');
    server.close(() => process.exit(0));
});
