/**
 * MCP Protocol Client
 *
 * Implements the Model Context Protocol (MCP) JSON-RPC 2.0 wire format for
 * communicating with MCP-compliant tool servers. Handles initialize handshake,
 * tool discovery, and tool invocation with timeout enforcement.
 *
 * Protocol reference: https://modelcontextprotocol.io/specification
 * Protocol version: 2024-11-05
 */

import type { McpTool, McpToolCallResult } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class McpProtocolError extends Error {
    constructor(message: string, public readonly code?: number) {
        super(message);
        this.name = 'McpProtocolError';
    }
}

export class McpToolError extends Error {
    constructor(message: string, public readonly toolName: string) {
        super(message);
        this.name = 'McpToolError';
    }
}

// ---------------------------------------------------------------------------
// Internal JSON-RPC shapes
// ---------------------------------------------------------------------------

interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0';
    id: number;
    result?: T;
    error?: { code: number; message: string; data?: unknown };
}

interface InitializeResult {
    protocolVersion: string;
    serverInfo: { name: string; version: string };
    capabilities?: Record<string, unknown>;
}

interface ListToolsResult {
    tools: McpTool[];
}

// ---------------------------------------------------------------------------
// McpProtocolClient
// ---------------------------------------------------------------------------

export class McpProtocolClient {
    private readonly serverUrl: string;
    private readonly headers: Record<string, string>;
    private readonly timeoutMs: number;

    constructor(serverUrl: string, headers: Record<string, string> = {}) {
        this.serverUrl = serverUrl;
        this.headers = headers;
        this.timeoutMs = (() => {
            const raw = process.env['AGENTFARM_MCP_TIMEOUT_MS'];
            if (raw) {
                const parsed = parseInt(raw, 10);
                if (!isNaN(parsed) && parsed > 0) return parsed;
            }
            return 30_000;
        })();
    }

    /**
     * Perform the MCP initialize handshake.
     * Must be called before any other method per the MCP spec.
     */
    async initialize(): Promise<{ protocolVersion: string; serverInfo: { name: string; version: string } }> {
        const body = {
            jsonrpc: '2.0' as const,
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                clientInfo: { name: 'agentfarm', version: '1.0.0' },
                capabilities: { tools: {} },
            },
        };

        const raw = await this.post<InitializeResult>(body);

        if (
            typeof raw.protocolVersion !== 'string' ||
            typeof raw.serverInfo?.name !== 'string' ||
            typeof raw.serverInfo?.version !== 'string'
        ) {
            throw new McpProtocolError(
                'initialize response missing required fields (protocolVersion, serverInfo.name, serverInfo.version)',
            );
        }

        return {
            protocolVersion: raw.protocolVersion,
            serverInfo: { name: raw.serverInfo.name, version: raw.serverInfo.version },
        };
    }

    /**
     * Retrieve the list of tools exposed by the MCP server.
     */
    async listTools(): Promise<McpTool[]> {
        const body = {
            jsonrpc: '2.0' as const,
            id: 2,
            method: 'tools/list',
            params: {},
        };

        const raw = await this.post<ListToolsResult>(body);

        if (!Array.isArray(raw.tools)) {
            throw new McpProtocolError('tools/list response missing required field "tools" array');
        }

        return raw.tools as McpTool[];
    }

    /**
     * Invoke a tool on the MCP server.
     * Throws McpToolError if the server returns isError: true.
     * Throws McpProtocolError for protocol-level failures.
     * Subject to AGENTFARM_MCP_TIMEOUT_MS timeout.
     */
    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
        const body = {
            jsonrpc: '2.0' as const,
            id: Date.now(),
            method: 'tools/call',
            params: {
                name,
                arguments: args,
            },
        };

        const raw = await this.post<McpToolCallResult>(body);

        if (raw.isError === true) {
            const textContent = Array.isArray(raw.content)
                ? raw.content
                    .filter((c) => c.type === 'text' && typeof c.text === 'string')
                    .map((c) => c.text as string)
                    .join('\n')
                : `Tool '${name}' returned an error`;

            throw new McpToolError(textContent || `Tool '${name}' returned an error`, name);
        }

        return raw;
    }

    /**
     * Lightweight liveness probe. Calls initialize() and returns true on success.
     * Never throws — returns false on any error.
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.initialize();
            return true;
        } catch {
            return false;
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private async post<T>(body: {
        jsonrpc: '2.0';
        id: number;
        method: string;
        params: Record<string, unknown>;
    }): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let response: Response;
        try {
            response = await fetch(this.serverUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...this.headers,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(timer);
            const isAbort =
                err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
            if (isAbort) {
                throw new McpProtocolError(
                    `MCP request to ${this.serverUrl} timed out after ${this.timeoutMs}ms`,
                );
            }
            throw new McpProtocolError(`MCP request to ${this.serverUrl} failed: ${String(err)}`);
        } finally {
            clearTimeout(timer);
        }

        let text: string;
        try {
            text = await response.text();
        } catch (err) {
            throw new McpProtocolError(`Failed to read MCP response body: ${String(err)}`);
        }

        let parsed: JsonRpcResponse<T>;
        try {
            parsed = JSON.parse(text) as JsonRpcResponse<T>;
        } catch {
            throw new McpProtocolError(
                `MCP server returned non-JSON response (status ${response.status}): ${text.slice(0, 200)}`,
            );
        }

        if (parsed.jsonrpc !== '2.0') {
            throw new McpProtocolError(`MCP server response is not JSON-RPC 2.0 (got jsonrpc="${String(parsed.jsonrpc)}")`);
        }

        if (parsed.error) {
            throw new McpProtocolError(
                `MCP server returned error: ${parsed.error.message}`,
                parsed.error.code,
            );
        }

        if (parsed.result === undefined) {
            throw new McpProtocolError('MCP server JSON-RPC response has no "result" field');
        }

        return parsed.result;
    }
}
