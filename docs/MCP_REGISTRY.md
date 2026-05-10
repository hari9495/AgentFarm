# AgentFarm MCP Registry

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for the Model Context Protocol (MCP) server registry.

---

## Overview

The MCP registry allows tenants to register custom MCP-compatible tool servers. The agent runtime queries registered servers at task time and can invoke their tools alongside built-in actions.

**MCP** (Model Context Protocol) is an open standard for exposing tools to LLMs. AgentFarm acts as an MCP client that discovers and calls tenant-registered MCP servers.

---

## Database Model

### `TenantMcpServer`

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `String` @id | cuid() | |
| `tenantId` | `String` | — | Tenant that owns this server |
| `workspaceId` | `String?` | — | Optional workspace scope; null = available to all workspaces |
| `name` | `String` | — | Display name (unique per tenant) |
| `url` | `String` | — | HTTP endpoint of the MCP server |
| `headers` | `Json?` | — | Additional auth headers (e.g. `{Authorization: "Bearer ..."}`) |
| `isActive` | `Boolean` | `true` | Soft delete — false = deactivated |
| `createdAt` | `DateTime` | — | |
| `updatedAt` | `DateTime` | — | |

**Unique:** `(tenantId, name)` — a tenant cannot register two servers with the same name.

---

## API Routes

**File:** `apps/api-gateway/src/routes/mcp-registry.ts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/mcp` | required | List all active MCP servers for the current tenant |
| `POST` | `/v1/mcp` | required | Register a new MCP server (or reactivate a deactivated one with the same name) |
| `GET` | `/v1/mcp/:id` | required | Get a specific server by ID |
| `PATCH` | `/v1/mcp/:id` | required | Update server URL, headers, or workspace scope |
| `DELETE` | `/v1/mcp/:id` | required | Deactivate server (`isActive = false`) — not a hard delete |

### POST `/v1/mcp` Request Body
```json
{
  "name": "my-custom-tools",
  "url": "https://tools.mycompany.com/mcp",
  "workspaceId": "optional-workspace-id",
  "headers": {
    "Authorization": "Bearer my-mcp-token"
  }
}
```

### GET `/v1/mcp` Response
```json
[
  {
    "id": "clxyz123",
    "tenantId": "t_abc",
    "name": "my-custom-tools",
    "url": "https://tools.mycompany.com/mcp",
    "workspaceId": null,
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

## Agent Runtime Client

**File:** `apps/agent-runtime/src/mcp-registry-client.ts`

### `getTenantMcpServers(tenantId: string): Promise<TenantMcpServer[]>`
- `GET {API_GATEWAY_URL}/v1/mcp`
- Returns `[]` on any error (fire-safe — never throws)
- Called before task classification to build the tool list

### `registerMcpServer(tenantId, input): Promise<TenantMcpServer | null>`
```typescript
registerMcpServer(tenantId: string, input: {
  name: string;
  url: string;
  workspaceId?: string;
  headers?: Record<string, string>;
}): Promise<TenantMcpServer | null>
```
- `POST {API_GATEWAY_URL}/v1/mcp`
- Returns `null` on error (fire-safe)

### Environment Variables
| Variable | Purpose |
|---|---|
| `API_GATEWAY_URL` | Base URL of the API gateway (e.g. `http://localhost:3000`) |

---

## How Agents Use MCP Servers

Before each task, the agent runtime:
1. Calls `getTenantMcpServers(tenantId)` to get registered servers
2. For each server, calls `GET {server.url}/tools` (MCP tool discovery)
3. Appends discovered tools to the LLM's tool list
4. On tool invocation, calls `POST {server.url}/call` with `{toolName, arguments}`

MCP tools appear alongside built-in actions in the `ActionDecision` output. Risk level is assigned based on the tool's declared capabilities.

---

## Registration Behavior

- If a server with the same `(tenantId, name)` exists and is inactive (`isActive = false`), `POST /v1/mcp` reactivates it and updates `url` and `headers`.
- If the server is already active, the POST returns a conflict error — use `PATCH` to update an active server.
- Deleting a server sets `isActive = false` — the record is never hard-deleted, preserving audit history.
