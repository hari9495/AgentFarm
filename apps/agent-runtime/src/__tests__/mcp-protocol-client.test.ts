/**
 * Tests for McpProtocolClient, McpProtocolError, McpToolError,
 * and the registry-level discoverMcpTools / invokeMcpTool helpers.
 *
 * Uses node:test with a fetch mock injected via globalThis.
 */

import { describe, test, after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { McpProtocolClient, McpProtocolError, McpToolError } from '../mcp-protocol-client.js';

// ---------------------------------------------------------------------------
// Helpers — minimal fetch mock
// ---------------------------------------------------------------------------

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function makeFetchMock(body: unknown, status = 200): FetchMock {
    return async (_input: RequestInfo | URL, _init?: RequestInit) => {
        const text = JSON.stringify(body);
        return new Response(text, {
            status,
            headers: { 'content-type': 'application/json' },
        });
    };
}

function makeRpcSuccess<T>(id: number, result: T): object {
    return { jsonrpc: '2.0', id, result };
}

function makeRpcError(id: number, code: number, message: string): object {
    return { jsonrpc: '2.0', id, error: { code, message } };
}

// Capture the real globalThis.fetch and restore after each test
let originalFetch: typeof globalThis.fetch;

before(() => {
    originalFetch = globalThis.fetch;
});

after(() => {
    globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// McpProtocolClient tests
// ---------------------------------------------------------------------------

describe('McpProtocolClient', () => {
    const SERVER_URL = 'https://mcp.example.com';

    // -----------------------------------------------------------------------
    // initialize()
    // -----------------------------------------------------------------------
    describe('initialize()', () => {
        test('sends correct JSON-RPC request and returns protocolVersion', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
                capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
                return new Response(
                    JSON.stringify(
                        makeRpcSuccess(1, {
                            protocolVersion: '2024-11-05',
                            serverInfo: { name: 'my-server', version: '1.2.3' },
                            capabilities: { tools: {} },
                        }),
                    ),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                );
            };

            const client = new McpProtocolClient(SERVER_URL);
            const result = await client.initialize();

            assert.equal(result.protocolVersion, '2024-11-05');
            assert.equal(result.serverInfo.name, 'my-server');
            assert.equal(result.serverInfo.version, '1.2.3');

            // Verify the request shape
            assert.equal(capturedBody?.['jsonrpc'], '2.0');
            assert.equal(capturedBody?.['method'], 'initialize');
            assert.equal(capturedBody?.['id'], 1);
            const params = capturedBody?.['params'] as Record<string, unknown>;
            assert.equal(params?.['protocolVersion'], '2024-11-05');
            assert.deepEqual((params?.['clientInfo'] as Record<string, unknown>)?.['name'], 'agentfarm');
        });

        test('throws McpProtocolError on invalid JSON-RPC 2.0 (wrong jsonrpc field)', async () => {
            globalThis.fetch = makeFetchMock({ jsonrpc: '1.0', id: 1, result: {} });

            const client = new McpProtocolClient(SERVER_URL);
            await assert.rejects(
                () => client.initialize(),
                (err: unknown) => {
                    assert.ok(err instanceof McpProtocolError, 'Expected McpProtocolError');
                    return true;
                },
            );
        });

        test('throws McpProtocolError when response missing protocolVersion', async () => {
            globalThis.fetch = makeFetchMock(
                makeRpcSuccess(1, { serverInfo: { name: 'x', version: '1' } }),
            );

            const client = new McpProtocolClient(SERVER_URL);
            await assert.rejects(
                () => client.initialize(),
                (err: unknown) => {
                    assert.ok(err instanceof McpProtocolError);
                    return true;
                },
            );
        });
    });

    // -----------------------------------------------------------------------
    // listTools()
    // -----------------------------------------------------------------------
    describe('listTools()', () => {
        test('returns tools array from server response', async () => {
            const tools = [
                {
                    name: 'read_file',
                    description: 'Reads a file',
                    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
                },
                {
                    name: 'write_file',
                    description: 'Writes a file',
                    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
                },
            ];

            globalThis.fetch = makeFetchMock(makeRpcSuccess(2, { tools }));

            const client = new McpProtocolClient(SERVER_URL);
            const result = await client.listTools();

            assert.equal(result.length, 2);
            assert.equal(result[0]?.name, 'read_file');
            assert.equal(result[1]?.name, 'write_file');
        });

        test('throws McpProtocolError when tools is not an array', async () => {
            globalThis.fetch = makeFetchMock(makeRpcSuccess(2, { tools: 'not-an-array' }));

            const client = new McpProtocolClient(SERVER_URL);
            await assert.rejects(
                () => client.listTools(),
                (err: unknown) => {
                    assert.ok(err instanceof McpProtocolError);
                    assert.ok(err.message.includes('tools'));
                    return true;
                },
            );
        });
    });

    // -----------------------------------------------------------------------
    // callTool()
    // -----------------------------------------------------------------------
    describe('callTool()', () => {
        test('sends correct name and arguments', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
                capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
                return new Response(
                    JSON.stringify(
                        makeRpcSuccess(capturedBody?.['id'] as number, {
                            content: [{ type: 'text', text: 'result output' }],
                            isError: false,
                        }),
                    ),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                );
            };

            const client = new McpProtocolClient(SERVER_URL);
            const result = await client.callTool('my_tool', { arg1: 'hello', arg2: 42 });

            assert.equal(capturedBody?.['method'], 'tools/call');
            const params = capturedBody?.['params'] as Record<string, unknown>;
            assert.equal(params?.['name'], 'my_tool');
            assert.deepEqual(params?.['arguments'], { arg1: 'hello', arg2: 42 });

            assert.equal(result.content[0]?.type, 'text');
            assert.equal(result.content[0]?.text, 'result output');
        });

        test('throws McpToolError when isError: true in response', async () => {
            globalThis.fetch = makeFetchMock(
                makeRpcSuccess(Date.now(), {
                    content: [{ type: 'text', text: 'Tool execution failed: file not found' }],
                    isError: true,
                }),
            );

            const client = new McpProtocolClient(SERVER_URL);
            await assert.rejects(
                () => client.callTool('failing_tool', {}),
                (err: unknown) => {
                    assert.ok(err instanceof McpToolError, 'Expected McpToolError');
                    assert.equal(err.toolName, 'failing_tool');
                    assert.ok(err.message.includes('Tool execution failed'));
                    return true;
                },
            );
        });
    });

    // -----------------------------------------------------------------------
    // timeout
    // -----------------------------------------------------------------------
    describe('callTool() timeout', () => {
        test('times out after AGENTFARM_MCP_TIMEOUT_MS', async () => {
            // Set a very short timeout for this test
            process.env['AGENTFARM_MCP_TIMEOUT_MS'] = '50';

            globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
                // Honour the AbortSignal — simulate a slow server
                const signal = (init as RequestInit & { signal?: AbortSignal })?.signal;
                await new Promise<void>((resolve, reject) => {
                    const t = setTimeout(resolve, 5_000);
                    signal?.addEventListener('abort', () => {
                        clearTimeout(t);
                        reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
                    });
                });
                return new Response('{}', { status: 200 });
            };

            const client = new McpProtocolClient(SERVER_URL);

            await assert.rejects(
                () => client.callTool('slow_tool', {}),
                (err: unknown) => {
                    assert.ok(err instanceof McpProtocolError, `Expected McpProtocolError, got: ${String(err)}`);
                    return true;
                },
            );

            delete process.env['AGENTFARM_MCP_TIMEOUT_MS'];
        });
    });

    // -----------------------------------------------------------------------
    // healthCheck()
    // -----------------------------------------------------------------------
    describe('healthCheck()', () => {
        test('returns false when server is unreachable', async () => {
            globalThis.fetch = async () => {
                throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
            };

            const client = new McpProtocolClient('http://localhost:9999/mcp');
            const result = await client.healthCheck();
            assert.equal(result, false);
        });

        test('never throws — returns false on any error', async () => {
            globalThis.fetch = async () => {
                throw new Error('Unexpected network failure');
            };

            const client = new McpProtocolClient(SERVER_URL);
            // Should not throw
            const result = await client.healthCheck();
            assert.equal(result, false);
        });

        test('returns true when initialize succeeds', async () => {
            globalThis.fetch = makeFetchMock(
                makeRpcSuccess(1, {
                    protocolVersion: '2024-11-05',
                    serverInfo: { name: 'healthy-server', version: '1.0.0' },
                }),
            );

            const client = new McpProtocolClient(SERVER_URL);
            const result = await client.healthCheck();
            assert.equal(result, true);
        });
    });

    // -----------------------------------------------------------------------
    // Protocol error cases
    // -----------------------------------------------------------------------
    describe('McpProtocolError', () => {
        test('invalid JSON response throws McpProtocolError', async () => {
            globalThis.fetch = async () =>
                new Response('this is not json at all', {
                    status: 200,
                    headers: { 'content-type': 'text/plain' },
                });

            const client = new McpProtocolClient(SERVER_URL);
            await assert.rejects(
                () => client.initialize(),
                (err: unknown) => {
                    assert.ok(err instanceof McpProtocolError);
                    return true;
                },
            );
        });

        test('server-level JSON-RPC error propagates as McpProtocolError with code', async () => {
            globalThis.fetch = makeFetchMock(makeRpcError(1, -32601, 'Method not found'));

            const client = new McpProtocolClient(SERVER_URL);
            await assert.rejects(
                () => client.initialize(),
                (err: unknown) => {
                    assert.ok(err instanceof McpProtocolError);
                    assert.equal(err.code, -32601);
                    assert.ok(err.message.includes('Method not found'));
                    return true;
                },
            );
        });
    });
});

// ---------------------------------------------------------------------------
// discoverMcpTools() — tests for the registry-level helper
// ---------------------------------------------------------------------------

describe('discoverMcpTools()', () => {
    test('skips unhealthy servers', async () => {
        // We test by verifying that an unhealthy server (initialize fails) is not in the result.
        // We mock the gateway to return one server, and then make that server's healthCheck fail.

        let callCount = 0;

        globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

            // API gateway call — return one registered server
            if (url.includes('/v1/mcp')) {
                return new Response(
                    JSON.stringify([
                        { id: 'srv1', tenantId: 'tenant1', name: 'broken-server', url: 'http://broken.example.com', isActive: true },
                    ]),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                );
            }

            // MCP server calls — always fail to simulate unhealthy
            callCount++;
            throw new Error('Connection refused');
        };

        process.env['API_GATEWAY_URL'] = 'http://gateway.example.com';

        const { discoverMcpTools } = await import('../mcp-registry-client.js');
        const result = await discoverMcpTools('tenant1', 'http://gateway.example.com', 'token');

        assert.equal(result.length, 0, 'Unhealthy server should be skipped');
        assert.ok(callCount >= 1, 'healthCheck should have been attempted');

        delete process.env['API_GATEWAY_URL'];
    });
});

// ---------------------------------------------------------------------------
// invokeMcpTool() — tests that initialize() is called before tools/call
// ---------------------------------------------------------------------------

describe('invokeMcpTool()', () => {
    test('calls initialize() before callTool()', async () => {
        const methodOrder: string[] = [];

        globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(init?.body as string) as { method: string; id: number; result?: unknown };
            methodOrder.push(body.method);

            if (body.method === 'initialize') {
                return new Response(
                    JSON.stringify(
                        makeRpcSuccess(1, {
                            protocolVersion: '2024-11-05',
                            serverInfo: { name: 'test-server', version: '1.0.0' },
                        }),
                    ),
                    { status: 200 },
                );
            }

            if (body.method === 'tools/call') {
                return new Response(
                    JSON.stringify(
                        makeRpcSuccess(body.id, {
                            content: [{ type: 'text', text: 'tool result' }],
                            isError: false,
                        }),
                    ),
                    { status: 200 },
                );
            }

            return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), { status: 200 });
        };

        const { invokeMcpTool } = await import('../mcp-registry-client.js');
        const result = await invokeMcpTool('https://mcp.example.com', {}, 'my_tool', { x: 1 });

        assert.ok(methodOrder.indexOf('initialize') < methodOrder.indexOf('tools/call'),
            'initialize() must be called before tools/call');
        assert.equal(result.content[0]?.text, 'tool result');
    });
});
