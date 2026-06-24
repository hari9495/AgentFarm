/**
 * H8 — Deploy action depth: prove deploy actions perform REAL execution (not just planning),
 * and that they are HIGH-risk (approval-gated). Uses an injected runCommand to capture the
 * exact commands issued without touching a real cluster.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDevopsAction } from './devops-action-handler.js';
import { HIGH_RISK_ACTIONS } from '../../domain/risk-policy.js';

type RunCall = { args: string[]; cwd: string };

const makeRunCommand = (calls: RunCall[], exitCode = 0) =>
    async (args: string[], cwd: string) => {
        calls.push({ args, cwd });
        return { exitCode, stdout: 'deployment.apps/web configured', stderr: '' };
    };

const baseParams = {
    tenantId: 't1',
    botId: 'bot1',
    taskId: 'task1',
    workspaceDir: '/ws',
    executeAction: async () => ({ ok: true, output: '' }),
};

test('k8s_deploy issues a real `kubectl apply` against the target manifest + namespace', async () => {
    const calls: RunCall[] = [];
    const result = await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_k8s_deploy',
        payload: { manifest_path: 'k8s/deploy.yaml', namespace: 'prod' },
        runCommand: makeRunCommand(calls),
    });

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1, 'exactly one command executed');
    assert.deepEqual(calls[0]?.args, ['kubectl', 'apply', '-f', 'k8s/deploy.yaml', '-n', 'prod']);
    const out = JSON.parse(result.output) as { namespace: string; dry_run: boolean };
    assert.equal(out.namespace, 'prod');
    assert.equal(out.dry_run, false);
});

test('k8s_deploy honours dry_run (server-side change is suppressed)', async () => {
    const calls: RunCall[] = [];
    await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_k8s_deploy',
        payload: { manifest_path: 'k8s/deploy.yaml', namespace: 'default', dry_run: true },
        runCommand: makeRunCommand(calls),
    });
    assert.ok(calls[0]?.args.includes('--dry-run=client'), 'dry_run must add --dry-run=client');
});

test('k8s_deploy reports failure when kubectl exits non-zero (no false success)', async () => {
    const calls: RunCall[] = [];
    const runCommand = async (args: string[], cwd: string) => {
        calls.push({ args, cwd });
        return { exitCode: 1, stdout: '', stderr: 'Error from server (Forbidden)' };
    };
    const result = await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_k8s_deploy',
        payload: { manifest_path: 'k8s/deploy.yaml' },
        runCommand,
    });
    const out = JSON.parse(result.output) as { ok: boolean; summary: string };
    assert.equal(out.ok, false);
    assert.match(out.summary, /failed/i);
});

test('k8s_deploy fails closed when runCommand is unavailable (cannot silently no-op)', async () => {
    const result = await handleDevopsAction({
        ...baseParams,
        actionType: 'workspace_devops_k8s_deploy',
        payload: { manifest_path: 'k8s/deploy.yaml' },
        runCommand: undefined,
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /runCommand not available/);
});

test('deploy actions are HIGH risk (approval-gated, never auto-executed)', () => {
    assert.equal(HIGH_RISK_ACTIONS.has('workspace_devops_k8s_deploy'), true);
    assert.equal(HIGH_RISK_ACTIONS.has('workspace_devops_k8s_rollback'), true);
    assert.equal(HIGH_RISK_ACTIONS.has('workspace_devops_tf_apply'), true);
});
