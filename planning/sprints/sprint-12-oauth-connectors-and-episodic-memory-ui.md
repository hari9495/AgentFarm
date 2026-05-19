# Sprint 12 — OAuth Connector Flows + Episodic Memory UI

**Status:** COMPLETED
**Target start:** 2026-05-19
**Completed:** 2026-05-18
**Quality gate:** PASS — `operations/quality/13.1-quality-gate-report.md`

---

## Goal

Ship the OAuth 2.0 connector authorization flows (Jira, GitHub, Teams, Email) and the
pgvector-backed episodic memory browsing UI so that customers can connect real tools
to their agents and operators can inspect/redact agent memory — completing the
Developer agent's integration and memory surfaces.

---

## Deliverables

### API Gateway — OAuth Connector Auth Routes

| File | Description |
|------|-------------|
| `apps/api-gateway/src/routes/connector-auth.ts` | Full OAuth2 PKCE + state-nonce flow for Jira, GitHub, Teams, Email (1370 lines). Routes: initiate, callback, refresh, revoke, health-summary, internal token endpoint. Secrets stored in Key Vault — never in DB. CSRF nonce with expiry + replay rejection. |
| `apps/api-gateway/src/routes/connector-auth.test.ts` | 22 tests covering OAuth flow, token refresh, revocation, health summary, and CSRF protection. All pass. |

Supported connectors:
- **Jira** — OAuth 2.0 (3LO), scopes: `read:jira-work write:jira-work offline_access`
- **GitHub** — OAuth App flow, scopes: `repo user:email`
- **Teams** — Microsoft identity platform OAuth 2.0, scopes: `offline_access User.Read Calendars.ReadWrite`
- **Email** — Microsoft Graph (Exchange), scopes: `offline_access Mail.ReadWrite Mail.Send`

Key functions:
- `registerConnectorAuthRoutes()` — Fastify plugin
- `buildOAuthAuthorizeUrl()` — builds provider-specific authorize URL with state nonce
- `defaultCodeExchanger()` — exchanges auth code for access + refresh tokens
- `isScopeSatisfied()` — validates granted scopes match required scopes

### API Gateway — Episodic Memory Routes

| File | Description |
|------|-------------|
| `apps/api-gateway/src/routes/episodic-memory.ts` | Paginated browse + GDPR redact for `AgentLongTermMemory` table via pgvector. Routes: `GET /v1/episodic-memory` (with `bot_id`, `workspace_id`, `page`, `page_size`), `DELETE /v1/episodic-memory/:id`. |
| `apps/api-gateway/src/routes/episodic-memory.test.ts` | 9 tests covering pagination, empty results, and redaction. All pass. |

### Dashboard — Connector Management UI

| File | Description |
|------|-------------|
| `apps/dashboard/app/connectors/page.tsx` | Connector management page — fetches `GET /v1/connectors/health/summary?workspace_id=`, renders `ConnectorConfigPanel` with per-connector status and OAuth connect/revoke buttons. Includes fallback data for 5 connectors. |
| `apps/dashboard/app/connector-marketplace/page.tsx` | Connector marketplace browse page — renders `ConnectorMarketplacePanel`. |
| `apps/dashboard/app/components/connector-config-panel.tsx` | OAuth connect/revoke UI component. `handleOAuthConnect()` calls `POST /v1/connectors/oauth/initiate` then redirects to auth URL. `handleRevoke()` calls `POST /v1/connectors/oauth/revoke`. `isOAuthConnector()` distinguishes full OAuth (Jira, Teams, GitHub) from manual config (Email). |
| `apps/dashboard/app/api/connectors/summary/route.ts` | Next.js API route proxy → `GET /v1/connectors/health/summary`. |

### Dashboard — Episodic Memory UI

| File | Description |
|------|-------------|
| `apps/dashboard/app/memory/page.tsx` | Agent memory browsing page — renders `MemoryBrowserPanel` + `AgentEpisodicMemoryPanel`. |
| `apps/dashboard/app/components/agent-episodic-memory-panel.tsx` | Paginated episodic memory table with per-entry delete (GDPR redact). Calls `GET /api/episodic-memory?bot_id=&workspace_id=&page=&page_size=20` and `DELETE /api/episodic-memory/:id`. |
| `apps/dashboard/app/api/episodic-memory/route.ts` | Next.js proxy → `GET /v1/episodic-memory`. |
| `apps/dashboard/app/api/episodic-memory/[id]/route.ts` | Next.js proxy → `DELETE /v1/episodic-memory/:id`. |

---

## Quality Gate

| Check | Result |
|-------|--------|
| `pnpm --filter @agentfarm/api-gateway typecheck` | ✅ PASS (0 errors) |
| `pnpm --filter @agentfarm/agent-runtime typecheck` | ✅ PASS (0 errors) |
| `pnpm --filter @agentfarm/dashboard typecheck` | ✅ PASS (0 errors) |
| `pnpm --filter @agentfarm/api-gateway test` | ✅ PASS (1204 pass, 0 fail) |
| `pnpm --filter @agentfarm/agent-runtime test` | ⚠️ 1075 pass, 3 fail (pre-existing Sprint 10 regressions — `desktop-operator-factory.test.ts` × 2, `local-workspace-executor.test.ts` × 1; tracked in backlog, not Sprint 12 regressions) |

Full report: `operations/quality/13.1-quality-gate-report.md`

---

## Security Notes

- OAuth state nonces are stored in cache with TTL (CSRF protection)
- Replay attack rejection: each nonce consumed on first use
- Tokens stored in Azure Key Vault — no plaintext credentials in DB or logs
- Scope validation enforced on callback: grants must satisfy required scopes
- GDPR memory redaction is a hard delete (no soft-delete trail of content)

---

## Definition of Done

- [x] OAuth initiate + callback + refresh + revoke routes live for all 4 connectors
- [x] 22 connector-auth tests passing
- [x] Episodic memory browse + redact routes live
- [x] 9 episodic-memory tests passing
- [x] Dashboard connector management page with OAuth flow UI
- [x] Dashboard episodic memory page with pagination and delete
- [x] All Dashboard and API gateway Next.js proxy routes in place
- [x] All typechecks clean (api-gateway, agent-runtime, dashboard)
- [x] Quality gate report filed at `operations/quality/13.1-quality-gate-report.md`

---

## Sprint 13 Preview

- Billing + usage metering
- Agent persona disclosure layer (EU AI Act / FTC compliance)
- Marketplace listing and hire flow

<!-- doc-sync: 2026-05-18 sprint-12 -->
