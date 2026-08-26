import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleTechnicalWriterAction } from './technical-writer-action-handler.js';

type SubResult = { ok: boolean; output: string; errorOutput?: string };

const MANUAL_PAYLOAD = {
    mode: 'from_sections',
    metadata: { title: 'User Guide', product: 'Acme', version: '1.0', audience: 'end-user' },
    sections: [{ id: 'intro', title: 'Introduction', level: 1, content: 'Welcome to Acme.' }],
};

function baseParams(over: Record<string, unknown> = {}) {
    return {
        actionType: 'workspace_tw_manual' as const,
        tenantId: 't1', botId: 'b1', taskId: 'task-1',
        workspaceDir: '/tmp',
        payload: { ...MANUAL_PAYLOAD },
        ...over,
    } as Parameters<typeof handleTechnicalWriterAction>[0];
}

describe('technical writer — doc publishing', () => {
    it('returns the doc as a draft by default (no publish)', async () => {
        let called = false;
        const result = await handleTechnicalWriterAction(baseParams({
            executeAction: async () => { called = true; return { ok: true, output: '{}' } as SubResult; },
        }));
        assert.equal(result.ok, true);
        assert.ok(result.output.includes('User Guide'));
        assert.equal((result as Record<string, unknown>)['published'], undefined);
        assert.equal(called, false);
    });

    it('publishes the doc to the repo when publish=true with a publish_path', async () => {
        const writes: Array<{ action: string; payload: Record<string, unknown> }> = [];
        const result = await handleTechnicalWriterAction(baseParams({
            payload: { ...MANUAL_PAYLOAD, publish: true, publish_path: 'docs/user-guide.md' },
            executeAction: async (action: string, payload: Record<string, unknown>) => {
                writes.push({ action, payload });
                return { ok: true, output: '{}' } as SubResult;
            },
        }));
        assert.equal(result.ok, true);
        const published = (result as Record<string, unknown>)['published'] as Record<string, unknown>;
        assert.equal(published['published'], true);
        assert.equal(published['via'], 'repo');
        assert.equal(published['path'], 'docs/user-guide.md');
        assert.equal(writes.length, 1);
        assert.equal(writes[0]!.action, 'workspace_write_file');
        assert.equal(writes[0]!.payload['file_path'], 'docs/user-guide.md');
        assert.ok(String(writes[0]!.payload['content']).includes('User Guide'));
    });

    it('reports why nothing was published when publish=true without a path', async () => {
        const result = await handleTechnicalWriterAction(baseParams({
            payload: { ...MANUAL_PAYLOAD, publish: true },
            executeAction: async () => ({ ok: true, output: '{}' } as SubResult),
        }));
        const published = (result as Record<string, unknown>)['published'] as Record<string, unknown>;
        assert.equal(published['published'], false);
        assert.ok(String(published['reason']).includes('publish_path'));
    });

    it('fails safe — a publish failure still returns the generated doc', async () => {
        const result = await handleTechnicalWriterAction(baseParams({
            payload: { ...MANUAL_PAYLOAD, publish: true, publish_path: 'docs/user-guide.md' },
            executeAction: async () => ({ ok: false, output: '', errorOutput: 'write denied' } as SubResult),
        }));
        assert.equal(result.ok, true, 'publish failure must not lose the doc');
        assert.ok(result.output.includes('User Guide'));
        const published = (result as Record<string, unknown>)['published'] as Record<string, unknown>;
        assert.equal(published['published'], false);
        assert.ok(String(published['reason']).includes('write denied'));
    });
});
