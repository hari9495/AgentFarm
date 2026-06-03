/**
 * Smoke tests for workspace_fsd_perf_profile — covers both execution paths:
 *   Path A — chrome-devtools-mcp (when MCP_CHROME_DEVTOOLS_URL is set)
 *   Path B — Playwright CDP script fallback (when MCP absent or force_playwright=true)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handleFsdAction } from './fsd-action-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubResult = { ok: boolean; output: string; errorOutput?: string };

/** Minimal executeAction stub — records calls, returns ok by default. */
function makeExecuteAction(overrides: Record<string, SubResult> = {}) {
    const calls: Array<{ actionType: string; payload: Record<string, unknown> }> = [];
    const fn = async (actionType: string, payload: Record<string, unknown>): Promise<SubResult> => {
        calls.push({ actionType, payload });
        if (overrides[actionType]) return overrides[actionType]!;
        return { ok: true, output: `stub:${actionType}` };
    };
    fn.calls = calls;
    return fn;
}

/** runCommand stub — returns a V8 CPU profile JSON on stdout. */
function makeRunCommand(stdoutJson?: string): (_args: string[], _cwd: string, _timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sampleProfile = JSON.stringify({
        url: 'http://localhost:3000',
        durationMs: 100,
        capturedAt: new Date().toISOString(),
        profile: {
            nodes: [
                {
                    id: 1,
                    callFrame: { functionName: 'hotFunction', scriptId: '1', url: 'app.js', lineNumber: 10, columnNumber: 0 },
                    hitCount: 80,
                },
                {
                    id: 2,
                    callFrame: { functionName: '(idle)', scriptId: '0', url: '', lineNumber: 0, columnNumber: 0 },
                    hitCount: 20,
                },
            ],
            startTime: 0,
            endTime: 100_000,
            samples: Array(100).fill(1),
        },
    });

    return async (_cmd: string[], _dir: string, _timeout?: number) => ({
        stdout: stdoutJson ?? sampleProfile,
        stderr: '',
        exitCode: 0,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let origMcpUrl: string | undefined;

before(() => {
    origMcpUrl = process.env['MCP_CHROME_DEVTOOLS_URL'];
});

after(() => {
    if (origMcpUrl === undefined) {
        delete process.env['MCP_CHROME_DEVTOOLS_URL'];
    } else {
        process.env['MCP_CHROME_DEVTOOLS_URL'] = origMcpUrl;
    }
});

describe('workspace_fsd_perf_profile', () => {

    describe('input validation', () => {
        it('returns error when target_url is missing', async () => {
            const ea = makeExecuteAction();
            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: {},
                workspaceDir: '/tmp',
                executeAction: ea,
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
            });
            assert.equal(result.ok, false);
            assert.match(result.errorOutput ?? '', /target_url is required/);
        });

        it('returns error when MCP absent and runCommand not provided', async () => {
            delete process.env['MCP_CHROME_DEVTOOLS_URL'];
            const ea = makeExecuteAction();
            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: { target_url: 'http://localhost:3000' },
                workspaceDir: '/tmp',
                executeAction: ea,
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
                // no runCommand
            });
            assert.equal(result.ok, false);
            assert.match(result.errorOutput ?? '', /runCommand/i);
        });
    });

    describe('Path A — chrome-devtools-mcp', () => {
        it('calls perf_trace_start, web_navigate, perf_trace_stop, perf_trace_analyze', async () => {
            process.env['MCP_CHROME_DEVTOOLS_URL'] = 'http://localhost:3100/mcp';

            const ea = makeExecuteAction({
                workspace_perf_trace_start: { ok: true, output: '', errorOutput: '' },
                workspace_web_navigate: { ok: true, output: '', errorOutput: '' },
                workspace_perf_trace_stop: { ok: true, output: '{"traceId":"t1"}', errorOutput: '' },
                workspace_perf_trace_analyze: { ok: true, output: '{"insights":"fast"}', errorOutput: '' },
            });

            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: {
                    target_url: 'http://localhost:3000',
                    duration_ms: 10, // minimal duration so test doesn't sleep long
                },
                workspaceDir: '/tmp',
                executeAction: ea,
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['backend'], 'chrome-devtools-mcp');
            assert.equal(parsed['target_url'], 'http://localhost:3000');

            const actionTypes = ea.calls.map(c => c.actionType);
            assert.ok(actionTypes.includes('workspace_perf_trace_start'), 'must call perf_trace_start');
            assert.ok(actionTypes.includes('workspace_web_navigate'), 'must call web_navigate');
            assert.ok(actionTypes.includes('workspace_perf_trace_stop'), 'must call perf_trace_stop');
            assert.ok(actionTypes.includes('workspace_perf_trace_analyze'), 'must call perf_trace_analyze');
        });

        it('falls back to Playwright CDP when MCP trace throws', async () => {
            process.env['MCP_CHROME_DEVTOOLS_URL'] = 'http://localhost:3100/mcp';

            const ea = makeExecuteAction({
                // MCP start throws — simulate MCP being unreachable
                workspace_perf_trace_start: { ok: false, output: '', errorOutput: 'connection refused' },
                workspace_write_file: { ok: true, output: '', errorOutput: '' },
            });

            // Override perf_trace_start to actually throw (not just return ok:false)
            const throwingEa = async (actionType: string, payload: Record<string, unknown>): Promise<SubResult> => {
                if (actionType === 'workspace_perf_trace_start') throw new Error('MCP connection refused');
                return ea(actionType, payload);
            };

            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: { target_url: 'http://localhost:3000', duration_ms: 10 },
                workspaceDir: '/tmp',
                executeAction: throwingEa,
                runCommand: makeRunCommand(),
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
            } as Parameters<typeof handleFsdAction>[0]);

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['backend'], 'playwright-cdp');
        });
    });

    describe('Path B — Playwright CDP fallback', () => {
        it('writes script, runs it, returns hot functions when MCP absent', async () => {
            delete process.env['MCP_CHROME_DEVTOOLS_URL'];

            let writtenScript = '';
            const ea = makeExecuteAction({
                workspace_write_file: { ok: true, output: '', errorOutput: '' },
            });
            const wrappedEa = async (actionType: string, payload: Record<string, unknown>) => {
                if (actionType === 'workspace_write_file') {
                    writtenScript = payload['content'] as string;
                }
                return ea(actionType, payload);
            };

            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: { target_url: 'http://localhost:3000', duration_ms: 100 },
                workspaceDir: '/tmp',
                executeAction: wrappedEa,
                runCommand: makeRunCommand(),
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['backend'], 'playwright-cdp');
            assert.ok(typeof parsed['score'] === 'number', 'must include a score');
            assert.ok(Array.isArray(parsed['hot_functions']), 'must include hot_functions');
            assert.ok(parsed['hot_fn_count'] as number > 0, 'must have at least 1 hot function');
            assert.ok(writtenScript.includes('Profiler.enable'), 'script must use CDP Profiler domain');
        });

        it('force_playwright=true skips MCP even when URL is set', async () => {
            process.env['MCP_CHROME_DEVTOOLS_URL'] = 'http://localhost:3100/mcp';

            const ea = makeExecuteAction({
                workspace_write_file: { ok: true, output: '', errorOutput: '' },
            });

            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: {
                    target_url: 'http://localhost:3000',
                    duration_ms: 100,
                    force_playwright: true,
                },
                workspaceDir: '/tmp',
                executeAction: ea,
                runCommand: makeRunCommand(),
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['backend'], 'playwright-cdp');
            // perf_trace_start must NOT have been called
            const calledTypes = ea.calls.map(c => c.actionType);
            assert.ok(!calledTypes.includes('workspace_perf_trace_start'), 'must not call MCP when force_playwright=true');
        });

        it('handles script run failure gracefully', async () => {
            delete process.env['MCP_CHROME_DEVTOOLS_URL'];

            const ea = makeExecuteAction({
                workspace_write_file: { ok: true, output: '', errorOutput: '' },
            });

            const failingRunCommand = async () => { throw new Error('playwright not installed'); };

            const result = await handleFsdAction({
                actionType: 'workspace_fsd_perf_profile',
                payload: { target_url: 'http://localhost:3000', duration_ms: 100 },
                workspaceDir: '/tmp',
                executeAction: ea,
                runCommand: failingRunCommand,
                tenantId: 't1', botId: 'b1', taskId: 'task-1',
            });

            // Should still return ok:true with a degraded summary (not crash)
            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['score'], 0);
            assert.match(String(parsed['summary']), /playwright not installed/i);
        });
    });
});
