# @agentfarm/sdk

Typed TypeScript HTTP client for the AgentFarm API Gateway.

## Installation

This package is part of the AgentFarm monorepo. From any workspace package:

```json
"dependencies": {
  "@agentfarm/sdk": "workspace:*"
}
```

## Usage

```ts
import { AgentFarmClient } from '@agentfarm/sdk';

const client = new AgentFarmClient({
  baseUrl: 'http://localhost:3000',
  token: process.env.AF_TOKEN,
});

// List agents
const { bots } = await client.agents.list({ workspaceId: 'ws-123' });

// Get performance analytics
const perf = await client.analytics.agentPerformance({
  tenantId: 'tenant-1',
  from: '2025-01-01',
  to: '2025-01-31',
});

// Send a message between agents
const msg = await client.messages.send('bot-sender', {
  toBotId: 'bot-receiver',
  messageType: 'QUESTION',
  body: 'What is the status of task X?',
});

// Get inbox
const inbox = await client.messages.inbox('bot-receiver');
```

## Namespaces

| Namespace | Methods |
|-----------|---------|
| `client.agents` | `list`, `get`, `create`, `pause`, `resume` |
| `client.analytics` | `agentPerformance`, `costSummary` |
| `client.notifications` | `list` |
| `client.messages` | `send`, `inbox`, `sent`, `markRead`, `reply`, `thread` |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `baseUrl` | `http://localhost:3000` | API Gateway base URL |
| `token` | `null` | Bearer token for authentication |
| `timeoutMs` | `15000` | Request timeout in milliseconds |

## Error handling

All methods throw typed errors on failure:

- `AgentFarmError` — base error with `statusCode` and `errorCode`
- `AgentFarmAuthError` — 401 Unauthorized
- `AgentFarmNotFoundError` — 404 Not Found
