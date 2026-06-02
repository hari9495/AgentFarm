# Platform — Detailed Reference

> **Section:** Platform (sidebar) — Connectors, Platform MCP, Skills, Memory, Governance
> **Auth:** All pages require a valid `agentfarm_internal_session` cookie; redirect to `/login?next=<path>` if missing.

---

## Table of Contents

1. [Connectors Hub](#1-connectors-hub)
   - [Config Tab](#config-tab)
   - [Marketplace Tab](#marketplace-tab)
   - [Health Tab](#health-tab)
   - [Adapters Tab](#adapters-tab)
   - [MCP Tab](#mcp-tab)
   - [Inbound Webhooks Tab](#inbound-webhooks-tab)
   - [Outbound Webhooks Tab](#outbound-webhooks-tab)
2. [Platform MCP](#2-platform-mcp)
3. [Skills Hub](#3-skills-hub)
   - [Marketplace Tab](#skills-marketplace-tab)
   - [Search Tab](#skills-search-tab)
   - [Invoke Tab](#skills-invoke-tab)
   - [Telemetry Tab](#skills-telemetry-tab)
   - [Pipelines Tab](#skills-pipelines-tab)
   - [Catalog Tab](#skills-catalog-tab)
   - [Roles Tab](#skills-roles-tab)
4. [Memory Hub](#4-memory-hub)
   - [Episodic Tab](#episodic-tab)
   - [Work Memory Tab](#work-memory-tab)
   - [Patterns Tab](#patterns-tab)
   - [Knowledge Tab](#knowledge-tab)
   - [Search Tab](#memory-search-tab)
5. [Governance Hub](#5-governance-hub)
   - [KPIs Tab](#kpis-tab)
   - [Workflows Tab](#workflows-tab)
   - [Kill Switches Tab](#kill-switches-tab)
   - [Circuit Breakers Tab](#circuit-breakers-tab)
   - [Disclosure Tab](#disclosure-tab)
   - [Retention Tab](#retention-tab)
   - [Plugins Tab](#plugins-tab)

---

## 1. Connectors Hub

**Route:** `/connectors`
**Client component:** `ConnectorsHubClient` in `apps/dashboard/app/connectors/connectors-hub-client.tsx`
**Auth:** Auth-guarded.

The Connectors Hub is the central management interface for all integrations. It has 7 sub-tabs covering connector setup, the connector marketplace, health monitoring, custom adapters, MCP protocol settings, and webhook management.

---

### Config Tab

**URL param:** `?tab=config`
**Component:** `ConnectorConfigPanel`

Provides credential and configuration management for each supported built-in connector type. Select the connector type from a sidebar list; the right panel shows its configuration form.

#### Supported Connector Types

**JIRA** (`jira`)

| Field | Type | Description |
|---|---|---|
| Base URL | URL input | Your Atlassian instance URL (e.g., `https://yourcompany.atlassian.net`) |
| Email | Email input | The account email used for API authentication |
| API Token | Password input | Atlassian API token (generated from account settings) |
| Project Key | Text input | Default project key for issue creation (e.g., `ENG`) |

**Microsoft Teams** (`teams`)

| Field | Type | Description |
|---|---|---|
| Tenant ID | Text input | Azure AD tenant ID |
| Client ID | Text input | Registered app client ID |
| Client Secret | Password input | App client secret |
| Webhook URL (optional) | URL input | Incoming webhook URL for posting messages to a channel |

**GitHub** (`github`)

| Field | Type | Description |
|---|---|---|
| Access Token | Password input | Personal Access Token or GitHub App installation token |
| Default Repo | Text input | `owner/repo` format; used when no repo is specified in a task |
| Webhook Secret (optional) | Password input | Secret for validating inbound GitHub webhook payloads |

**Email** (`email`)

| Field | Type | Description |
|---|---|---|
| Provider | Select | `sendgrid` or `smtp` |
| — SendGrid: API Key | Password input | SendGrid API key |
| — SMTP: Host | Text input | SMTP server hostname |
| — SMTP: Port | Number input | SMTP port (typically 587 or 465) |
| — SMTP: Username | Text input | SMTP authentication username |
| — SMTP: Password | Password input | SMTP authentication password |
| — SMTP: TLS | Toggle | Enable/disable STARTTLS |
| From Name | Text input | Sender display name |
| From Address | Email input | Sender email address |

**Custom API** (`custom_api`)

| Field | Type | Description |
|---|---|---|
| Base URL | URL input | Base URL of the custom API |
| Auth Type | Select | `none`, `api_key`, `bearer`, `basic` |
| — API Key: Header | Text input | Header name for the API key (e.g., `X-API-Key`) |
| — API Key: Value | Password input | The API key value |
| — Bearer: Token | Password input | Bearer token value |
| — Basic: Username | Text input | Basic auth username |
| — Basic: Password | Password input | Basic auth password |
| Timeout (ms) | Number input | Request timeout for calls to this API |

**Save / Test:** Each form has:
- **Save:** Persists the credentials (encrypted at rest). Posts to `POST /api/connectors/config`.
- **Test Connection:** Validates the credentials by making a lightweight test request to the connector API. Returns a green success message or a red error with details.

---

### Marketplace Tab

**URL param:** `?tab=marketplace`
**Component:** `ConnectorMarketplacePanel`

The Connector Marketplace lists all available connectors — both built-in connectors and connectors published via the MCP protocol by third parties.

Each connector card shows:
- Connector name and category icon.
- Short description of what it integrates.
- Installation status: Installed (green) / Available (grey).
- Install / Remove button.
- Link to documentation.

**Filtering:**
- Category filter: CRM / Communication / DevTools / Finance / HR / Storage / Custom.
- Installed only toggle.
- Free-text search on connector name or description.

Installing a marketplace connector provisions it in the connector registry and makes it available for agent skill assignment.

---

### Health Tab

**URL param:** `?tab=health`
**Component:** `HealthStatusPanel`
**API source:** `GET /api/connectors/health`

Displays the real-time health status of all configured connectors.

| Column | Description |
|---|---|
| Connector | Name with type icon |
| Status | `healthy` (green), `degraded` (amber), `unreachable` (red), `not_configured` (grey) |
| Last Check | Timestamp of the most recent health probe |
| Response Time (ms) | Latency of the most recent health probe |
| Uptime (24h) | Percentage of probes in the last 24 hours that were successful |
| Error Count (1h) | Number of failed calls in the last 60 minutes |

**Auto-refresh:** The health panel polls every 60 seconds by default. A manual **Refresh Now** button is available.

**Probe Detail:** Clicking a connector row shows the last 20 health probe results in a mini timeline.

---

### Adapters Tab

**URL param:** `?tab=adapters`

Custom adapters are thin translation layers that map a custom API's request/response format to the AgentFarm connector contract. This tab is the management interface for custom adapters.

**Adapter List:**
Each adapter shows:
- Adapter name, version, author.
- Target connector (which custom API this adapter is for).
- Status: `active` / `draft` / `deprecated`.
- Last updated timestamp.

**Create Adapter:**
Opens a code editor for writing the adapter translation logic. Adapters are TypeScript functions. The editor provides the adapter function signature and full type definitions.

**Test Adapter:**
Run a sample request through the adapter before activating it.

---

### MCP Tab

**URL param:** `?tab=mcp`

Configuration and status for MCP (Model Context Protocol) connector endpoints.

**Registered MCP Servers:**
A table of all MCP servers registered with this workspace:
- Server name and URL.
- Transport: `stdio` / `http` / `sse`.
- Status: connected / disconnected / error.
- Tools exposed: count of tools available via this server.
- Last ping timestamp.

**Add MCP Server:**
Form to register a new MCP server:
- Server URL (for HTTP/SSE transport).
- Auth token (for protected MCP servers).
- Transport type selection.
- Test connection before saving.

**Tool Browser:**
For each connected MCP server, a collapsible list of tools it exposes with name, description, and input schema.

---

### Inbound Webhooks Tab

**URL param:** `?tab=inbound`
**Component:** `InboundWebhooksPanel`
**API source:** `GET /api/connectors/webhooks/inbound`

Manage webhook endpoints that external services (GitHub, Slack, Jira, etc.) POST events to. AgentFarm generates unique webhook URLs and validates signatures.

**Webhook List:**
Each inbound webhook shows:
- Webhook URL (copy button).
- Event source (which service this is for).
- Signature validation: HMAC algorithm and secret (last 4 chars of secret shown).
- Status: `active` / `paused` / `error`.
- Events received (count in last 24h).
- Last received timestamp.

**Create Webhook:**
- Select the event source from a dropdown (GitHub / Slack / Jira / Custom).
- The system generates a unique URL and signing secret.
- Copy the generated URL and secret into the external service's webhook settings.

**Event Log:**
Expanding a webhook shows its recent delivery log:
- Timestamp, HTTP status code, event type (from the `X-Event-Type` header), payload preview, processing status (received / processed / ignored / error).

---

### Outbound Webhooks Tab

**URL param:** `?tab=outbound`
**Component:** `OutboundWebhooksPanel`

Manage outbound webhooks — HTTP callbacks that AgentFarm POSTs to when internal events occur.

**Webhook List:**
Each outbound webhook shows:
- Target URL.
- Events subscribed: which internal event types trigger this webhook.
- Signing: whether the outgoing payload is HMAC-signed and the signing algorithm.
- Status: `active` / `paused`.
- Delivery success rate (last 24h).
- Last delivery timestamp.

**Dead Letter Queue (DLQ):**
At the bottom of the tab, a DLQ panel shows failed deliveries — webhook POSTs that received non-2xx responses or timed out. Each DLQ entry shows:
- Target URL, event type, timestamp, HTTP status, error message.
- **Retry:** Re-attempt the delivery. Posts to `POST /api/connectors/webhooks/outbound/dlq/:id/retry`.
- **Discard:** Remove from DLQ without retrying.

---

## 2. Platform MCP

**Route:** `/platform-mcp`
**Auth:** Auth-guarded.
**API source:** `GET /api/platform/mcp/roles`

The Platform MCP page shows how the 13 agent roles map to MCP connector groups. Each role card shows which MCP servers are assigned to it, enabling administrators to understand and audit which tools each role type can access.

### Role Cards

Each of the 13 agent roles is displayed as a card:

| Role | MCP Group Colour |
|---|---|
| Developer | Indigo |
| Full Stack Developer | Indigo |
| Tester | Teal |
| Business Analyst | Blue |
| Technical Writer | Sky |
| Content Writer | Violet |
| Sales Representative | Emerald |
| Marketing Specialist | Pink |
| Corporate Assistant | Slate |
| Customer Support Executive | Amber |
| PM/PO/Scrum Master | Orange |
| Recruiter | Rose |
| Meeting Agent | Cyan |

Each card shows:
- Role name and emoji.
- MCP group colour badge.
- List of MCP servers assigned to this role (name + transport type).
- Total tool count (number of tools available via all assigned MCP servers).

### Role Detail
Clicking a role card expands a detail panel with:
- Full list of assigned MCP servers with their tool counts.
- Full list of tools available to this role (grouped by MCP server).
- Any tools that are blocked for this role despite being in an assigned MCP server (role-level tool denylists).

### Assignment Management
An **Edit Role** button opens a modal to modify which MCP servers are assigned to this role:
- Multi-select list of available MCP servers.
- Toggle each server on/off for this role.
- Save applies the new assignment and takes effect on the next task dispatched to this role.

---

## 3. Skills Hub

**Route:** `/skills`
**Client component:** `SkillsHubClient` in `apps/dashboard/app/skills/skills-hub-client.tsx`
**Auth:** Auth-guarded.

The Skills Hub manages the agent skill registry — discrete named capabilities that agents can invoke. Skills are backed by MCP tools, internal service calls, or custom code.

---

### Skills Marketplace Tab

**URL param:** `?tab=marketplace`

Browse and install skills from the marketplace:
- Skill cards showing name, description, category, author, install count.
- Category filter: Coding / Communication / Research / Analysis / File / Browser / Custom.
- Install / Remove buttons.

---

### Skills Search Tab

**URL param:** `?tab=search`

A search interface for finding skills across the registry:
- Free-text search input.
- Results ranked by relevance (semantic similarity via embeddings).
- Each result shows: skill name, description, input/output schema preview.

---

### Skills Invoke Tab

**URL param:** `?tab=invoke`

Manually invoke a skill for testing or ad-hoc execution:
- Select skill from a dropdown.
- JSON input editor for the skill's input payload.
- **Invoke** button sends to `POST /api/skills/:skillId/invoke`.
- Output panel shows the skill's return value (JSON formatted) and execution metadata (duration, tokens used, cost).

---

### Skills Telemetry Tab

**URL param:** `?tab=telemetry`
**API source:** `GET /api/runtime/:botId/marketplace/telemetry`

Per-skill performance metrics for a specific agent (bot ID is entered via the BotIdInput field):

| Column | Description |
|---|---|
| Skill Name | The skill identifier |
| Invocation Count | Total times invoked by this agent |
| Success Rate | Percentage of invocations that succeeded |
| Avg Duration (ms) | Mean execution time |
| Avg Tokens Used | Mean token consumption per invocation |
| Avg Cost (USD) | Mean cost per invocation |
| Last Invoked | Timestamp of most recent invocation |

---

### Skills Pipelines Tab

**URL param:** `?tab=pipelines`

Multi-step skill pipelines chain several skills together. Each pipeline step's output feeds into the next step's input.

**Pipeline List:**
- Pipeline name, step count, owning agent.
- Status: `active` / `draft` / `archived`.

**Pipeline Builder:**
A visual step-by-step builder:
- Add steps by selecting a skill from a dropdown.
- Map output fields from one step to input fields of the next step using a visual connector UI.
- Test the pipeline with a sample input.
- Save/activate the pipeline.

---

### Skills Catalog Tab

**URL param:** `?tab=catalog`

The full registry of all skills defined in the system (including those not yet assigned to any agent):
- Full skill name, version, description, input schema, output schema.
- Which agents currently have this skill enabled.
- Created / updated timestamps.
- Deprecation status.

---

### Skills Roles Tab

**URL param:** `?tab=roles`

Shows which skills are assigned to each agent role:
- Role name on the left.
- Grid of skills with a green checkmark (assigned) or empty (not assigned).
- Click a cell to toggle the skill assignment for that role (requires admin permission).

---

## 4. Memory Hub

**Route:** `/memory`
**Client component:** `MemoryHubClient` in `apps/dashboard/app/memory/memory-hub-client.tsx`
**Auth:** Auth-guarded.

The Memory Hub provides visibility into and management of all forms of agent memory. The Bot ID input at the top of the page scopes all memory panels to a specific agent. The Bot ID field is optional — if left blank, some panels show cross-agent data.

---

### Episodic Tab

**URL param:** `?tab=episodic`
**Component:** `AgentEpisodicMemoryPanel`
**API source:** `GET /api/agents/:botId/memory/episodic`

Episodic memory stores per-person interaction history retrieved via pgvector similarity search. This enables the agent to recall previous conversations with a specific person when interacting with them again.

**Memory Entry List:**
Each entry shows:
- Person identifier (email or user ID).
- Episode summary (what happened in this interaction).
- Creation timestamp and last accessed timestamp.
- Similarity score (if the entry was retrieved in response to a search query).

**Episode Detail:**
Clicking an entry shows the full episode payload including the raw interaction events that formed this memory.

**Delete Entry:**
An operator can delete specific episodic memory entries (e.g., on GDPR erasure request). Posts to `DELETE /api/agents/:botId/memory/episodic/:entryId`.

---

### Work Memory Tab

**URL param:** `?tab=work`
**Component:** `WorkMemoryPanel`
**API source:** `GET /api/agents/:botId/memory/work`

Working memory is the agent's active, short-lived context for the current task or session. It holds the task plan, progress state, intermediate artefacts, and any context the LLM needs to continue a multi-step task.

**Working Memory Viewer:**
A JSON tree viewer showing the current working memory contents for the selected agent. The tree is expandable/collapsible.

**Working memory fields:**
- `taskId`: The active task ID.
- `plan`: The current task plan steps.
- `completedSteps`: Steps already executed.
- `pendingSteps`: Steps still to be done.
- `context`: Relevant background information retrieved from semantic/episodic memory.
- `artefacts`: Files or data created during this task.
- `scratchpad`: Free-form reasoning notes from the LLM.

**Clear Working Memory:**
A **Clear** button wipes the agent's working memory (useful for unsticking a stuck agent). Posts to `DELETE /api/agents/:botId/memory/work`.

---

### Patterns Tab

**URL param:** `?tab=patterns`
**Component:** `AgentMemoryPatternFetcher`
**API source:** `GET /api/workspaces/:workspaceId/memory/patterns`

Long-term episodic patterns — lessons the agent has learned from previous task approvals and rejections stored in `AgentLongTermMemory`. These feed the RAG lesson pipeline.

**Pattern List:**
Each pattern entry shows:
- Lesson key prefix (e.g., `dev:lesson:code_quality:ws_001:...`).
- Category (e.g., `code_quality`, `security`, `testing_strategy`).
- Lesson summary text.
- Source: which task/approval generated this lesson.
- Created At.
- Retrieval count: how many times this pattern has been used in RAG context.

**Pattern Detail:**
Full lesson text, source task ID, feedback that generated the lesson, and the category classification.

**Delete Pattern:**
Remove a specific lesson from long-term memory (useful when a lesson was learned incorrectly). Posts to `DELETE /api/workspaces/:workspaceId/memory/patterns/:patternId`.

---

### Knowledge Tab

**URL param:** `?tab=knowledge`
**Component:** `KnowledgeGraphExplorer`
**API source:** `GET /api/workspaces/:workspaceId/knowledge-base`

The knowledge base is the workspace's semantic memory — documents, templates, and reference material stored as vector embeddings in `AgentKnowledgeBase`.

**Knowledge Graph Visualisation:**
An interactive node-link graph showing relationships between knowledge base entries:
- Each node is a knowledge base document.
- Edges represent semantic similarity (nodes are connected if their cosine similarity exceeds 0.7).
- Node size represents the number of times that document has been retrieved.
- Colour coding by `sourceType` (e.g., blue for `*_template`, green for approved artefacts).

**Document List (table view):**
Switch to table view for a more structured view:
- Document ID, source type, title/summary preview, embedding vector dimension, created timestamp, retrieval count.

**Add Document:**
Manually ingest a new document into the knowledge base:
- Title and content (free-text or file upload).
- Source type tag.
- The document is chunked, embedded, and stored. Posts to `POST /api/workspaces/:workspaceId/knowledge-base`.

**Delete Document:**
Remove a document and its embeddings. Posts to `DELETE /api/workspaces/:workspaceId/knowledge-base/:docId`.

---

### Memory Search Tab

**URL param:** `?tab=search`
**Component:** `MemoryBrowserPanel`
**API source:** `POST /api/knowledge-base/search`

A semantic search interface across all memory types.

**Search Input:**
A free-text query field. Enter a natural-language query (e.g., "code review best practices for TypeScript") and the system runs cosine similarity search across `AgentKnowledgeBase`.

**Results:**
Each result shows:
- Document title/summary.
- Source type badge.
- Similarity score (0.0–1.0; higher is more relevant).
- Snippet of the most relevant passage.
- Full document link.

**Threshold slider:**
Adjust the minimum similarity threshold (default 0.65 for documents, 0.55 for templates). Lowering the threshold returns more but less relevant results.

**Memory type filter:**
Search across all memory types, or restrict to: episodic only / semantic only / patterns only.

---

## 5. Governance Hub

**Route:** `/governance`
**Client component:** `GovernanceHubClient` in `apps/dashboard/app/governance/governance-hub-client.tsx`
**Auth:** Auth-guarded.

The Governance Hub centralises all safety, policy, and compliance configuration. It has 7 sub-tabs covering governance KPIs, workflow policies, kill switches, circuit breakers, disclosure settings, retention policy, and plugin management.

---

### KPIs Tab

**URL param:** `?tab=kpis`
**Component:** `GovernanceKPIPanel`

Governance performance metrics at a glance:

| KPI | Description |
|---|---|
| Kill Switch Triggers | Count of kill switch activations in the selected period |
| Circuit Breaker Trips | Count of circuit breaker trips in the selected period |
| Policy Violations | Count of tasks rejected by the policy engine |
| Approval SLA Compliance | % of approvals decided within the configured SLA window |
| Avg Approval Wait Time | Mean time from approval intake to operator decision |
| Plugin Violations | Count of plugin policy violations |
| Disclosure Compliance | % of agent interactions that included required disclosure text |

Each KPI tile shows the current period value, the previous period value, and a trend indicator.

---

### Workflows Tab

**URL param:** `?tab=workflows`
**Components:** `GovernanceWorkflowPanel` + `WorkflowBuilderPanel`

Governance workflows are rule-based policies that run automatically on agent actions. A workflow can require approval, block an action, send a notification, or log an evidence event.

**Workflow List:**
Each workflow shows:
- Workflow name.
- Trigger condition (e.g., "when risk level is HIGH", "when action type is `delete_file`").
- Action: require_approval / block / notify / log.
- Status: active / inactive.
- Trigger count (last 30 days).

**Workflow Builder:**
A visual rule builder with:
- **Trigger:** Select the event that activates the workflow (task_started, task_completed, approval_pending, connector_called, etc.).
- **Conditions:** One or more conditions using a field → operator → value format (e.g., `risk_level = HIGH`, `action_type = delete_file`, `connector = github`).
- **Action:** What to do when the workflow fires (require_approval / block / notify [channel] / log).
- **Priority:** Workflows with higher priority are evaluated first when multiple workflows match.

---

### Kill Switches Tab

**URL param:** `?tab=kill-switches`
**Component:** `KillSwitchPanel`
**API sources:**
- `GET /api/governance/kill-switch` — current kill switch state.
- `POST /api/governance/kill-switch/activate` — activate the kill switch.
- `POST /api/governance/kill-switch/deactivate` — deactivate the kill switch.

The kill switch provides an **emergency halt** for all agent activity within a workspace or across the entire tenant.

**Kill Switch Status Card:**
- Global status: **ACTIVE** (red banner) or **INACTIVE** (grey/green).
- Last activation timestamp and reason.
- Last deactivation timestamp.
- Activated by (user ID who flipped the switch).

**Scope Options:**
When activating:
- **Workspace-scoped:** Only halts agents in the selected workspace.
- **Tenant-scoped:** Halts ALL agents across ALL workspaces.

**Activation:**
Click **Activate Kill Switch** → confirmation dialog with reason field (required) → confirm. The kill switch takes effect within 30 seconds (the runtime polls for kill switch state on each task loop iteration).

**Deactivation:**
Click **Deactivate** → confirmation dialog → confirm. Agents resume on their next task loop iteration.

**30-Second Control Window:**
The kill switch uses a 30-second control window — once activated, it cannot be deactivated for 30 seconds to prevent accidental rapid toggling.

---

### Circuit Breakers Tab

**URL param:** `?tab=circuit-breakers`
**Component:** `CircuitBreakersPanel`

This is the **configuration** interface for circuit breakers (contrast with the Audit & Compliance → Circuit Breakers page, which is the **status monitoring** interface).

The same `CircuitBreakersPanel` component is used in both locations. From the Governance Hub it is rendered with edit controls enabled; from Audit & Compliance it is read-only.

See [Audit & Compliance — Circuit Breakers](./AUDIT-COMPLIANCE.md#4-circuit-breakers) for full field documentation.

**Additional edit controls available in this tab:**
- **Create Circuit Breaker:** Define a new breaker for a new circuit.
- **Edit thresholds:** Modify error_threshold, sampling_window, open_duration, half_open_timeout.
- **Delete breaker:** Remove a circuit breaker that is no longer needed.

---

### Disclosure Tab

**URL param:** `?tab=disclosure`
**Component:** `DisclosureSettingsPanel`
**Requires Bot ID** (`needsBot = true`): A Bot ID input is shown at the top; the disclosure settings are per-agent.

**Purpose:** Configure the AI disclosure language that agents include when interacting with external parties (required by EU AI Act, FTC guidelines, and similar regulations in various jurisdictions).

**Disclosure Settings Form:**

| Field | Description |
|---|---|
| Disclosure enabled | Toggle: whether this agent includes disclosure text in outbound communications |
| Disclosure style | `inline` (embedded in messages), `footer` (appended below messages), `separate_first_message` (sent as a separate message at session start) |
| Disclosure text | Free-text editor for the disclosure statement |
| Languages | Which languages to include disclosure in (multi-select; the disclosure is translated to each selected language) |
| Channels | Which channels require disclosure: email, chat, voice (multi-select) |
| Frequency | `every_message`, `first_message_per_session`, `first_message_per_day` |

**Save:** Posts to `POST /api/bots/:botId/disclosure-settings`.

**Preview:** Shows how the disclosure will appear in each channel/style combination.

---

### Retention Tab

**URL param:** `?tab=retention`
**Component:** `RetentionPolicyPanel`
**API source:** `GET /api/governance/retention-policy`, `POST /api/governance/retention-policy`

Configure data retention policies for different record types.

**Retention Policy Table:**

| Record Type | Default Retention | Current Setting | Delete Action |
|---|---|---|---|
| Task records | 90 days | _editable_ | Hard delete after TTL |
| Audit log events | 365 days | _editable_ | Archive to cold storage, then delete |
| Session replay data | 30 days | _editable_ | Hard delete after TTL |
| Agent memory (episodic) | 180 days | _editable_ | Soft delete (tombstone) |
| LLM transcripts | 60 days | _editable_ | Hard delete after TTL |
| Evidence bundles | 365 days | _editable_ | Archive, then delete |

**Edit retention:** Click a row to edit the TTL value (in days). The field validates against minimum retention requirements (e.g., audit logs must be kept at least 90 days per the SLA).

**Purge on demand:** A **Purge Now** button for each record type triggers an immediate purge of all records past their TTL. Requires admin role. This is non-reversible; a confirmation dialog is shown.

---

### Plugins Tab

**URL param:** `?tab=plugins`
**Component:** `PluginLoadingPanel`
**API sources:**
- `GET /api/governance/plugins` — list all plugins.
- `POST /api/governance/plugins/:id/allowlist` — add to allowlist.
- `POST /api/governance/plugins/:id/killswitch` — kill a specific plugin.

Plugins are third-party extensions that augment agent capabilities. This tab manages the plugin allowlist and provides a per-plugin kill switch.

**Plugin List:**

| Column | Description |
|---|---|
| Plugin name | Display name |
| Version | Currently loaded version |
| Author | Publisher |
| Type | `mcp_server`, `action_handler`, `connector_adapter` |
| Status | `allowed`, `blocked`, `killed` |
| Last loaded | Timestamp the plugin was last initialised |
| Risk rating | `low`, `medium`, `high` (assigned by the AgentFarm security review) |

**Allowlist / Blocklist:**
Toggle each plugin's allowlist status. Blocked plugins are not loaded by the runtime even if they are installed.

**Per-plugin Kill Switch:**
For urgently blocking a plugin mid-session (e.g., a zero-day is discovered in a plugin):
- Click the **Kill** button → confirmation dialog → plugin is added to the kill list.
- The runtime stops executing any calls to this plugin within 30 seconds.
- Kill-listed plugins appear with a red "Killed" badge and can only be re-allowed by an admin.

**Plugin Audit Log:**
A table at the bottom showing recent plugin-related audit events: plugin loaded, plugin unloaded, plugin call made, plugin blocked, plugin killed.
