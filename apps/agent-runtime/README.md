# Agent Runtime

The Agent Runtime is the AI task execution engine for AgentFarm. It receives task assignments from the API Gateway, plans multi-step execution using LLMs, classifies risk, dispatches workspace actions, and reports results back.

**Port**: 4000 (main), `AF_HEALTH_PORT` (health, default 4001)
**Framework**: Fastify 5 with TypeScript
**Tests**: 1,120+ tests (Sprint 18)

---

## Responsibilities

- Multi-step task planning via `TaskPlanner` (LLM-backed)
- LLM provider routing across 9 providers with Auto mode failover
- Risk classification: LOW executes immediately; MEDIUM/HIGH routes to approval queue
- 12 base tiers + Tier 20 (testing tools) + Tier 28 (content writer) of local workspace actions
- **Role enforcement** — `role-enforcer.ts` hard-blocks out-of-role tasks; `task-classifier.ts` LLM membership check
- **Persona system** — `persona-context-loader.ts` (60s LRU cache) + `system-prompt-builder.ts`
- **Memory injection** — episodic memory (pgvector, per-person) + semantic knowledge base (pre-task recall)
- **Disclosure compliance** — `outbound-disclosure.ts` chokepoint on all outbound channels
- Skills registry: crystallize, match, and reuse successful task patterns
- Autonomous loop orchestrator for background agent cycles
- Multi-agent dispatch and orchestration run management
- Desktop and browser operator: `NativeDesktopOperator` (dispatches to desktop-agent Flask service), `MockDesktopOperator` (CI)
- Voice pipeline: meeting transcription (Voicebox STT), speaking agent, 12 role voices seeded at startup
- Meeting participation loop: join → capture audio → transcribe → speak
- Evidence assembly and action result recording
- Budget alert emission and token cost tracking ($0.10/task platform fee)
- MCP (Model Context Protocol) client and registry integration
- Evaluator webhook (`evaluator-webhook.ts`) — fire-and-forget post-task quality dispatch

---

## Development

```bash
# From the repo root
pnpm --filter @agentfarm/agent-runtime dev

# Typecheck
pnpm --filter @agentfarm/agent-runtime typecheck

# Tests
pnpm --filter @agentfarm/agent-runtime test
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `API_GATEWAY_URL` | yes | `http://localhost:3000` | Base URL for API Gateway |
| `AGENTFARM_RUNTIME_TASK_SHARED_TOKEN` | yes | — | Token for pushing task observability to gateway |
| `AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN` | yes | — | Token for posting approvals to gateway |
| `AF_TENANT_ID` | yes | — | Tenant ID this runtime instance serves |
| `AF_WORKSPACE_ID` | yes | — | Workspace ID |
| `AF_BOT_ID` | yes | — | Bot ID |
| `RUNTIME_PORT` | no | `4000` | Main HTTP listen port |
| `AF_HEALTH_PORT` | no | `4001` | Health endpoint port |
| `AF_MODEL_PROVIDER` | no | `anthropic` | Default LLM provider |
| `DESKTOP_OPERATOR` | no | `native` | Set to `mock` to use `MockDesktopOperator` for Tier 11/12 actions |
| `ANTHROPIC_API_KEY` | cond. | — | Required when `AF_MODEL_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | cond. | — | Required when `AF_MODEL_PROVIDER=openai` |

---

## LLM providers

9 named providers plus Auto mode:

| Provider key | Description |
|-------------|-------------|
| `openai` | OpenAI GPT models |
| `azure-openai` | Azure OpenAI deployment |
| `anthropic` | Anthropic Claude models |
| `google` | Google Gemini models |
| `xai` | xAI Grok models |
| `mistral` | Mistral AI models |
| `together` | Together AI models |
| `github-models` | GitHub Models (Azure-hosted) |
| `agentfarm-native` | AgentFarm native model proxy |
| `auto` | Health-score-ordered failover across all above |

**Auto mode**: A 5-minute rolling health score (composite of error rate + latency) determines provider order. Every decision produces a `ProviderFailoverTraceRecord[]` accessible in task records.

**Model profiles**: `quality_first`, `speed_first`, `cost_balanced`, `custom` — configurable per workspace via the API Gateway LLM config endpoint.

---

## Action tiers

12 base tiers + extended tiers. All file and shell operations enforce `safeChildPath` sandbox.

| Tier | Category | Risk | Description |
|------|----------|------|-------------|
| 1 | File operations | LOW | Read, write, delete, move, copy files |
| 2 | Shell execution | MED | Run shell commands in workspace sandbox |
| 3 | IDE intelligence | LOW | Lint, format, typecheck, symbol lookup |
| 4 | Multi-file operations | LOW | Bulk rename, search-replace across files |
| 5 | REPL execution | MED | Execute code in language REPL |
| 6 | Language adapters | LOW | Language-specific build and test runners |
| 7 | Governance | MED | Policy checks, audit log writes |
| 8 | Release | HIGH | Tag, publish, deploy artifacts |
| 9 | Productivity | LOW | Calendar, notes, scheduling |
| 10 | Observability | LOW | Metrics, tracing, log queries |
| 11 | Desktop/meeting | HIGH | Browser, app launch, meeting join/speak, interview |
| 12 | Sub-agent/GitHub | HIGH | Spawn sub-agents, GitHub PR and issue ops |
| 20 | Testing tools | MED/HIGH | Selenium, Cypress, Appium, Playwright, k6/Artillery, Newman, OWASP ZAP, Semgrep, TestRail/Zephyr sync, visual regression |
| 28 | Content writer | LOW/MED | LLM prose, research, SEO, CMS publish, image sourcing, tone adaptation, revision, brand voice learning, editorial scheduling |

---

## Risk classification

The Execution Engine classifies actions before dispatch:

- **HIGH_RISK_ACTIONS**: 17 explicit action type strings — always route to approval queue
- **MEDIUM_RISK_ACTIONS**: 40+ action type strings — route to approval queue
- **Confidence escalation**: if LLM decision confidence < 0.6, action is escalated from LOW to MEDIUM

---

## Skills

The skills system crystallizes successful task patterns for reuse:

1. After a task completes successfully, `SkillsRegistry.crystallize()` extracts a reusable template.
2. Skills move through a `draft -> active` lifecycle.
3. `SkillsRegistry.findMatching()` accelerates future tasks that match existing skills.
4. Skill pipelines (defined via the API Gateway) chain multiple skills for scheduled execution.

---

## Desktop Operator

The `DesktopOperator` interface (`packages/shared-types/src/desktop-operator.ts`) defines four operations: `browserOpen`, `appLaunch`, `meetingJoin`, `meetingSpeak`.

The `getDesktopOperator()` factory in `desktop-operator-factory.ts` selects the implementation:
- `DESKTOP_OPERATOR=mock` (or in CI): returns `MockDesktopOperator` — short-circuits all Tier 11/12 operations without touching native platform APIs
- `DESKTOP_OPERATOR=native` (or unset): uses the native platform path

---

## Source file summary

74 non-test TypeScript source files grouped by concern:

**Core execution**: `runtime-server.ts`, `execution-engine.ts`, `task-planner.ts`, `plan-executor.ts`, `planner-loop.ts`

**LLM layer**: `llm-decision-adapter.ts`, `llm-quality-tracker.ts`, `role-system-prompts.ts`, `system-prompt-builder.ts`

**Action layer**: `local-workspace-executor.ts`, `browser-action-executor.ts`, `desktop-operator-factory.ts`, `desktop-operator-playwright.ts`

**Skills**: `skills-registry.ts`, `skill-execution-engine.ts`, `skill-composition-engine.ts`, `skill-dependency-dag.ts`, `skill-pipeline.ts`, `skill-scheduler.ts`

**Orchestration**: `multi-agent-orchestrator.ts`, `autonomous-loop-orchestrator.ts`, `autonomous-coding-loop.ts`, `wake-coalescer.ts`

**Evidence and audit**: `evidence-assembler.ts`, `evidence-record-contract.ts`, `evidence-record-writer.ts`, `action-result-contract.ts`, `action-result-writer.ts`, `action-observability.ts`, `runtime-audit-integration.ts`

**Memory**: `prisma-memory-store.ts`, `task-intelligence-memory.ts`, `loop-learning-store.ts`, `repo-knowledge-graph.ts`

**Connectors and hooks**: `connector-health-monitor.ts`, `crm-hook.ts`, `erp-hook.ts`, `notification-hook.ts`, `evaluator-webhook.ts`, `webhook-ingestion.ts`

**Budget and cost**: `cost-calculator.ts`, `budget-alert-emitter.ts`

**Voice and meetings**: `speaking-agent.ts`, `meeting-transcription.ts`, `voicebox-client.ts`, `voicebox-mcp-registrar.ts`, `voxcpm2-client.ts`, `language-resolver.ts`

**MCP**: `mcp-protocol-client.ts`, `mcp-registry-client.ts`

**Supporting services**: `chat-service.ts`, `chat-routes.ts`, `web-research-service.ts`, `vision-service.ts`, `natural-language-parser.ts`, `effort-estimator.ts`, `package-manager-service.ts`, `routing-history-advisor.ts`, `escalation-engine.ts`

**Startup and smoke**: `main.ts`, `db-snapshot-smoke.ts`, `task-planner-smoke.ts`, `e2e-playwright-smoke.ts`

---

## Health check

```
GET /health        (on AF_HEALTH_PORT, default 4001)
```

Returns `200 {"status":"ok"}` when the service is ready. The Docker healthcheck polls this endpoint every 15 seconds.

```
GET /startup
```

Returns the startup state of the runtime instance.
