import test from 'node:test';
import assert from 'node:assert/strict';
import { McpProtocolClient } from './mcp-protocol-client.js';

const jsonResponse = (obj: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

test('connect() captures mcp-session-id and callTool reuses it across the sequence', async () => {
    const realFetch = globalThis.fetch;
    const sentSessionHeaders: Array<string | null> = [];
    const methods: string[] = [];

    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const body = init?.body ? JSON.parse(String(init.body)) as { method?: string } : {};
        const method = body.method ?? '(none)';
        methods.push(method);
        sentSessionHeaders.push(headers['mcp-session-id'] ?? null);

        if (method === 'initialize') {
            return jsonResponse(
                { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', serverInfo: { name: 's', version: '1' } } },
                { 'mcp-session-id': 'sess-123' },
            );
        }
        return jsonResponse({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'ok' }] } });
    }) as typeof fetch;

    try {
        const client = new McpProtocolClient('http://server');
        await client.connect();
        assert.equal(client.sessionId, 'sess-123', 'session id captured from initialize response header');

        await client.callTool('navigate_page', { url: 'example.com' });
        await client.callTool('evaluate_script', { function: '() => document.title' });

        // initialize was first, with no prior session id; the two tool calls both carried sess-123.
        assert.equal(methods[0], 'initialize');
        assert.equal(sentSessionHeaders[0], null, 'initialize sent before any session id existed');
        const toolCallHeaders = sentSessionHeaders.filter((_, i) => methods[i] === 'tools/call');
        assert.deepEqual(toolCallHeaders, ['sess-123', 'sess-123'], 'both tool calls reused the session id');

        await client.close();
        assert.equal(client.sessionId, null, 'session id cleared on close');
    } finally {
        globalThis.fetch = realFetch;
    }
});
