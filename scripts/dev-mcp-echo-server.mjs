/**
 * Minimal MCP server for local E2E testing.
 *
 * Implements the JSON-RPC 2.0 methods the agent-runtime's McpProtocolClient calls:
 *   - initialize     → handshake
 *   - tools/list     → advertise one "echo" tool
 *   - tools/call     → execute the tool
 *
 * Run: node scripts/dev-mcp-echo-server.mjs [port]
 * Default port: 3199
 */

import http from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3199);

const TOOLS = [
    {
        name: 'echo',
        description: 'Echoes back the provided message. Useful for connectivity tests.',
        inputSchema: {
            type: 'object',
            properties: { message: { type: 'string', description: 'Text to echo back' } },
            required: ['message'],
        },
    },
    {
        name: 'add',
        description: 'Adds two numbers and returns the sum.',
        inputSchema: {
            type: 'object',
            properties: { a: { type: 'number' }, b: { type: 'number' } },
            required: ['a', 'b'],
        },
    },
];

const rpcResult = (id, result) => JSON.stringify({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(405).end('Method Not Allowed');
        return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        let msg;
        try {
            msg = JSON.parse(body);
        } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(rpcError(0, -32700, 'Parse error'));
            return;
        }

        const { id, method, params } = msg;
        res.setHeader('content-type', 'application/json');

        switch (method) {
            case 'initialize':
                res.end(
                    rpcResult(id, {
                        protocolVersion: '2024-11-05',
                        serverInfo: { name: 'dev-echo-mcp', version: '1.0.0' },
                        capabilities: { tools: {} },
                    }),
                );
                return;
            case 'tools/list':
                res.end(rpcResult(id, { tools: TOOLS }));
                return;
            case 'tools/call': {
                const name = params?.name;
                const args = params?.arguments ?? {};
                if (name === 'echo') {
                    res.end(rpcResult(id, { content: [{ type: 'text', text: `echo: ${args.message ?? ''}` }] }));
                    return;
                }
                if (name === 'add') {
                    const sum = Number(args.a) + Number(args.b);
                    res.end(rpcResult(id, { content: [{ type: 'text', text: String(sum) }] }));
                    return;
                }
                res.end(rpcResult(id, { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] }));
                return;
            }
            default:
                res.end(rpcError(id, -32601, `Method not found: ${method}`));
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[dev-mcp-echo-server] listening on http://0.0.0.0:${PORT}  (tools: ${TOOLS.map((t) => t.name).join(', ')})`);
});
