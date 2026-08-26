import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleRecruiterAction, type RecruiterActionInput } from './recruiter-action-handler.js';

const BASE: Omit<RecruiterActionInput, 'actionType' | 'payload'> = {
    tenantId: 't-1',
    botId: 'b-1',
    taskId: 'task-1',
    workspaceDir: 'task-1',
};

const OUTREACH_PAYLOAD = {
    candidateName: 'Jordan Lee',
    recruiterName: 'Alex Recruiter',
    companyName: 'Acme',
    roleTitle: 'Staff Engineer',
    keyValueProp: 'building the AI-first data platform',
    channel: 'email',
};

describe('workspace_rec_send_outreach', () => {
    it('drafts only by default (no send flag) — never touches a connector', async () => {
        let called = false;
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_send_outreach',
            connectorActionExecuteClient: async () => {
                called = true;
                return { ok: true, statusCode: 200, attempts: 1 };
            },
            payload: { ...OUTREACH_PAYLOAD },
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['sent'], undefined, 'draft path must not report a send');
        assert.ok(typeof parsed['body'] === 'string' && (parsed['body'] as string).length > 0);
        assert.equal(called, false, 'connector must not be called without send=true');
    });

    it('sends through the native email connector when send=true', async () => {
        const originalFetch = globalThis.fetch;
        // Stub the gateway token lookup so gmail resolves as configured.
        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('gmail')) {
                return new Response(JSON.stringify({ credentials: { accessToken: 'a' } }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 });
        }) as typeof globalThis.fetch;

        try {
            const sent: Array<{ connectorType: string; actionType: string; to: unknown }> = [];
            const result = await handleRecruiterAction({
                ...BASE,
                actionType: 'workspace_rec_send_outreach',
                gatewayBaseUrl: 'http://gateway',
                serviceToken: 'tok',
                workspaceId: 'ws-1',
                connectorActionExecuteClient: async (i) => {
                    sent.push({ connectorType: i.connectorType, actionType: i.actionType, to: i.payload['to'] });
                    return { ok: true, statusCode: 200, attempts: 1 };
                },
                payload: { ...OUTREACH_PAYLOAD, send: true, candidateEmail: 'jordan@example.com' },
            });

            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.equal(parsed['sent'], true);
            assert.equal(parsed['via'], 'gmail');
            assert.deepEqual(sent, [{ connectorType: 'gmail', actionType: 'send_email', to: 'jordan@example.com' }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('requires candidateEmail when send=true', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_send_outreach',
            connectorActionExecuteClient: async () => ({ ok: true, statusCode: 200, attempts: 1 }),
            payload: { ...OUTREACH_PAYLOAD, send: true },
        });
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('candidateEmail'), `expected candidateEmail mention, got: ${result.output}`);
    });

    it('falls back to the draft (with a reason) when send=true but no connector is available', async () => {
        const result = await handleRecruiterAction({
            ...BASE,
            actionType: 'workspace_rec_send_outreach',
            // no connectorActionExecuteClient, no gateway creds → dispatch cannot resolve
            payload: { ...OUTREACH_PAYLOAD, send: true, candidateEmail: 'jordan@example.com' },
        });

        assert.equal(result.ok, true, 'dispatch failure must not lose the composed draft');
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['sent'], false);
        assert.ok(typeof parsed['dispatch_reason'] === 'string');
        assert.ok(typeof parsed['body'] === 'string' && (parsed['body'] as string).length > 0);
    });
});
