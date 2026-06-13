> **Status:** Sprint 18 complete. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the authoritative status tracker.
# AgentFarm Architecture â€” Full System

> Last updated: 2026-05-29 (Sprint 18)
> **Freshness (2026-06-13 audit):** Added since this doc was written: worker-runner, browser-agent and desktop-agent containers, the full voice/telephony stack (whisper, kokoro, xtts, mms-tts, voxcpm, freeswitch, zoom-video-sidecar, teams-media-bot - see VOICE_SYSTEM.md), and the sales/support/portal domains. docker-compose now defines 23 services. See the Technical Architecture Report in the audit set. Full verified inventory: [docs/audit/2026-06-13](audit/2026-06-13/README.md).
> AgentFarm â€” Multi-tenant AI agent platform with enterprise control gates, audit trails, and governed autonomy.

---

## Product Architecture Diagram (verified 2026-06-13)

```mermaid
flowchart TB
    subgraph surfaces["Customer surfaces"]
        WEB["Website (Next.js)<br/>signup · customer dashboard · portal"]
        DASH["Operator dashboard (Next.js :3001)<br/>approvals · audit · billing"]
        SDKC["SDK · CLI · API clients"]
    end
    subgraph channels["Inbound channels"]
        IN["Email (IMAP) · Slack · webhooks"]
    end

    WEB --> GW
    DASH -->|X-Dashboard-Token proxy| GW
    SDKC --> GW
    IN --> TRG["Trigger service :3002<br/>events → tasks"]

    GW["API gateway · Fastify :3000<br/>auth · billing · approvals · audit · 110 route files in 14 domains"]

    GW -->|HMAC shared tokens| RT
    TRG --> RT
    GW --> ORC["Orchestrator :3011<br/>GOAP A* planner · schedulers · handoffs"]
    GW --> WRK["Worker runner<br/>billing sweep · token lifecycle (when AF_WORKERS_DISABLED=1)"]
    ORC --> RT

    RT["Agent runtime :4000<br/>15 agents · risk classification · 12 action tiers · RAG flywheel"]

    subgraph caps["Action tiers & integrations"]
        LLM["LLM providers<br/>9 external + auto failover"]
        CON["Connector gateway<br/>23 tools · OAuth/mTLS"]
        AUTO["Browser + desktop agents<br/>Playwright · noVNC vision loop"]
        VOICE["Voice stack<br/>whisper STT · kokoro/xtts/mms TTS · FreeSWITCH · Zoom/Teams bots"]
    end
    RT --> LLM
    RT --> CON
    RT --> AUTO
    RT --> VOICE

    subgraph data["Data plane"]
        PG[("PostgreSQL 16 + pgvector<br/>105 models")]
        RD[("Redis 7<br/>cache · rate limits")]
        BLOB[("Azure Blob<br/>audit evidence")]
        OPA["OPA :8181<br/>policy engine"]
    end
    GW --- PG
    GW --- RD
    RT --- PG
    GW --- OPA
    RT --- BLOB
```

### Task lifecycle (verified 2026-06-13)

```mermaid
flowchart TB
    IN["Task intake<br/>UI · API · email · Slack · schedules"] --> PLAN["LLM planning<br/>role enforcer · RAG context injection"]
    PLAN --> RISK{"Risk classification<br/>confidence &lt; 0.6 escalates"}
    RISK -->|low| EXEC["Execute actions<br/>12 tiers · connectors · desktop"]
    RISK -->|medium · high| Q["Approval queue<br/>HMAC intake at gateway"]
    Q --> OP["Operator decision<br/>locked on re-decide (409) · latency tracked"]
    OP -->|approve| EXEC
    OP -->|reject| LESSON["Lesson pipeline<br/>classifyFeedback → AgentLongTermMemory"]
    EXEC --> EV["Evidence & audit<br/>screenshots · append-only AuditEvent"]
    EV --> LEARN["Learn & bill<br/>approved work → AgentKnowledgeBase · usage metering"]
```

---

## System Overview

AgentFarm is a TypeScript pnpm monorepo. It provides a production-grade platform for running AI agents inside enterprise teams. Every agent action passes through a risk classification pipeline, an approval gate, an audit log, and a compliance evidence chain before or after execution. The platform supports 12 agent roles, 8+ LLM providers, 18 external connectors, dual-provider payments (Stripe + Razorpay), Zoho Sign e-signature with auto-provisioning, Azure VM runtime provisioning, and a full voice/meeting pipeline.

---

## Monorepo Structure

```
d:\AgentFarm\
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ agent-runtime/        AI agent execution engine (Fastify, 12 roles, 8 LLMs, voice)
â”‚   â”‚   â””â”€â”€ src/              110+ source files â€” execution-engine, llm-decision-adapter,
â”‚   â”‚                         role-system-prompts, voicebox-client, voxcpm2-client,
â”‚   â”‚                         pre-task-scout, post-task-closeout, escalation-engine,
â”‚   â”‚                         skills-registry, multi-agent-orchestrator, speaking-agent
â”‚   â”œâ”€â”€ api-gateway/          Fastify control-plane backend (all business logic)
â”‚   â”‚   â””â”€â”€ src/
â”‚   â”‚       â”œâ”€â”€ routes/       75+ route files â€” auth, billing, approvals, audit, connectors,
â”‚   â”‚       â”‚                 admin-provision, zoho-sign-webhook, meetings, runtime-tasks,
â”‚   â”‚       â”‚                 governance-workflows, budget-policy, plugin-loading, ...
â”‚   â”‚       â”œâ”€â”€ services/     payment-service, provisioning-worker, contract-generator,
â”‚   â”‚       â”‚                 zoho-sign-client, connector-token-lifecycle-worker, ...
â”‚   â”‚       â””â”€â”€ lib/          session-auth, approval-packet, secret-store, rate-limit, ...
â”‚   â”œâ”€â”€ dashboard/            Ops dashboard (Next.js, approval queue, evidence panel)
â”‚   â”œâ”€â”€ orchestrator/         Multi-agent workflow coordinator (GOAP planner, scheduler)
â”‚   â”œâ”€â”€ trigger-service/      Slack/Email/Webhook trigger ingestion (Fastify, port 3002)
â”‚   â””â”€â”€ website/              Public website + admin portal (Next.js 15, port 3002)
â”‚       â””â”€â”€ app/
â”‚           â”œâ”€â”€ api/          43 API route groups (auth, billing, admin, webhooks, ...)
â”‚           â”œâ”€â”€ admin/        Admin billing, provisioning, user management pages
â”‚           â”œâ”€â”€ marketplace/  AI agent marketplace (179 agents, 29 departments)
â”‚           â””â”€â”€ ...           50+ more pages
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ db-schema/            Prisma schema (PostgreSQL) â€” 45+ models, 10+ migrations
â”‚   â”œâ”€â”€ shared-types/         100+ versioned TypeScript contracts, DesktopOperator interface
â”‚   â”œâ”€â”€ connector-contracts/  18-connector registry, 18 normalized action types
â”‚   â”œâ”€â”€ queue-contracts/      Queue event type definitions
â”‚   â”œâ”€â”€ observability/        Structured telemetry helpers
â”‚   â””â”€â”€ notification-service/ Email notification gateway
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ agent-observability/  Action interception, browser capture, correctness scoring
â”‚   â”œâ”€â”€ agent-question-service/ Async agent Q&A with human teammates
â”‚   â”œâ”€â”€ approval-service/     Approval enforcement, kill-switch, governance workflow manager
â”‚   â”œâ”€â”€ audit-storage/        Azure Blob screenshot uploader, evidence persistence
â”‚   â”œâ”€â”€ browser-actions/      Playwright browser action executor
â”‚   â”œâ”€â”€ compliance-export/    JSON/CSV compliance packs, 365-day/730-day retention
â”‚   â”œâ”€â”€ connector-gateway/    OAuth, token refresh, adapter registry, mTLS cert verifier
â”‚   â”œâ”€â”€ evidence-service/     Governance KPI calculator, HNSW vector search
â”‚   â”œâ”€â”€ identity-service/     Tenant/workspace/user lifecycle
â”‚   â”œâ”€â”€ meeting-agent/        Meeting lifecycle state machine, STT/TTS adapters
â”‚   â”œâ”€â”€ memory-service/       Long-term memory store with TTL and relevance ranking
â”‚   â”œâ”€â”€ notification-service/ Telegram/Slack/Discord/Webhook/Voice approval alerts
â”‚   â”œâ”€â”€ policy-engine/        Governance routing policy resolution
â”‚   â”œâ”€â”€ provisioning-service/ Azure VM lifecycle, 11-step state machine, SLA monitoring
â”‚   â””â”€â”€ retention-cleanup/    Scheduled retention cleanup job
â”œâ”€â”€ infrastructure/
â”‚   â”œâ”€â”€ control-plane/        Azure Bicep IaC for control-plane resources
â”‚   â””â”€â”€ runtime-plane/        Azure ARM + Bicep + cloud-init for VM provisioning
â”œâ”€â”€ docker/
â”‚   â””â”€â”€ voxcpm2/              VoxCPM2 TTS + voice cloning (openbmb/VoxCPM2) Docker service
â”œâ”€â”€ packages/db-schema/       Prisma schema, migrations
â”œâ”€â”€ docker-compose.yml        PostgreSQL 16, Redis 7, VoxCPM2
â”œâ”€â”€ pnpm-workspace.yaml       Monorepo workspace config
â””â”€â”€ .env.example              All environment variables with placeholders
```

---

## Data Flow Diagrams

### Customer Journey Flow

```
                              DISCOVERY PATH
                              â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  Website Visit
       â”‚
       â”œâ”€â–º Contact Form â”€â”€â–º CRM (Sales Rep Agent) â”€â”€â–º Discovery Call
       â”‚                                                     â”‚
       â”‚                                              Quote Generated
       â”‚
                              SELF-SERVE PATH
                              â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  Website Visit
       â”‚
       â”œâ”€â–º Marketplace â”€â”€â–º Select Plan â”€â”€â–º Payment
       â”‚                                      â”‚
       â”‚              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
       â”‚              â”‚                       â”‚
       â”‚         India (INR)           International
       â”‚         Razorpay              Stripe
       â”‚              â”‚                       â”‚
       â”‚              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚                          â”‚
       â”‚                   Webhook Received
       â”‚                   (HMAC verified)
       â”‚                          â”‚
       â”‚                  Order marked PAID
       â”‚                  Invoice created
       â”‚                          â”‚
       â”‚              Contract PDF generated (pdfkit)
       â”‚                          â”‚
       â”‚              Uploaded to Zoho Sign
       â”‚              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚              â”‚   Document Request         â”‚
       â”‚              â”‚   Recipient: customer      â”‚
       â”‚              â”‚   E-signature required     â”‚
       â”‚              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚                          â”‚
       â”‚              Customer signs (Zoho Sign UI)
       â”‚                          â”‚
       â”‚              Zoho Sign Webhook fires â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º POST /api/webhooks/zoho-sign
       â”‚                          â”‚                                  â”‚
       â”‚                  Order: signatureStatus=signed      ProvisioningJob created
       â”‚                          â”‚                           status: queued
       â”‚                          â”‚
       â”‚              ProvisioningWorker picks up job
       â”‚              11-step Azure VM state machine:
       â”‚              queued â†’ validating â†’ creating_resources
       â”‚                   â†’ configuring_network â†’ deploying_vm
       â”‚                   â†’ installing_runtime â†’ registering_bot
       â”‚                   â†’ health_checking â†’ completed
       â”‚                          â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º Customer Dashboard shows live status
```

### Agent Execution Flow

```
  Trigger Sources
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  Slack message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  Email received â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
  Webhook POST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â–º Trigger Service (port 3002)
  Teams message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤         â”‚
  API call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â”‚
                                    â–¼
                             Trigger Router
                             (workspace lookup,
                              rate limiting)
                                    â”‚
                                    â–¼
                             API Gateway (port 3000)
                             /v1/tasks  POST
                                    â”‚
                                    â–¼
                             Agent Runtime
                             â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                             â”‚  Pre-Task Scout                   â”‚
                             â”‚  (codebase scan, context load)    â”‚
                             â”‚              â”‚                    â”‚
                             â”‚              â–¼                    â”‚
                             â”‚  LLM Decision Adapter             â”‚
                             â”‚  (role prompt + task envelope)    â”‚
                             â”‚              â”‚                    â”‚
                             â”‚     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”‚
                             â”‚     â”‚ Risk Classificationâ”‚         â”‚
                             â”‚     â”‚  low â”‚ medium â”‚highâ”‚         â”‚
                             â”‚     â””â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”¬â”€â”€â”€â”˜         â”‚
                             â”‚        â”‚       â”‚    â”‚             â”‚
                             â”‚        â–¼       â–¼    â–¼             â”‚
                             â”‚     Execute  Approval  Escalate   â”‚
                             â”‚     (async)  Queue     (human)    â”‚
                             â”‚        â”‚                          â”‚
                             â”‚        â–¼                          â”‚
                             â”‚  LLM Provider (8 options)         â”‚
                             â”‚  OpenAIâ”‚Anthropicâ”‚Googleâ”‚xAI      â”‚
                             â”‚  Mistralâ”‚Togetherâ”‚AzureOAIâ”‚Auto   â”‚
                             â”‚        â”‚                          â”‚
                             â”‚        â–¼                          â”‚
                             â”‚  Post-Task Closeout               â”‚
                             â”‚  (evidence, memory, skills)       â”‚
                             â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â”‚
                                        â–¼
                             Reply Dispatcher
                             (Slack/Email/Teams/Webhook)
```

### Voice Pipeline

```
  Audio Input (microphone / meeting recording)
          â”‚
          â–¼
  Voicebox MCP Client
  (transcription via Whisper-compatible API)
          â”‚
          â–¼
  Transcript text
          â”‚
          â–¼
  LLM (Speaking Agent role)
  (processes query, generates response)
          â”‚
          â–¼
  VoxCPM2 TTS Client
  (openbmb/VoxCPM2 â€” Docker service)
  voice cloning â”‚ prosody control â”‚ SSML
          â”‚
          â–¼
  Audio Output (stream / file / meeting channel)
```

### Approval Flow

```
  Agent Action Decision
          â”‚
          â”œâ”€â”€â”€ LOW RISK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º Execute immediately
          â”‚                                      â”‚
          â”‚                               Audit event logged
          â”‚
          â”œâ”€â”€â”€ MEDIUM RISK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º Approval queue (API Gateway)
          â”‚                                      â”‚
          â”‚                           Notification dispatched
          â”‚                           (Slack/Telegram/Webhook)
          â”‚                                      â”‚
          â”‚                       Human approves or rejects
          â”‚                                      â”‚
          â”‚                       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
          â”‚                       â”‚ APPROVED                  â”‚ REJECTED
          â”‚                       â”‚ Execute + audit           â”‚ Audit + notify
          â”‚                       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â””â”€â”€â”€ HIGH RISK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º Approval queue
                                   + escalation after 1 hour SLA
                                   + kill-switch can block all
```

---

## Database Schema

All models are in `packages/db-schema/prisma/schema.prisma`. PostgreSQL 16.

### Auth & Identity
| Model | Purpose |
|---|---|
| `Tenant` | Top-level org account |
| `TenantUser` | User belonging to a tenant |
| `Workspace` | A workspace within a tenant |
| `Bot` | An AI bot bound to a workspace |

### Provisioning & Runtime
| Model | Purpose |
|---|---|
| `ProvisioningJob` | Azure VM provisioning job (11-step state machine) |
| `RuntimeInstance` | Running bot Docker container state |
| `BotCapabilitySnapshot` | Point-in-time capability snapshot of a bot |

### Agent Execution
| Model | Purpose |
|---|---|
| `AgentSession` | Session context for an agent run |
| `AgentShortTermMemory` | Working context memory (TTL-bound) |
| `AgentLongTermMemory` | Crystallized long-term memory (relevance ranking) |
| `AgentRepoKnowledge` | Indexed repo knowledge graph entries |
| `TaskExecutionRecord` | Full task execution record with evidence |
| `ActionRecord` | Individual agent action within a task |

### Approval & Governance
| Model | Purpose |
|---|---|
| `Approval` | Approval record (immutable after decision) |
| `AuditEvent` | Append-only audit log entry |
| `RetentionPolicy` | Data retention rules per tenant |

### Connectors
| Model | Purpose |
|---|---|
| `ConnectorAuthMetadata` | OAuth app credentials per connector |
| `ConnectorAuthSession` | Active OAuth token for a user/connector |
| `ConnectorAuthEvent` | Lifecycle event (grant, refresh, revoke) |
| `ConnectorAction` | Normalized action execution record |

### Workspace State
| Model | Purpose |
|---|---|
| `WorkspaceSessionState` | Persistent IDE/workspace session context |
| `WorkspaceCheckpoint` | Snapshot of workspace state at a point in time |
| `DesktopProfile` | Desktop operator config for a workspace |
| `IdeState` | IDE open files, cursor, selection state |
| `TerminalSession` | Terminal session tracking |
| `EnvProfile` | Environment variable profile for a workspace |

### Developer Workflow
| Model | Purpose |
|---|---|
| `DesktopAction` | Desktop/browser action record |
| `PrDraft` | Pull request draft created by agent |
| `CiTriageReport` | CI failure triage analysis |
| `WorkMemory` | Short-lived per-task work notes |
| `RunResume` | Checkpoint for resuming an interrupted run |
| `ReproPack` | Repro package for a bug/issue |
| `ActivityEvent` | User/agent activity event stream |
| `BrowserActionEvent` | Browser automation event captured |

### Intelligence
| Model | Purpose |
|---|---|
| `AgentQuestion` | Question sent to human by agent (async Q&A) |
| `TenantMcpServer` | MCP tool server registration per tenant |

### Language & Localisation
| Model | Purpose |
|---|---|
| `TenantLanguageConfig` | Preferred language for a tenant |
| `WorkspaceLanguageConfig` | Language override per workspace |
| `UserLanguageProfile` | Per-user language preference |

### Voice & Meetings
| Model | Purpose |
|---|---|
| `MeetingSession` | Meeting transcription session lifecycle |

### Billing & Payments
| Model | Purpose |
|---|---|
| `Plan` | Subscription plan (name, priceInr, priceUsd, agentSlots, features) |
| `Order` | Payment order with Zoho Sign contract fields |
| `Invoice` | Invoice generated after payment |

---

## API Gateway Routes

Full reference in [API.md](API.md).

### Route Groups (75+ route files)

| Group | Prefix | Purpose |
|---|---|---|
| auth | `/v1/auth` | Login, signup, session management |
| billing | `/v1/billing` | Orders, webhooks (Stripe/Razorpay), plans |
| admin-provision | `/v1/admin/provision` | Manual VM provisioning trigger |
| zoho-sign-webhook | `/v1/webhooks/zoho-sign` | Zoho Sign completion webhook |
| approvals | `/v1/approvals` | Approval queue CRUD |
| audit | `/v1/audit` | Audit log query |
| connectors | `/v1/connectors` | Connector auth and action dispatch |
| meetings | `/v1/meetings` | Meeting session lifecycle |
| runtime-tasks | `/v1/tasks` | Agent task lease and execution |
| governance-workflows | `/v1/governance` | Governance policy management |
| budget-policy | `/v1/budget` | Budget limit enforcement |
| language | `/v1/language` | Language config |
| plugin-loading | `/v1/plugins` | Plugin manifest and loading |
| mcp-registry | `/v1/mcp` | MCP tool server registration |
| observability | `/v1/observability` | Metrics and health |
| memory | `/v1/memory` | Agent memory read/write |
| webhooks | `/v1/webhooks` | Generic inbound webhook ingestion |

---

## Agent Runtime

### 12 Agent Roles
1. `developer` â€” code writing, refactoring, review
2. `fullstack_developer` â€” end-to-end feature implementation
3. `tester` â€” test writing, coverage analysis
4. `business_analyst` â€” requirements, specs, acceptance criteria
5. `technical_writer` â€” documentation, API docs
6. `content_writer` â€” marketing copy, blog posts
7. `sales_rep` â€” lead qualification, CRM updates
8. `marketing_specialist` â€” campaign planning, analytics
9. `corporate_assistant` â€” internal ops, scheduling
10. `recruiter` â€” candidate qualification, outreach
11. `devops` â€” infrastructure, CI/CD, deployment
12. `data_analyst` â€” data queries, reporting, dashboards

### 8 LLM Providers
| Provider | Mode |
|---|---|
| OpenAI (GPT-4o, o3-mini) | Direct API |
| Azure OpenAI | Deployment endpoint |
| GitHub Models | github.com/marketplace/models |
| Anthropic (Claude Sonnet/Opus) | Direct API |
| Google (Gemini Pro/Flash) | Direct API |
| xAI (Grok) | Direct API |
| Mistral | Direct API |
| Together AI | Hosted open models |
| Auto | Health-score failover across all providers |

### Key Engine Components
- **Pre-task scout** â€” scans codebase, loads relevant context before LLM call
- **Post-task closeout** â€” writes evidence, updates memory, crystallizes skills
- **Escalation engine** â€” triggers on confidence < 0.6 or high-risk classification
- **Language injection** â€” resolves tenant/workspace/user language into system prompt
- **Memory system** â€” short-term (TTL), long-term (relevance ranking), repo knowledge graph
- **Skills crystallization** (Hermes pattern) â€” successful runs become reusable skill templates
- **Multi-agent orchestrator** â€” coordinating parallel agent task execution

---

## Voice System

- **Voicebox** â€” MCP-integrated transcription service (Whisper-compatible, `VOICEBOX_URL`)
- **VoxCPM2** â€” TTS + voice cloning Docker container (`openbmb/VoxCPM2`, `VOXCPM2_MODEL_ID`)
- **Meeting transcription pipeline** â€” join meeting â†’ capture audio â†’ transcribe â†’ process â†’ respond â†’ speak
- **Speaking agent** â€” dedicated agent role that generates spoken responses
- **MCP registration** â€” `voicebox-mcp-registrar.ts` auto-registers Voicebox at startup

---

## Payment System

Full reference in [PAYMENTS.md](PAYMENTS.md).

### Flow
```
Customer checkout
       â”‚
       â”œâ”€ India â”€â”€â–º Razorpay order â”€â”€â–º client SDK â”€â”€â–º webhook (/v1/billing/webhook/razorpay)
       â”‚                                                        â”‚
       â””â”€ International â”€â”€â–º Stripe intent â”€â”€â–º client SDK â”€â”€â–º webhook (/v1/billing/webhook/stripe)
                                                               â”‚
                                                    HMAC/signature verified
                                                               â”‚
                                                   Order: status = paid
                                                   Invoice record created
                                                               â”‚
                                                    setImmediate (non-blocking)
                                                               â”‚
                                               pdfkit contract PDF generated
                                                               â”‚
                                               Uploaded to Zoho Sign (multipart)
                                                               â”‚
                                               submitDocumentForSigning()
                                                               â”‚
                                          Order: zohoSignRequestId, contractSentAt, signatureStatus=sent
                                                               â”‚
                                                  Customer signs in Zoho Sign UI
                                                               â”‚
                                              POST /v1/webhooks/zoho-sign
                                              (x-zoho-webhook-token verified)
                                                               â”‚
                                          Order: signatureStatus=signed, signedAt
                                                               â”‚
                                              ProvisioningJob created (queued)
                                                               â”‚
                                           Provisioning worker â†’ Azure VM â†’ done
```

---

## Infrastructure

- **Azure ARM Provisioning Worker** â€” `apps/api-gateway/src/services/provisioning-worker.ts` â€” polls `queued` jobs, drives 11-step state machine
- **Bicep IaC** â€” `infrastructure/control-plane/` and `infrastructure/runtime-plane/` â€” declarative Azure resources
- **cloud-init** â€” VM bootstrap script installs Docker, pulls agent container, configures environment
- **Docker Compose** â€” `docker-compose.yml` â€” PostgreSQL 16, Redis 7
- **VoxCPM2 Docker** â€” `docker/voxcpm2/` â€” TTS voice synthesis service
- **OPA Policy Engine** â€” `OPA_BASE_URL` â€” Open Policy Agent for governance decisions
- **Redis** â€” `REDIS_URL` â€” session cache, rate limiting, task queue

---

## Security

- **HMAC-SHA256 session tokens** â€” `buildSessionToken` / `verifySessionToken` in `lib/session-auth.ts`
- **Zoho Sign webhook verification** â€” `x-zoho-webhook-token` header compared against `ZOHO_SIGN_WEBHOOK_TOKEN`
- **Stripe webhook verification** â€” `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`
- **Razorpay webhook verification** â€” HMAC-SHA256 of `order_id|payment_id` against `RAZORPAY_KEY_SECRET`
- **OPA policies** â€” governance rules evaluated per action request
- **Connector OAuth** â€” CSRF nonce validation, token stored as Key Vault references (no inline secrets)
- **mTLS certificate verifier** â€” `connector-gateway` verifies agent federation requests
- **PII-strip middleware** â€” strips sensitive fields from connector action payloads in logs
- **Rate limiting** â€” `lib/rate-limit.ts` in api-gateway
- **Scope enforcement** â€” `scope: 'internal'` required for admin routes, `scope: 'customer'` for user routes

---

## Testing Strategy

Full reference in [TESTING.md](TESTING.md).

| Package | Framework | Tests | Command |
|---|---|---|---|
| `@agentfarm/agent-runtime` | `node:test` | 906 | `pnpm --filter @agentfarm/agent-runtime test` |
| `@agentfarm/api-gateway` | `node:test` | 898 | `pnpm --filter @agentfarm/api-gateway test` |
| `@agentfarm/dashboard` | `node:test` | 118 | `pnpm --filter @agentfarm/dashboard test` |
| `@agentfarm/website` | `node:test` | 118 | `pnpm --filter @agentfarm/website test` |
| `@agentfarm/orchestrator` | `node:test` | 62 | `pnpm --filter @agentfarm/orchestrator test` |
| `@agentfarm/trigger-service` | `node:test` | 49 | `pnpm --filter @agentfarm/trigger-service test` |
| All other services | `node:test` | 200+ | per-package |

**Key patterns:**
- `t.mock.method(globalThis, 'fetch', ...)` â€” fetch mocking for HTTP calls
- Optional `prisma?` parameter on route handlers â€” injected mock Prisma in tests
- `Fastify().inject()` â€” full HTTP round-trip tests without a running server
- Coverage enforced â‰¥ 80% on execution-engine, runtime-server, provisioning-monitoring
