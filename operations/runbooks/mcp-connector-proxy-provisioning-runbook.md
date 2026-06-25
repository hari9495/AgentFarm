# MCP Connector Proxy Provisioning Runbook

> **Purpose:** stand up the MCP server behind each managed-catalog connector so that activating a
> connector in the customer dashboard ("Connect a tool") actually executes live tool calls.
>
> **Status of the system today (verified 2026-06-25):** the catalog metadata, the customer
> self-serve activation flow, header building, and `TenantMcpServer` registration are **built and
> tested**. The proxy URLs in the catalog (`https://connectors.agentfarm.ai/mcp/<tool>`) are
> **placeholders — nothing runs behind them yet.** This runbook is the remaining *operations* work
> (no product engineering) to make a connector live. Provision them **on demand**, driven by what
> paying pilots actually activate — not all 22 up front.

---

## 1. How a connector executes (the data flow)

```
Customer clicks "Connect Zendesk", pastes API token
        │  POST /api/mcp/catalog/zendesk/enable  { token, subdomain, email }
        ▼
API Gateway: buildConnectorHeaders() → { Authorization: "Bearer <token>",
                                         X-Connector-subdomain: "acme",
                                         X-Connector-email: "agent@acme.com" }
        │  upsert TenantMcpServer { url: https://connectors.agentfarm.ai/mcp/zendesk, headers }
        ▼
Agent runtime, on its next task: discoverMcpTools(tenant) → POST that url WITH those headers
        ▼
[THE THING THIS RUNBOOK PROVISIONS]
AgentFarm-hosted MCP proxy for Zendesk
   - speaks MCP (initialize / tools/list / tools/call) over streamable-HTTP
   - reads the customer's token from the incoming headers
   - translates MCP tool calls → Zendesk REST API calls
        ▼
Zendesk API
```

The agent side already does everything above the bracket. The bracket is what's missing.

## 2. What an "AgentFarm-hosted MCP proxy" actually is

For most tools you do **not** write the MCP server — you run an existing one:
- **Official vendor MCP server** (a growing list — GitHub, Notion, Stripe, Atlassian, etc. ship these).
- **Community MCP server** (e.g. the `modelcontextprotocol/servers` collection and ecosystem).
- **A thin wrapper** you write only for tools that have neither (use `@modelcontextprotocol/sdk`).

Most community/official servers speak **stdio**, not HTTP. Bridge them to the streamable-HTTP
transport our client uses with **`supergateway`** (this is the same bridge referenced in the H4
multi-step spec):

```
supergateway --stdio "npx -y @some/mcp-server" --port 9001 --stateful
```

`--stateful` is **required** so multi-step sequences (H4) keep one server-side session per
`mcp-session-id`. Native HTTP MCP servers need no bridge.

## 3. The token-flow decision (read this before provisioning)

The catalog sends the customer's token as a **per-request header** (`Authorization`,
`X-Connector-*`). But most MCP servers read their credential from an **env var at startup**. Two
hosting models reconcile this:

| Model | How the token reaches the upstream | Use when |
|---|---|---|
| **A. Dedicated-per-tenant** | One MCP-server instance per (tenant, connector), token baked into its env at provisioning. Simple, isolated. | Low connector count / high-value tenants / strict isolation |
| **B. Shared header-injecting proxy** | One multi-tenant proxy per connector reads the `Authorization`/`X-Connector-*` headers per request and injects them into the upstream call. Scales to many tenants. | Many tenants per connector |

Start with **Model A** (simplest, ship one pilot fast); move a connector to **Model B** once it has
enough tenants to justify the shared proxy. Either way the catalog/agent side is unchanged.

## 4. Worked example — provision Zendesk (Model A)

**Prereqs:** a host (the customer VM or a shared connectors host), Docker, the tenant's Zendesk token.

1. **Pick the server.** Use the official/community Zendesk MCP server (or a thin SDK wrapper exposing
   `zendesk_search_tickets`, `get_ticket`, `create_ticket`, `update_ticket`, `add_comment`,
   `escalate_ticket` — the tool names already declared in the catalog entry).

2. **Run it behind supergateway** (reference compose fragment — do NOT add to the live
   `docker-compose.yml` until tested):
   ```yaml
   # docker/mcp-connectors/zendesk.compose.yml  (reference)
   services:
     mcp-zendesk:
       image: node:22-alpine
       command: >
         npx -y supergateway
         --stdio "npx -y <zendesk-mcp-server>"
         --port 9001 --stateful
       environment:
         ZENDESK_SUBDOMAIN: ${ZENDESK_SUBDOMAIN}
         ZENDESK_EMAIL: ${ZENDESK_EMAIL}
         ZENDESK_API_TOKEN: ${ZENDESK_API_TOKEN}   # the tenant's token (Model A)
       ports: ["9001:9001"]
   ```

3. **Expose it at the catalog URL.** Point `connectors.agentfarm.ai/mcp/zendesk` at this instance via
   the Cloudflare tunnel / reverse proxy (the same edge that already fronts the platform). For
   per-tenant Model A, route by tenant (e.g. path or host prefix) and pin that tenant's
   `TenantMcpServer.url` accordingly, OR run Model B and let the proxy read the per-request headers.

4. **Verify health** — the dashboard "Ping" button calls `GET /v1/mcp/:id/ping`; expect a latency and
   `ok: true`. Under the hood that runs the MCP `initialize` handshake.

5. **Verify a real call** — assign the support agent a task ("summarize ticket 12345"); confirm in the
   audit log / Langfuse trace that it issued `mcp_tool_call` → `zendesk_get_ticket` and got real data.

## 5. Verification checklist (any connector)

- [ ] `GET /v1/mcp/:id/ping` returns `ok: true` with a latency (MCP `initialize` works).
- [ ] `tools/list` returns the tools declared in the catalog entry (names match).
- [ ] A live agent task issues `mcp_tool_call` and gets real upstream data (check audit/Langfuse).
- [ ] A 2-step `mcp_tool_sequence` shares one session (H4) — requires `--stateful` on the bridge.
- [ ] Wrong/expired token → a clean auth error surfaced to the operator (fail-closed), not a hang.

## 6. Provisioning order (pilot-driven, not all at once)

Do **not** provision all 22. Provision the connector a paying pilot activates:
1. **Developer/DevOps wedge** → GitHub/Jira/Slack/GitLab/Linear already execute first-class (no proxy
   needed for those — they run through `provider-clients.ts`, not the MCP proxy).
2. **First support pilot** → Zendesk (or Freshdesk/Intercom).
3. **First sales pilot** → HubSpot or Pipedrive (or Salesforce).
4. Everything else → as a customer activates it.

## 7. Honesty note for the team

Activating a not-yet-provisioned connector in the dashboard will register a `TenantMcpServer` pointing
at a dead URL — the agent's `discoverMcpTools` is fail-safe (it skips unhealthy servers), so nothing
breaks, but the tool simply won't appear. **Until §4 is done for a given connector, treat it as
"coming soon" in the UI** (hide it, or gate activation) so a customer never connects a tool that
silently does nothing. A small `live: boolean` flag on catalog entries (default false) wired to the
"Connect" button is the clean way to enforce this — recommended as the next small product change.
