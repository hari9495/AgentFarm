import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSseJsonRpc } from '../mcp-protocol-client.js';

describe('parseSseJsonRpc', () => {
    it('parses a single SSE message event', () => {
        const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
        const out = parseSseJsonRpc(body);
        assert.equal(out.id, 1);
        assert.deepEqual(out.result, { ok: true });
    });

    it('returns the last result/error event, ignoring notifications', () => {
        const body =
            'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n' +
            'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n';
        const out = parseSseJsonRpc(body);
        assert.equal(out.id, 2);
        assert.deepEqual(out.result, { tools: [] });
    });

    it('handles multi-line data payloads', () => {
        const body = 'data: {"jsonrpc":"2.0","id":3,\ndata: "result":{"v":5}}\n\n';
        const out = parseSseJsonRpc(body);
        assert.equal(out.id, 3);
        assert.deepEqual(out.result, { v: 5 });
    });

    it('surfaces a JSON-RPC error event', () => {
        const body = 'data: {"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":"nope"}}\n\n';
        const out = parseSseJsonRpc(body);
        assert.equal(out.error?.message, 'nope');
    });

    it('throws when no JSON-RPC result/error is present', () => {
        assert.throws(() => parseSseJsonRpc('event: ping\ndata: {}\n\n'));
    });
});
