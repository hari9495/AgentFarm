import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { WebhookAdapter } from '../src/adapters/webhook.adapter.js';
import type { NotificationPayload } from '@agentfarm/shared-types';

const PAYLOAD: NotificationPayload = {
    subject: 'Task completed',
    message: 'The agent finished the task successfully.',
    agentId: 'agent-42',
    taskId: 'task-001',
};

describe('WebhookAdapter', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fetchSpy: MockInstance<typeof fetch>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('calls fetch with correct URL and JSON body', () => {
        it('POSTs to the webhookUrl with JSON content-type and full payload', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));

            const adapter = new WebhookAdapter('https://example.com/hook');
            const result = await adapter.send(PAYLOAD);

            expect(fetchSpy).toHaveBeenCalledOnce();
            const [url, init] = fetchSpy.mock.calls[0]!;
            expect(url).toBe('https://example.com/hook');
            expect((init as RequestInit).method).toBe('POST');
            expect((init as RequestInit & { headers: Record<string, string> }).headers['content-type']).toBe('application/json');

            const body = JSON.parse((init as RequestInit).body as string) as NotificationPayload;
            expect(body.subject).toBe(PAYLOAD.subject);
            expect(body.message).toBe(PAYLOAD.message);
            expect(body.agentId).toBe(PAYLOAD.agentId);
            expect(body.taskId).toBe(PAYLOAD.taskId);

            expect(result.success).toBe(true);
            expect(result.adapter).toBe('webhook');
        });
    });

    describe('returns success:false on non-OK HTTP response', () => {
        it('includes the status code in the error message', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

            const adapter = new WebhookAdapter('https://example.com/hook');
            const result = await adapter.send(PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.adapter).toBe('webhook');
            expect(result.error).toMatch(/404/);
        });
    });

    describe('returns success:false on network error', () => {
        it('catches thrown errors and returns error result', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            const adapter = new WebhookAdapter('https://example.com/hook');
            const result = await adapter.send(PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.adapter).toBe('webhook');
            expect(result.error).toMatch(/ECONNREFUSED/);
        });
    });

    describe('sends 500 status as failure', () => {
        it('returns success:false with 500 in error', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }));

            const adapter = new WebhookAdapter('https://example.com/hook');
            const result = await adapter.send(PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/500/);
        });
    });
});
