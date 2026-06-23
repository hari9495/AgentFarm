import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { McpServerInfo } from '@agentfarm/shared-types';
import { formatMcpToolCatalog } from '../mcp-registry-client.js';

const server = (over: Partial<McpServerInfo> = {}): McpServerInfo => ({
    serverId: 's1',
    name: 'echo',
    url: 'http://host.docker.internal:3199',
    protocolVersion: '2024-11-05',
    healthy: true,
    lastHealthCheck: new Date().toISOString(),
    tools: [
        {
            name: 'echo',
            description: 'Echoes a message',
            inputSchema: { type: 'object', properties: { message: {} }, required: ['message'] },
        },
    ],
    ...over,
});

describe('formatMcpToolCatalog', () => {
    it('returns empty string when no servers', () => {
        assert.equal(formatMcpToolCatalog([]), '');
    });

    it('returns empty string when servers are unhealthy', () => {
        assert.equal(formatMcpToolCatalog([server({ healthy: false })]), '');
    });

    it('returns empty string when a healthy server exposes no tools', () => {
        assert.equal(formatMcpToolCatalog([server({ tools: [] })]), '');
    });

    it('includes server name, url, tool name, description and the mcp_tool_call contract', () => {
        const out = formatMcpToolCatalog([server()]);
        assert.match(out, /actionType=mcp_tool_call/);
        assert.match(out, /server="echo"/);
        assert.match(out, /url="http:\/\/host\.docker\.internal:3199"/);
        assert.match(out, /tool="echo"/);
        assert.match(out, /Echoes a message/);
    });

    it('marks required args with an asterisk', () => {
        const out = formatMcpToolCatalog([
            server({
                tools: [
                    {
                        name: 'add',
                        description: 'adds',
                        inputSchema: { type: 'object', properties: { a: {}, b: {} }, required: ['a', 'b'] },
                    },
                ],
            }),
        ]);
        assert.match(out, /args: a\*, b\*/);
    });

    it('lists tools from multiple servers', () => {
        const out = formatMcpToolCatalog([
            server({ name: 'echo' }),
            server({ serverId: 's2', name: 'github', url: 'http://mcp-github:3100', tools: [
                { name: 'list_issues', description: 'lists', inputSchema: { type: 'object', properties: {} } },
            ] }),
        ]);
        assert.match(out, /server="echo"/);
        assert.match(out, /server="github"/);
        assert.match(out, /tool="list_issues"/);
    });

    it('truncates and notes omission when over the prompt budget', () => {
        const manyTools = Array.from({ length: 200 }, (_, i) => ({
            name: `tool_${i}`,
            description: 'a fairly long description to consume prompt budget quickly across many tools',
            inputSchema: { type: 'object' as const, properties: { x: {}, y: {} }, required: ['x'] },
        }));
        const out = formatMcpToolCatalog([server({ tools: manyTools })]);
        assert.ok(out.length <= 1600, `catalog should stay near the budget, got ${out.length}`);
        assert.match(out, /additional tools omitted/);
    });
});
