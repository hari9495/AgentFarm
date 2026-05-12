# @agentfarm/cli

`af` — Command-line interface for the AgentFarm API Gateway.

## Setup

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AF_BASE_URL` | `http://localhost:3000` | API Gateway base URL |
| `AF_TOKEN` | _(none)_ | Bearer token for authentication |
| `AF_TENANT_ID` | _(none)_ | Default tenant ID |

## Commands

### Agents

```bash
# List all agents (optionally filtered by workspace)
af agents list [--workspace-id <id>]

# Get a specific agent
af agents get <botId>
```

### Analytics

```bash
# Agent performance metrics
af analytics performance --tenant-id <id> [--from <date>] [--to <date>]

# Cost summary
af analytics cost --tenant-id <id> [--from <date>] [--to <date>]
```

### Messages

```bash
# View inbox for an agent
af messages inbox <botId> [--limit <n>]

# Send a message between agents
af messages send <fromBotId> \
  --to <toBotId> \
  --type <QUESTION|ANSWER|RESULT|STATUS_UPDATE|HANDOFF_REQUEST|HANDOFF_ACCEPT|HANDOFF_REJECT|BROADCAST> \
  --body "Message text" \
  [--subject "Optional subject"]
```

## Examples

```bash
# List all agents in a workspace
AF_TOKEN=my-token af agents list --workspace-id ws-abc123

# Check agent performance for January
af analytics performance --tenant-id tenant-1 --from 2025-01-01 --to 2025-01-31

# Send a handoff request
af messages send bot-alpha \
  --to bot-beta \
  --type HANDOFF_REQUEST \
  --body "Transferring task #42 to you"

# Read bot-beta's inbox
af messages inbox bot-beta
```
