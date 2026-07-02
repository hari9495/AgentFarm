/**
 * FSD hard-fail contract — when the underlying tooling cannot run at all
 * (Playwright missing, script crash), diagnostics actions must FAIL loudly
 * instead of returning a fabricated clean/zero report as success.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handleFsdAction } from './fsd-action-handler.js';

type SubResult = { ok: boolean; output: string; errorOutput?: string };

function makeExecuteAction() {
    const fn = async (actionType: string): Promise<SubResult> => ({ ok: true, output: `stub:${actionType}` });
    return fn;
}

const failingRunCommand = async () => ({
    stdout: '',
    stderr: "node:internal/modules/cjs/loader: Cannot find module 'playwright'",
    exitCode: 1,
});

const throwingRunCommand = async (): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    throw new Error('spawn ENOENT');
};

let origMcpUrl: string | undefined;
before(() => {
    origMcpUrl = process.env['MCP_CHROME_DEVTOOLS_URL'];
    delete process.env['MCP_CHROME_DEVTOOLS_URL'];
});
after(() => {
    if (origMcpUrl === undefined) delete process.env['MCP_CHROME_DEVTOOLS_URL'];
    else process.env['MCP_CHROME_DEVTOOLS_URL'] = origMcpUrl;
});

describe('FSD hard-fail contract', () => {
    it('workspace_fsd_browser_debug fails when the debug script exits non-zero with no report', async () => {
        const result = await handleFsdAction({
            actionType: 'workspace_fsd_browser_debug',
            payload: { target_url: 'http://localhost:3000' },
            workspaceDir: '/tmp',
            executeAction: makeExecuteAction(),
            runCommand: failingRunCommand,
            tenantId: 't1', botId: 'b1', taskId: 'task-1',
        });
        assert.equal(result.ok, false);
        assert.match(result.errorOutput ?? '', /playwright/i);
    });

    it('workspace_fsd_browser_debug fails when the debug script cannot be spawned', async () => {
        const result = await handleFsdAction({
            actionType: 'workspace_fsd_browser_debug',
            payload: { target_url: 'http://localhost:3000' },
            workspaceDir: '/tmp',
            executeAction: makeExecuteAction(),
            runCommand: throwingRunCommand,
            tenantId: 't1', botId: 'b1', taskId: 'task-1',
        });
        assert.equal(result.ok, false);
        assert.match(result.errorOutput ?? '', /ENOENT|script/i);
    });

    it('workspace_fsd_browser_debug still succeeds when the script runs and reports real findings', async () => {
        const reportJson = JSON.stringify({
            consoleErrors: [{ type: 'error', text: 'TypeError: x is undefined', location: { url: 'app.js' } }],
            networkFailures: [],
        });
        const result = await handleFsdAction({
            actionType: 'workspace_fsd_browser_debug',
            payload: { target_url: 'http://localhost:3000' },
            workspaceDir: '/tmp',
            executeAction: makeExecuteAction(),
            runCommand: async () => ({ stdout: reportJson, stderr: '', exitCode: 0 }),
            tenantId: 't1', botId: 'b1', taskId: 'task-1',
        });
        assert.equal(result.ok, true);
        assert.ok(result.output.includes('TypeError'));
    });

    it('workspace_fsd_perf_profile fails when the profiling script exits non-zero with no profile', async () => {
        const result = await handleFsdAction({
            actionType: 'workspace_fsd_perf_profile',
            payload: { target_url: 'http://localhost:3000', force_playwright: true },
            workspaceDir: '/tmp',
            executeAction: makeExecuteAction(),
            runCommand: failingRunCommand,
            tenantId: 't1', botId: 'b1', taskId: 'task-1',
        });
        assert.equal(result.ok, false);
        assert.match(result.errorOutput ?? '', /playwright/i);
    });

    it('workspace_fsd_perf_profile fails when the profiling script cannot be spawned', async () => {
        const result = await handleFsdAction({
            actionType: 'workspace_fsd_perf_profile',
            payload: { target_url: 'http://localhost:3000', force_playwright: true },
            workspaceDir: '/tmp',
            executeAction: makeExecuteAction(),
            runCommand: throwingRunCommand,
            tenantId: 't1', botId: 'b1', taskId: 'task-1',
        });
        assert.equal(result.ok, false);
        assert.match(result.errorOutput ?? '', /ENOENT|script/i);
    });
});
