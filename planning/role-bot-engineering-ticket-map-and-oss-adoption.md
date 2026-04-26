# AgentFarm: Role Bot Engineering Ticket Map and Open-Source Adoption Plan

## Purpose
Provide an implementation-ready ticket map and open-source adoption shortlist aligned to the canonical product direction:
1. Independent role bots per purchased role.
2. LLM as the primary brain for every bot.
3. Governance, approvals, and audit as mandatory control boundaries.

## Product Guardrails
1. No default cross-bot orchestration.
2. No public plugin marketplace in MVP.
3. Role entitlements control bot creation and capabilities.
4. Bot-scoped integrations and bot-scoped audit by default.

## Delivery Plan
1. Phase 1: Contract and type foundation.
2. Phase 2: API and runtime enforcement.
3. Phase 3: Dashboard role-aware experience.
4. Phase 4: Entitlements and role subscription enforcement.
5. Phase 5: Observability and cost-quality controls for LLM brain operations.

---

## Concrete Engineering Tickets

## Epic A: LLM Brain Contracts and Role Capability Types

### AF-RB-001 Add role catalog and capability types
1. Goal:
- Add canonical role and capability interfaces used across apps and services.
2. File targets:
- packages/shared-types/src/index.ts
3. Changes:
- Add RoleKey union for current role catalog.
- Add RoleCatalogRecord and RoleCapabilityProfileRecord.
- Add TenantRoleSubscriptionRecord and BotCapabilitySnapshotRecord.
- Add BotBrainConfig type with prompt, model profile, and policy version fields.
4. Acceptance criteria:
- Typecheck passes across workspace.
- No service imports internal types from another service.

### AF-RB-002 Align connector contracts with role compatibility metadata
1. Goal:
- Make connector registry role-aware without breaking existing connector contract usage.
2. File targets:
- packages/connector-contracts/src/index.ts
3. Changes:
- Add allowedRoles metadata for each connector definition.
- Add optional defaultActionPolicyByRole map.
- Keep existing connector tool and action definitions backward compatible.
4. Acceptance criteria:
- Existing connector pages and APIs compile unchanged.
- New role compatibility metadata available to gateway and dashboard.

### AF-RB-003 Add normalized LLM decision envelope contract
1. Goal:
- Standardize runtime output from LLM brain before execution.
2. File targets:
- packages/shared-types/src/index.ts
4. Changes:
- Add LlmDecisionEnvelope with proposed_actions, confidence, risk_hints, and reason_summary fields.
- Add LlmExecutionMetadata for model profile, prompt version, latency, and token usage.
4. Acceptance criteria:
- Runtime and evidence service can persist decision metadata without schema ambiguity.

---

## Epic B: API Gateway Role and Entitlement Enforcement

### AF-RB-004 Add role catalog and entitlement read endpoints
1. Goal:
- Expose role catalog and tenant entitlements for dashboard bootstrapping.
2. File targets:
- apps/api-gateway/src/main.ts
3. Changes:
- Add GET /v1/catalog/roles.
- Add GET /v1/catalog/roles/:roleKey/capabilities.
- Add GET /v1/tenants/:tenantId/entitlements.
4. Acceptance criteria:
- Responses are tenant-scoped where needed and include role version metadata.

### AF-RB-005 Enforce role checks in connector action execution route
1. Goal:
- Ensure action execution is blocked if action or connector is not allowed for bot role.
2. File targets:
- apps/api-gateway/src/routes/connector-actions.ts
3. Changes:
- Inject role capability lookup before connector dispatch.
- Validate action type and connector tool against bot capability snapshot.
- Return explicit role_capability_denied error code.
4. Acceptance criteria:
- Unauthorized role actions are rejected before provider call.
- Existing approved actions continue to work.

### AF-RB-006 Add bot-scoped capability and integration endpoints
1. Goal:
- Drive dashboard behavior from bot context, not tenant-global context.
2. File targets:
- apps/api-gateway/src/main.ts
3. Changes:
- Add GET /v1/bots/:botId/capabilities.
- Add GET /v1/bots/:botId/integrations/available.
- Add GET /v1/bots/:botId/connectors.
- Add POST /v1/bots/:botId/connectors.
4. Acceptance criteria:
- API shows only role-allowed integrations for selected bot.

---

## Epic C: Runtime Enforcement for LLM-First Role Bots

### AF-RB-007 Enforce bot capability snapshot in runtime server
1. Goal:
- Prevent runtime from executing actions outside role capabilities even if requested by LLM output.
2. File targets:
- apps/agent-runtime/src/runtime-server.ts
3. Changes:
- Load capability snapshot at startup.
- Validate each proposed connector action against snapshot.
- Emit structured rejection event for policy and evidence service.
4. Acceptance criteria:
- Runtime refuses out-of-role actions with deterministic error and log fields.

### AF-RB-008 Persist LLM brain metadata in action result writer flow
1. Goal:
- Ensure model profile and prompt version are auditable per bot action.
2. File targets:
- apps/agent-runtime/src/runtime-server.ts
- apps/agent-runtime/src/action-result-writer.ts
3. Changes:
- Include llm_execution_metadata in action results.
- Include role_key and capability profile version in result payload.
4. Acceptance criteria:
- Evidence queries can show model profile, prompt version, and action outcome per bot.

### AF-RB-009 Add runtime config contract fields for LLM brain profile
1. Goal:
- Make LLM brain config explicit and versioned in runtime startup contract.
2. File targets:
- apps/agent-runtime/src/runtime-server.ts
- packages/shared-types/src/index.ts
3. Changes:
- Add required runtime env contract fields for model profile and prompt pack version.
4. Acceptance criteria:
- Runtime fails fast on missing required brain config.

---

## Epic D: Dashboard Bot-Scoped Integration UX

### AF-RB-010 Add bot selector and bot-scoped connectors view
1. Goal:
- Make integrations page scoped to selected bot.
2. File targets:
- apps/website/app/connectors/page.tsx
3. Changes:
- Add selected bot context.
- Replace tenant-global connector fetch with bot-scoped endpoints.
- Show only role-allowed integration catalog for selected bot.
4. Acceptance criteria:
- Different bots in same tenant show different integration catalogs as expected.

### AF-RB-011 Add role capability panel in dashboard
1. Goal:
- Improve explainability for customers on what each bot can do.
2. File targets:
- apps/website/app/connectors/page.tsx
- apps/dashboard/app/page.tsx
3. Changes:
- Show role name, model profile, allowed actions, and policy notes per selected bot.
4. Acceptance criteria:
- Support can explain capability boundaries without reading backend logs.

---

## Epic E: Persistence and Entitlements

### AF-RB-012 Add role catalog and subscription tables
1. Goal:
- Persist role SKU catalog and tenant subscriptions.
2. File targets:
- packages/db-schema/prisma/schema.prisma
- packages/shared-types/src/index.ts
3. Changes:
- Add role_catalog, role_capability_profiles, tenant_role_subscriptions, bot_capability_snapshots.
4. Acceptance criteria:
- Migration succeeds and read/write paths are tested.

### AF-RB-013 Enforce entitlement checks on bot creation
1. Goal:
- Prevent unauthorized bot creation for unpurchased roles.
2. File targets:
- apps/api-gateway/src/routes/auth.ts
- apps/api-gateway/src/main.ts
3. Changes:
- Validate tenant role subscriptions before creating bot instances.
4. Acceptance criteria:
- Attempts to create unentitled role bots are rejected with explicit error.

---

## Epic F: Tests and Quality Gates

### AF-RB-014 Contract regression tests for role capability enforcement
1. Goal:
- Guarantee role matrix and execution rules do not regress.
2. File targets:
- apps/api-gateway/src/routes/connector-actions.test.ts
- apps/agent-runtime/src/runtime-server.test.ts
3. Changes:
- Add tests for allowed and denied action paths.
4. Acceptance criteria:
- Tests fail before enforcement and pass after enforcement.

### AF-RB-015 End-to-end tests for bot-scoped integrations UI
1. Goal:
- Validate per-bot integration visibility and setup flow.
2. File targets:
- apps/website/tests
3. Changes:
- Add tests for two bots in one tenant with different role capabilities.
4. Acceptance criteria:
- UI never displays disallowed integration for selected bot.

---

## Open-Source Reuse Plan Aligned to Product Idea

## Adopt Now
1. LiteLLM
- Why: model gateway for multi-model routing, fallback, and cost controls for LLM-first bots.
- Integrate at: runtime outbound model calls from apps/agent-runtime.

2. Langfuse
- Why: LLM trace, prompt version, quality instrumentation, and run observability.
- Integrate at: apps/agent-runtime plus evidence pipeline.

3. OpenFGA
- Why: tenant and role authorization model for entitlements and bot access checks.
- Integrate at: apps/api-gateway authz checks and entitlement endpoints.

4. OPA
- Why: policy-as-code for action risk and approval requirements.
- Status: already in architecture baseline; keep and harden.

5. OpenTelemetry stack (Prometheus, Grafana, Loki, Tempo)
- Why: consistent observability for runtime, approval, and connector execution.
- Status: already in architecture baseline; keep and extend with LLM metrics.

## Evaluate in Controlled POC
1. Hatchet
- Why: durable task orchestration for long-running bot jobs.
- Decision gate: adopt if BullMQ lifecycle complexity grows.

2. OpenBao or HashiCorp Vault
- Why: managed secrets and rotation for connector credentials.
- Decision gate: use current approved path, but standardize API surface.

3. Promptfoo
- Why: repeatable prompt and behavior evaluation for role bots.
- Decision gate: adopt for role prompt pack regression testing.

## Avoid for MVP Core Path
1. Public skill marketplaces
- Reason: expands attack surface and weakens governance.

2. Dynamic third-party plugin installs
- Reason: incompatible with strict role capability and audit boundaries.

3. Cross-role swarm orchestration frameworks in default mode
- Reason: conflicts with independent bot operating model.

---

## 30-Day Execution Sequence (Tickets + OSS)
1. Week 1
- AF-RB-001, AF-RB-002, AF-RB-003, AF-RB-012.
- LiteLLM and Langfuse local POC wiring.

2. Week 2
- AF-RB-004, AF-RB-005, AF-RB-006, AF-RB-013.
- OpenFGA entitlement prototype in gateway.

3. Week 3
- AF-RB-007, AF-RB-008, AF-RB-009.
- OPA policy integration checks and approval path hardening.

4. Week 4
- AF-RB-010, AF-RB-011, AF-RB-014, AF-RB-015.
- Dashboard validation and quality gate run.

## Done Criteria
1. Role entitlement enforcement is active at bot creation and action execution.
2. Bot-scoped UI only shows allowed integrations for selected role bot.
3. LLM metadata is traceable per action for audit and reliability analysis.
4. Quality gates remain green with added tests.

## Traceability
This document extends and operationalizes:
1. planning/independent-role-bot-operating-model.md
2. planning/product-architecture.md
3. planning/engineering-execution-design.md
