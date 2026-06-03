/**
 * BrowserActionRouter
 *
 * Routes browser actions to chrome-devtools-mcp first, then falls back to
 * Playwright if the MCP server is unavailable or returns an error.
 *
 * This keeps the agent functional if chrome-devtools-mcp is decommissioned,
 * restarting, or simply not reachable in a given VM environment.
 *
 * Usage (inside agent-runtime):
 *
 *   const router = new BrowserActionRouter(
 *     client.callTool.bind(client),   // pass null to skip MCP entirely
 *     playwrightContext,               // pass null to skip Playwright fallback
 *   );
 *
 *   const result = await router.execute({ action: 'navigate', url: 'https://...' });
 *   // result.via === 'chrome-devtools-mcp' | 'playwright'
 *
 * Probe before creating the router to decide whether to pass a live client:
 *
 *   const mcpAlive = await BrowserActionRouter.probe(process.env.MCP_CHROME_DEVTOOLS_URL);
 */

import type { BrowserContext } from 'playwright';
import {
    webClick,
    webExtractData,
    webFillForm,
    webLogin,
    webNavigate,
    webReadPage,
} from './web-actions.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Duck-typed MCP callTool function.
 * Matches the signature of McpProtocolClient.callTool — pass
 * `client.callTool.bind(client)` from agent-runtime without needing to import
 * the class here.
 */
export type McpCallFn = (
    tool: string,
    args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

export type BrowserActionInput =
    | { action: 'navigate'; url: string }
    // #1 — accept uid (from take_snapshot) OR text-target for text-match fallback
    | { action: 'click'; target?: string; uid?: string; url?: string }
    | { action: 'fill_form'; url?: string; fields: Record<string, string>; submit?: boolean }
    | { action: 'login'; url: string; username: string; password: string }
    | { action: 'read_page'; url?: string }
    | { action: 'screenshot' }
    | { action: 'extract_data'; target: 'table' | 'list' | 'fields' | 'all'; url?: string }
    // #1 — accessibility-tree snapshot; returns uid-annotated text
    | { action: 'snapshot' }
    // #2 — wait for a page condition before proceeding
    | { action: 'wait'; condition: 'selector' | 'network_idle' | 'load' | 'text'; value?: string; timeout_ms?: number }
    // #3 — fine-grained input controls
    | { action: 'hover'; target?: string; uid?: string; url?: string }
    | { action: 'drag'; source_uid: string; target_uid: string }
    | { action: 'type'; text: string }
    | { action: 'press_key'; key: string }
    | { action: 'upload_file'; uid?: string; selector?: string; file_path: string }
    | { action: 'handle_dialog'; accept: boolean; prompt_text?: string }
    // #4 — performance traces (CDP-native; no Playwright fallback)
    | { action: 'perf_trace_start' }
    | { action: 'perf_trace_stop' }
    | { action: 'perf_trace_analyze' }
    // #5 — device / viewport emulation
    | { action: 'emulate'; device?: string; width?: number; height?: number; mobile?: boolean; user_agent?: string }
    | { action: 'resize'; width: number; height: number }
    // #6 — multi-tab management
    | { action: 'tab_new'; url?: string }
    | { action: 'tab_close' }
    | { action: 'tab_list' }
    | { action: 'tab_select'; page_id: string }
    // #8 — screencast recording (requires ffmpeg; CDP-native)
    | { action: 'screencast_start'; output_path?: string }
    | { action: 'screencast_stop' };

export interface BrowserActionResult {
    ok: boolean;
    output: string;
    reason?: string;
    /** Which backend actually executed the action. */
    via: 'chrome-devtools-mcp' | 'playwright';
}

// ---------------------------------------------------------------------------
// Internal: MCP tool mapping
// ---------------------------------------------------------------------------

/** Per-action MCP tool descriptor. `tool` may be a function for dynamic dispatch. */
type McpMapping = {
    tool: string | ((i: BrowserActionInput) => string);
    args: (i: BrowserActionInput) => Record<string, unknown>;
};

const MCP_TOOL_MAP: Record<BrowserActionInput['action'], McpMapping> = {
    // ── Navigation ──────────────────────────────────────────────────────────
    navigate: {
        tool: 'navigate_page',
        args: (i) => ({ url: (i as { url: string }).url }),
    },

    // ── Click: uid → native CDP click; text → evaluate_script text-match ────
    click: {
        tool: (i) => ('uid' in i && (i as { uid?: string }).uid) ? 'click' : 'evaluate_script',
        args: (i) => {
            const ci = i as { target?: string; uid?: string };
            if (ci.uid) return { uid: ci.uid };
            const sel = JSON.stringify(ci.target ?? '');
            return {
                function: `() => {
                    let el = document.querySelector(${sel});
                    if (!el) {
                        const text = ${JSON.stringify((ci.target ?? '').toLowerCase())};
                        el = [...document.querySelectorAll('button,a,[role="button"]')]
                            .find(e => e.textContent?.trim().toLowerCase().includes(text)) ?? null;
                    }
                    if (!el) return 'element not found: ' + ${sel};
                    el.click();
                    return 'clicked: ' + (el.textContent?.trim() || ${sel});
                }`,
            };
        },
    },

    // ── Form fill ────────────────────────────────────────────────────────────
    fill_form: {
        tool: 'evaluate_script',
        args: (i) => {
            const fi = i as { url?: string; fields: Record<string, string>; submit?: boolean };
            return {
                ...(fi.url ? { url: fi.url } : {}),
                // Each key is tried first as a CSS selector; if nothing is found,
                // falls back to label-text matching — same strategy as webFillForm()
                // so MCP and Playwright paths behave identically for human-readable keys.
                function: `() => {
                    const fields = ${JSON.stringify(fi.fields)};
                    const results = [];
                    for (const [key, value] of Object.entries(fields)) {
                        let el = document.querySelector(key);
                        if (!el) {
                            // label-text fallback: find label whose text contains the key,
                            // then resolve its associated input via 'for' attr or next sibling.
                            const lc = key.toLowerCase();
                            const label = Array.from(document.querySelectorAll('label'))
                                .find(l => l.textContent?.trim().toLowerCase().includes(lc));
                            if (label) {
                                const forId = label.getAttribute('for');
                                el = forId
                                    ? document.getElementById(forId)
                                    : label.querySelector('input,select,textarea') ?? label.nextElementSibling;
                            }
                        }
                        if (!el) { results.push('not found: ' + key); continue; }
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        results.push('filled: ' + key);
                    }
                    ${fi.submit ? `
                    const btn = document.querySelector('[type="submit"],button[type="submit"]');
                    if (btn) { btn.click(); results.push('submitted'); }` : ''}
                    return results;
                }`,
            };
        },
    },

    // ── Login ────────────────────────────────────────────────────────────────
    // NOTE: login is handled specially in execute() via separate fill calls to
    // avoid embedding credentials in evaluate_script source code. This entry is
    // a no-op fallback used only if the special-case is bypassed.
    login: {
        tool: 'evaluate_script',
        args: () => ({ function: '() => ({ skipped: true })' }),
    },

    // ── Read / extract ───────────────────────────────────────────────────────
    read_page: {
        tool: 'evaluate_script',
        args: (i) => ({
            ...((i as { url?: string }).url ? { url: (i as { url?: string }).url } : {}),
            function: '() => document.body.innerText.slice(0, 4000)',
        }),
    },
    screenshot: {
        tool: 'take_screenshot',
        args: () => ({}),
    },
    extract_data: {
        tool: 'evaluate_script',
        args: (i) => {
            const ei = i as { url?: string; target: string };
            return {
                ...(ei.url ? { url: ei.url } : {}),
                function: ei.target === 'table'
                    ? `() => JSON.stringify(Array.from(document.querySelectorAll('table tr')).map(r=>Array.from(r.querySelectorAll('td,th')).map(c=>c.innerText)))`
                    : ei.target === 'list'
                        ? `() => JSON.stringify(Array.from(document.querySelectorAll('li')).map(l=>l.innerText.trim()).filter(Boolean))`
                        : ei.target === 'fields'
                            ? `() => JSON.stringify(Object.fromEntries(Array.from(document.querySelectorAll('label')).map(l=>[l.innerText.trim(),document.getElementById(l.htmlFor||'')?.value??'']).filter(([k])=>k)))`
                            : `() => document.body.innerText.slice(0,4000)`,
            };
        },
    },

    // ── #1 Snapshot ──────────────────────────────────────────────────────────
    snapshot: {
        tool: 'take_snapshot',
        args: () => ({}),
    },

    // ── #2 Wait ──────────────────────────────────────────────────────────────
    wait: {
        tool: 'wait_for',
        args: (i) => {
            const wi = i as { condition: string; value?: string; timeout_ms?: number };
            return {
                ...(wi.value ? { selector: wi.value } : {}),
                ...(wi.timeout_ms ? { timeout: wi.timeout_ms } : {}),
                ...(wi.condition === 'network_idle' ? { waitUntil: 'networkidle' } : {}),
                ...(wi.condition === 'load' ? { waitUntil: 'load' } : {}),
            };
        },
    },

    // ── #3 Fine-grained input ────────────────────────────────────────────────
    hover: {
        tool: (i) => ('uid' in i && (i as { uid?: string }).uid) ? 'hover' : 'evaluate_script',
        args: (i) => {
            const hi = i as { target?: string; uid?: string };
            if (hi.uid) return { uid: hi.uid };
            const sel = JSON.stringify(hi.target ?? '');
            return {
                function: `() => {
                    let el = document.querySelector(${sel});
                    if (!el) {
                        const text = ${JSON.stringify((hi.target ?? '').toLowerCase())};
                        el = [...document.querySelectorAll('*')].find(e => e.textContent?.trim().toLowerCase() === text) ?? null;
                    }
                    if (!el) return 'element not found: ' + ${sel};
                    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    return 'hovered';
                }`,
            };
        },
    },
    drag: {
        tool: 'drag',
        args: (i) => {
            const di = i as { source_uid: string; target_uid: string };
            return { startUid: di.source_uid, endUid: di.target_uid };
        },
    },
    type: {
        tool: 'type_text',
        args: (i) => ({ text: (i as { text: string }).text }),
    },
    press_key: {
        tool: 'press_key',
        args: (i) => ({ key: (i as { key: string }).key }),
    },
    upload_file: {
        tool: 'upload_file',
        args: (i) => {
            const ufi = i as { uid?: string; selector?: string; file_path: string };
            return {
                ...(ufi.uid ? { uid: ufi.uid } : {}),
                ...(ufi.selector ? { selector: ufi.selector } : {}),
                files: [ufi.file_path],
            };
        },
    },
    handle_dialog: {
        tool: 'handle_dialog',
        args: (i) => {
            const hdi = i as { accept: boolean; prompt_text?: string };
            return {
                action: hdi.accept ? 'accept' : 'dismiss',
                ...(hdi.prompt_text !== undefined ? { promptText: hdi.prompt_text } : {}),
            };
        },
    },

    // ── #4 Performance traces ────────────────────────────────────────────────
    perf_trace_start: {
        tool: 'performance_start_trace',
        args: () => ({}),
    },
    perf_trace_stop: {
        tool: 'performance_stop_trace',
        args: () => ({}),
    },
    perf_trace_analyze: {
        tool: 'performance_analyze_insight',
        args: () => ({}),
    },

    // ── #5 Emulation ─────────────────────────────────────────────────────────
    emulate: {
        tool: 'emulate',
        args: (i) => {
            const ei = i as { device?: string; width?: number; height?: number; mobile?: boolean; user_agent?: string };
            return {
                ...(ei.device ? { device: ei.device } : {}),
                ...(ei.width !== undefined ? { width: ei.width } : {}),
                ...(ei.height !== undefined ? { height: ei.height } : {}),
                ...(ei.mobile !== undefined ? { isMobile: ei.mobile } : {}),
                ...(ei.user_agent ? { userAgent: ei.user_agent } : {}),
            };
        },
    },
    resize: {
        tool: 'resize_page',
        args: (i) => {
            const ri = i as { width: number; height: number };
            return { width: ri.width, height: ri.height };
        },
    },

    // ── #6 Multi-tab ─────────────────────────────────────────────────────────
    tab_new: {
        tool: 'new_page',
        args: (i) => ({ ...((i as { url?: string }).url ? { url: (i as { url?: string }).url } : {}) }),
    },
    tab_close: {
        tool: 'close_page',
        args: () => ({}),
    },
    tab_list: {
        tool: 'list_pages',
        args: () => ({}),
    },
    tab_select: {
        tool: 'select_page',
        args: (i) => ({ pageId: (i as { page_id: string }).page_id }),
    },

    // ── #8 Screencast ────────────────────────────────────────────────────────
    screencast_start: {
        tool: 'screencast_start',
        args: (i) => ({ ...((i as { output_path?: string }).output_path ? { outputPath: (i as { output_path?: string }).output_path } : {}) }),
    },
    screencast_stop: {
        tool: 'screencast_stop',
        args: () => ({}),
    },
};

// ---------------------------------------------------------------------------
// BrowserActionRouter
// ---------------------------------------------------------------------------

export class BrowserActionRouter {
    constructor(
        /** MCP callTool function. Pass null to skip MCP and go straight to Playwright. */
        private readonly mcpCall: McpCallFn | null,
        /** Playwright BrowserContext. Pass null if Playwright is unavailable. */
        private readonly playwrightCtx: BrowserContext | null,
    ) { }

    /**
     * Probe whether a chrome-devtools-mcp server is reachable.
     * Sends an MCP initialize request with a short timeout.
     * Returns true if the server responds correctly, false otherwise.
     */
    static async probe(mcpUrl: string, timeoutMs = 3_000): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(mcpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'application/json, text/event-stream',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2024-11-05',
                        clientInfo: { name: 'agentfarm-probe', version: '1.0.0' },
                        capabilities: { tools: {} },
                    },
                }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) return false;
            const json = (await res.json()) as { result?: { protocolVersion?: string } };
            return typeof json.result?.protocolVersion === 'string';
        } catch {
            return false;
        }
    }

    /**
     * Execute a browser action.
     *
     * Strategy:
     *   1. Try chrome-devtools-mcp (if mcpCall is provided).
     *   2. On any error, log a warning and fall back to Playwright.
     *   3. If both are unavailable, throw.
     */
    async execute(input: BrowserActionInput): Promise<BrowserActionResult> {
        // ── Special case: login via separate fill calls ──────────────────────
        // Credentials must NOT be embedded inside an evaluate_script function
        // body — doing so leaks them into MCP debug logs and CDP trace events.
        // Use dedicated fill tool calls so credentials stay as JSON data args.
        if (input.action === 'login' && this.mcpCall !== null) {
            try {
                const li = input as { url: string; username: string; password: string };
                if (li.url) await this.mcpCall('navigate_page', { url: li.url });
                await this.mcpCall('fill', {
                    selector: '[name="username"],[type="email"],[name="email"],[id*="email"],[id*="user"]',
                    value: li.username,
                });
                await this.mcpCall('fill', { selector: '[type="password"]', value: li.password });
                const btnResult = await this.mcpCall('evaluate_script', {
                    function: `() => { const btn = document.querySelector('[type="submit"],button[type="submit"],button'); if (btn) { btn.click(); return 'submitted'; } return 'no submit button'; }`,
                });
                const text = Array.isArray(btnResult.content)
                    ? btnResult.content.filter((c) => c.type === 'text').map((c) => c.text as string).join('\n')
                    : '';
                return { ok: true, output: text, via: 'chrome-devtools-mcp' };
            } catch (err) {
                console.warn(`[BrowserActionRouter] chrome-devtools-mcp login failed, falling back to Playwright. Reason: ${err}`);
            }
        }

        // ── Attempt 1: chrome-devtools-mcp ──────────────────────────────────
        if (this.mcpCall !== null) {
            try {
                const mapping = MCP_TOOL_MAP[input.action];
                const toolName = typeof mapping.tool === 'function' ? mapping.tool(input) : mapping.tool;
                const toolArgs = mapping.args(input);
                const result = await this.mcpCall(toolName, toolArgs);
                const text = Array.isArray(result.content)
                    ? result.content
                        .filter((c) => c.type === 'text' && typeof c.text === 'string')
                        .map((c) => c.text as string)
                        .join('\n')
                    : '';
                return { ok: true, output: text, via: 'chrome-devtools-mcp' };
            } catch (err) {
                console.warn(
                    `[BrowserActionRouter] chrome-devtools-mcp failed for "${input.action}", ` +
                    `falling back to Playwright. Reason: ${err}`,
                );
            }
        }

        // ── Attempt 2: Playwright fallback ──────────────────────────────────
        if (this.playwrightCtx === null) {
            return {
                ok: false,
                output: '',
                reason: `[BrowserActionRouter] No browser backend available for action "${input.action}". ` +
                    'Both chrome-devtools-mcp and Playwright are unavailable.',
                via: 'playwright',
            };
        }

        const playwrightResult = await this._playwrightFallback(input);
        return { ...playwrightResult, via: 'playwright' };
    }

    // ---------------------------------------------------------------------------
    // Private: active-page helper
    // ---------------------------------------------------------------------------

    private async _getActivePage(): Promise<import('playwright').Page | null> {
        const pages = this.playwrightCtx!.pages();
        return pages.length > 0 ? (pages[pages.length - 1] ?? null) : null;
    }

    // ---------------------------------------------------------------------------
    // Private: Playwright dispatch
    // ---------------------------------------------------------------------------

    private async _playwrightFallback(input: BrowserActionInput) {
        const ctx = this.playwrightCtx!;

        switch (input.action) {
            // ── Original 7 actions ────────────────────────────────────────────
            case 'navigate':
                return webNavigate(ctx, { url: input.url });
            case 'click':
                return webClick(ctx, { target: input.target ?? input.uid ?? '', url: input.url });
            case 'fill_form':
                return webFillForm(ctx, { url: input.url, fields: input.fields, submit: input.submit ?? false });
            case 'login':
                return webLogin(ctx, { url: input.url, username: input.username, password: input.password });
            case 'read_page':
                return webReadPage(ctx, { url: input.url });
            case 'extract_data':
                return webExtractData(ctx, { target: input.target, url: input.url });
            case 'screenshot':
                return { ok: false, output: 'unsupported', reason: 'screenshot is only available via chrome-devtools-mcp' };

            // ── #1 Snapshot — DOM accessibility tree (Playwright fallback) ──
            case 'snapshot': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                try {
                    // Build a uid-annotated text tree matching chrome-devtools-mcp format
                    // so callers can parse UIDs regardless of which backend ran.
                    const tree = await page.evaluate(() => {
                        const lines: string[] = [];
                        document.querySelectorAll(
                            'button,a,input,select,textarea,[role],h1,h2,h3,h4,label,summary',
                        ).forEach((el, i) => {
                            const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
                            const name = (
                                el.getAttribute('aria-label') ??
                                (el as HTMLInputElement).placeholder ??
                                el.textContent ?? ''
                            ).trim().replace(/\s+/g, ' ').slice(0, 80);
                            if (name) lines.push(`uid=pw_${i} ${role} "${name}"`);
                        });
                        return lines.join('\n');
                    });
                    return { ok: true, output: tree };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }

            // ── #2 Wait ───────────────────────────────────────────────────────
            case 'wait': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                const timeout = input.timeout_ms ?? 30_000;
                try {
                    if (input.condition === 'selector' && input.value) {
                        await page.waitForSelector(input.value, { timeout });
                    } else if (input.condition === 'network_idle') {
                        await page.waitForLoadState('networkidle', { timeout });
                    } else if (input.condition === 'load') {
                        await page.waitForLoadState('load', { timeout });
                    } else if (input.condition === 'text' && input.value) {
                        await page.waitForFunction(
                            (text) => document.body.innerText.includes(text),
                            input.value,
                            { timeout },
                        );
                    }
                    return { ok: true, output: `waited: ${input.condition}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }

            // ── #3 Fine-grained input ─────────────────────────────────────────
            case 'hover': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                const sel = input.target ?? input.uid ?? '';
                try {
                    await page.hover(sel);
                    return { ok: true, output: `hovered: ${sel}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'drag':
                return { ok: false, output: 'unsupported', reason: 'drag requires chrome-devtools-mcp UID references' };
            case 'type': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                try {
                    await page.keyboard.type(input.text);
                    return { ok: true, output: `typed: ${input.text.slice(0, 40)}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'press_key': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                try {
                    await page.keyboard.press(input.key);
                    return { ok: true, output: `pressed: ${input.key}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'upload_file': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                const sel = input.selector ?? input.uid ?? 'input[type="file"]';
                try {
                    await page.locator(sel).setInputFiles(input.file_path);
                    return { ok: true, output: `uploaded: ${input.file_path}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'handle_dialog': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                try {
                    await new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(() => {
                            page.off('dialog', handler);
                            reject(new Error('handle_dialog: no dialog appeared within 5000ms'));
                        }, 5_000);
                        const handler = async (dialog: import('playwright').Dialog) => {
                            clearTimeout(timer);
                            try {
                                if (input.accept) {
                                    await dialog.accept(input.prompt_text ?? '');
                                } else {
                                    await dialog.dismiss();
                                }
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        };
                        page.once('dialog', handler);
                    });
                    return { ok: true, output: `dialog ${input.accept ? 'accepted' : 'dismissed'}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }

            // ── #4 Performance traces — CDP-only, no Playwright fallback ─────
            case 'perf_trace_start':
            case 'perf_trace_stop':
            case 'perf_trace_analyze':
                return { ok: false, output: 'unsupported', reason: `${input.action} requires chrome-devtools-mcp` };

            // ── #5 Emulation ─────────────────────────────────────────────────
            case 'emulate': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                if (input.device) {
                    return { ok: false, output: 'unsupported', reason: 'device emulation by name requires chrome-devtools-mcp' };
                }
                try {
                    await page.setViewportSize({
                        width: input.width ?? 1280,
                        height: input.height ?? 800,
                    });
                    return { ok: true, output: `emulated: ${input.width ?? 1280}x${input.height ?? 800}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'resize': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                try {
                    await page.setViewportSize({ width: input.width, height: input.height });
                    return { ok: true, output: `resized: ${input.width}x${input.height}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }

            // ── #6 Multi-tab ─────────────────────────────────────────────────
            case 'tab_new': {
                try {
                    const newPage = await ctx.newPage();
                    if (input.url) await newPage.goto(input.url, { waitUntil: 'domcontentloaded' });
                    return { ok: true, output: `tab opened: ${newPage.url()}` };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'tab_close': {
                const page = await this._getActivePage();
                if (!page) return { ok: false, output: '', reason: 'no active page' };
                try {
                    await page.close();
                    return { ok: true, output: 'tab closed' };
                } catch (e) {
                    return { ok: false, output: '', reason: String(e) };
                }
            }
            case 'tab_list': {
                const pages = ctx.pages();
                const list = pages.map((p, i) => ({ index: i, url: p.url(), title: p.url() }));
                return { ok: true, output: JSON.stringify(list, null, 2) };
            }
            case 'tab_select':
                return { ok: false, output: 'unsupported', reason: 'tab_select by page_id requires chrome-devtools-mcp' };

            // ── #8 Screencast — CDP-only ──────────────────────────────────────
            case 'screencast_start':
            case 'screencast_stop':
                return { ok: false, output: 'unsupported', reason: `${input.action} requires chrome-devtools-mcp and ffmpeg` };
        }
    }
}
