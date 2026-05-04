import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import {
    getTaskIntelligenceContext,
    recordTaskIntelligence,
} from './task-intelligence-memory.js';

const withMemoryPath = async (suffix: string, callback: () => Promise<void>) => {
    const previous = process.env['AF_TASK_INTELLIGENCE_PATH'];
    const filePath = join(tmpdir(), `agentfarm-task-intelligence-${suffix}-${Date.now()}.json`);
    process.env['AF_TASK_INTELLIGENCE_PATH'] = filePath;

    try {
        await callback();
    } finally {
        if (previous === undefined) {
            delete process.env['AF_TASK_INTELLIGENCE_PATH'];
        } else {
            process.env['AF_TASK_INTELLIGENCE_PATH'] = previous;
        }
        rmSync(filePath, { force: true });
    }
};

test('records trajectory outcomes and retrieves historical hints', async () => {
    await withMemoryPath('trajectory', async () => {
        recordTaskIntelligence({
            workspaceKey: 'ws-1',
            actionType: 'workspace_create_pr',
            riskLevel: 'medium',
            status: 'success',
            payload: { test_command: 'pnpm test' },
        });

        const context = getTaskIntelligenceContext({
            workspaceKey: 'ws-1',
            actionType: 'workspace_create_pr',
        });

        assert.ok(context.trajectoryHints.length > 0);
        assert.match(context.trajectoryHints[0] ?? '', /successes=1/);
    });
});

test('captures workspace conventions from payload commands', async () => {
    await withMemoryPath('conventions', async () => {
        recordTaskIntelligence({
            workspaceKey: 'ws-2',
            actionType: 'workspace_run_ci_checks',
            riskLevel: 'medium',
            status: 'success',
            payload: {
                test_command: 'pnpm --filter @agentfarm/agent-runtime test',
                build_command: 'pnpm build',
                target_files: ['apps/agent-runtime/src/runtime-server.ts'],
            },
        });

        const context = getTaskIntelligenceContext({
            workspaceKey: 'ws-2',
            actionType: 'workspace_run_ci_checks',
        });

        assert.ok(context.conventionHints.some((entry) => entry.includes('pnpm')));
        assert.ok(context.conventionHints.some((entry) => entry.includes('import style')));
    });
});
