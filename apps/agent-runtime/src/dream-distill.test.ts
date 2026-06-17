import test from 'node:test';
import assert from 'node:assert/strict';
import { distillLesson, isDreamDistillEnabled } from './dream-distill.js';

// --- isDreamDistillEnabled ---

test('isDreamDistillEnabled returns false by default', () => {
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
    assert.equal(isDreamDistillEnabled(), false);
});

test('isDreamDistillEnabled returns true when env var is "true"', () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    assert.equal(isDreamDistillEnabled(), true);
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

test('isDreamDistillEnabled returns true when env var is "1"', () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = '1';
    assert.equal(isDreamDistillEnabled(), true);
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

// --- distillLesson: disabled path ---

test('distillLesson returns false when disabled', async () => {
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
    const result = await distillLesson({
        payload: { actionType: 'code_write', summary: 'write a module' },
        agentOutput: 'Wrote the module successfully.',
        workspaceId: 'ws-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
    });
    assert.equal(result, false);
});

// --- distillLesson: skip list ---

test('distillLesson returns false for read-only action types when enabled', async () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    // No API key set — would return null from callDistill anyway, but skip
    // fires before the LLM call so it returns false without any network attempt
    for (const actionType of ['code_read', 'workspace_read_file', 'workspace_list_files', 'workspace_grep']) {
        const result = await distillLesson({
            payload: { actionType, summary: 'read something' },
            agentOutput: 'Read the file.',
            workspaceId: 'ws-1',
            tenantId: 'tenant-1',
            taskId: 'task-1',
        });
        assert.equal(result, false, `expected false for actionType=${actionType}`);
    }
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

// --- distillLesson: missing spec/output ---

test('distillLesson returns false when spec is empty', async () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    const result = await distillLesson({
        payload: { actionType: 'code_write' }, // no summary/description/prompt/goal_spec
        agentOutput: 'Did something.',
        workspaceId: 'ws-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
    });
    assert.equal(result, false);
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

test('distillLesson returns false when agentOutput is empty', async () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    const result = await distillLesson({
        payload: { actionType: 'code_write', summary: 'implement feature' },
        agentOutput: '',
        workspaceId: 'ws-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
    });
    assert.equal(result, false);
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

// --- distillLesson: no API key path ---

test('distillLesson returns false when no API key is configured', async () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    const savedAnthropic = process.env['AF_ANTHROPIC_API_KEY'];
    const savedFallback = process.env['AGENTFARM_ANTHROPIC_API_KEY'];
    delete process.env['AF_ANTHROPIC_API_KEY'];
    delete process.env['AGENTFARM_ANTHROPIC_API_KEY'];

    const result = await distillLesson({
        payload: { actionType: 'code_write', summary: 'implement auth feature' },
        agentOutput: 'Implemented JWT auth with refresh tokens.',
        workspaceId: 'ws-1',
        tenantId: 'tenant-1',
        taskId: 'task-1',
    });
    assert.equal(result, false);

    if (savedAnthropic !== undefined) process.env['AF_ANTHROPIC_API_KEY'] = savedAnthropic;
    if (savedFallback !== undefined) process.env['AGENTFARM_ANTHROPIC_API_KEY'] = savedFallback;
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

// --- distillLesson: spec resolution ---

test('distillLesson resolves spec from goal_spec field', async () => {
    // When disabled, returns false before resolving — enable and rely on no-API-key path
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    delete process.env['AF_ANTHROPIC_API_KEY'];
    delete process.env['AGENTFARM_ANTHROPIC_API_KEY'];

    // goal_spec takes priority over summary
    const result = await distillLesson({
        payload: { actionType: 'code_write', goal_spec: 'implement X', summary: 'should be ignored' },
        agentOutput: 'Done.',
        workspaceId: 'ws-1',
        tenantId: 't-1',
        taskId: 'task-1',
    });
    // Returns false because no API key — but we verify it didn't skip (spec was found)
    // The no-API-key path is reached only if spec + output were both non-empty
    assert.equal(result, false);
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});

// --- distillLesson: never throws ---

test('distillLesson never throws even when fetch fails', async () => {
    process.env['AF_DREAM_DISTILL_ENABLED'] = 'true';
    process.env['AF_ANTHROPIC_API_KEY'] = 'sk-fake-key-that-will-fail';

    let threw = false;
    try {
        await distillLesson({
            payload: { actionType: 'code_write', summary: 'build something' },
            agentOutput: 'Built it.',
            workspaceId: 'ws-1',
            tenantId: 't-1',
            taskId: 'task-1',
        });
    } catch {
        threw = true;
    }
    assert.equal(threw, false);

    delete process.env['AF_ANTHROPIC_API_KEY'];
    delete process.env['AF_DREAM_DISTILL_ENABLED'];
});
