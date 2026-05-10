# AgentFarm File Inventory

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Complete file-by-file inventory of all source files in the AgentFarm monorepo.  
Excludes: `node_modules/`, `dist/`, `.next/`, `.git/`, `build/`, `generated/`, `migrations/`.  
Total TypeScript source files (approximate): 1,971.

---

## Table of Contents

1. [Root](#root)
2. [apps/agent-runtime](#appsagent-runtime)
3. [apps/api-gateway](#appsapi-gateway)
4. [apps/dashboard](#appsdashboard)
5. [apps/orchestrator](#appsorchestrator)
6. [apps/trigger-service](#appstrigger-service)
7. [apps/website](#appswebsite)
8. [services/agent-observability](#servicesagent-observability)
9. [services/agent-question-service](#servicesagent-question-service)
10. [services/approval-service](#servicesapproval-service)
11. [services/audit-storage](#servicesaudit-storage)
12. [services/browser-actions](#servicesbrowser-actions)
13. [services/compliance-export](#servicescompliance-export)
14. [services/connector-gateway](#servicesconnector-gateway)
15. [services/evidence-service](#servicesevidence-service)
16. [services/identity-service](#servicesidentity-service)
17. [services/meeting-agent](#servicesmeeting-agent)
18. [services/memory-service](#servicesmemory-service)
19. [services/notification-service](#servicesnotification-service)
20. [services/policy-engine](#servicespolicy-engine)
21. [services/provisioning-service](#servicesprovisioning-service)
22. [services/retention-cleanup](#servicesretention-cleanup)
23. [packages/connector-contracts](#packagesconnector-contracts)
24. [packages/db-schema](#packagesdb-schema)
25. [packages/observability](#packagesobservability)
26. [packages/queue-contracts](#packagesqueue-contracts)
27. [packages/shared-types](#packagesshared-types)
28. [infrastructure](#infrastructure)
29. [scripts](#scripts)
30. [tools](#tools)

---

## Root

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `docker-compose.yml` | root | Docker Compose config for local dev | postgres:16, redis:7, voxcpm2 services | Local dependency stack |
| `package.json` | root | Root monorepo manifest | Scripts: `quality:gate`, `test`, `build`, `lint`, `typecheck` | pnpm workspace root |
| `pnpm-lock.yaml` | root | Lockfile for all workspace packages | — | Deterministic installs |
| `pnpm-workspace.yaml` | root | Workspace package globs | `apps/*`, `services/*`, `packages/*` | pnpm monorepo definition |
| `tsconfig.base.json` | root | Shared TypeScript config | `strict: true`, `target: ES2022`, `moduleResolution: NodeNext` | All packages extend this |
| `walkthrough.mjs` | root | Interactive developer walkthrough script | CLI steps for local dev setup | Onboarding script |
| `walkthrough.ps1` | root | PowerShell version of walkthrough | Same as `.mjs` for Windows devs | Windows developer onboarding |
| `README.md` | root | Monorepo readme | Links to docs, quick-start | Developer entry point |
| `read.md` | root | NOT FOUND — needs investigation | — | — |

---

## apps/agent-runtime

Fastify server (port 3003) that runs agent tasks, manages LLM providers, executes workspace actions, and persists evidence.

### src/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/agent-runtime/src/main.ts` | agent-runtime | Server entry point | Starts Fastify, registers routes, binds port | Runtime process start |
| `apps/agent-runtime/src/runtime-server.ts` | agent-runtime | Fastify app factory and route registration | `buildRuntimeServer()`, `/run-task`, `/health` | Core agent HTTP server |
| `apps/agent-runtime/src/runtime-server.test.ts` | agent-runtime | Tests for runtime server routes | — | Route coverage |
| `apps/agent-runtime/src/execution-engine.ts` | agent-runtime | Action router and risk classifier | `executeAction()`, `HIGH_RISK_ACTIONS`, `MEDIUM_RISK_ACTIONS`, `processOneTask()` | Dispatches agent actions by type and risk level |
| `apps/agent-runtime/src/execution-engine.test.ts` | agent-runtime | Unit tests for action routing and risk | — | Execution engine coverage |
| `apps/agent-runtime/src/llm-decision-adapter.ts` | agent-runtime | Multi-provider LLM client with health failover | `callLLM()`, `getProviderHealth()`, provider cooldown persistence | Abstracts 8+ LLM providers |
| `apps/agent-runtime/src/llm-decision-adapter.test.ts` | agent-runtime | Tests for provider selection and failover | — | LLM adapter coverage |
| `apps/agent-runtime/src/role-system-prompts.ts` | agent-runtime | 12-role system prompt definitions | `getRoleSystemPrompt(roleKey, repoName?)`, role prompt map | Drives agent personality and constraints |
| `apps/agent-runtime/src/role-system-prompts.test.ts` | agent-runtime | Tests for prompt retrieval | — | Prompt regression coverage |
| `apps/agent-runtime/src/pre-task-scout.ts` | agent-runtime | Pre-task workspace reconnaissance | `runPreTaskScout()`, `SCOUT_TRIGGER_ACTIONS` | Reduces hallucination by scouting workspace before code changes |
| `apps/agent-runtime/src/pre-task-scout.test.ts` | agent-runtime | Tests for scout behavior | — | Scout coverage |
| `apps/agent-runtime/src/escalation-engine.ts` | agent-runtime | Decides when a task should escalate to human | `shouldEscalate()`, 5 escalation reasons | Prevents agent loops from running indefinitely |
| `apps/agent-runtime/src/escalation-engine.test.ts` | agent-runtime | Tests for escalation conditions | — | Escalation coverage |
| `apps/agent-runtime/src/prisma-memory-store.ts` | agent-runtime | Agent short/long-term memory via Prisma | `readMemoryForTask()`, `writeMemoryAfterTask()`, `getRepoKnowledge()` | Persists agent context across tasks |
| `apps/agent-runtime/src/prisma-memory-store.test.ts` | agent-runtime | Tests for memory read/write | — | Memory store coverage |
| `apps/agent-runtime/src/language-resolver.ts` | agent-runtime | Multi-language output detection and resolution | `resolveLanguage()`, `detectTextLanguage()`, `getOutputLanguage()` | Routes agent replies in correct human language |
| `apps/agent-runtime/src/language-resolver.test.ts` | agent-runtime | Tests for language detection cascade | — | Language resolver coverage |
| `apps/agent-runtime/src/post-task-closeout.ts` | agent-runtime | Post-task housekeeping and evidence packaging | `runPostTaskCloseout()`, `buildApprovalPacket()` | Ensures every task ends with an evidence bundle |
| `apps/agent-runtime/src/post-task-closeout.test.ts` | agent-runtime | Tests for closeout and packet generation | — | Closeout coverage |
| `apps/agent-runtime/src/desktop-operator-factory.ts` | agent-runtime | Factory for desktop/browser operator | `getDesktopOperator()` | Selects mock/native/playwright based on env |
| `apps/agent-runtime/src/desktop-operator-playwright.ts` | agent-runtime | Playwright-based browser automation operator | `PlaywrightDesktopOperator` | Real browser actions for non-API connectors |
| `apps/agent-runtime/src/browser-action-executor.ts` | agent-runtime | Fire-and-forget browser action runner | `executeBrowserAction()` | Browser fallback for tasks without direct API |
| `apps/agent-runtime/src/action-result-contract.ts` | agent-runtime | TypeScript type for action result records | `ActionResultRecord` interface | Shared contract for all action outputs |
| `apps/agent-runtime/src/action-result-writer.ts` | agent-runtime | Writes action results to Prisma | `writeActionResult()` | Persists all agent action outcomes |
| `apps/agent-runtime/src/action-result-writer.test.ts` | agent-runtime | Tests for result writing | — | Writer coverage |
| `apps/agent-runtime/src/action-observability.ts` | agent-runtime | Emits observability events for each action | `emitActionEvent()`, telemetry hooks | Sends structured telemetry to observability pipeline |
| `apps/agent-runtime/src/action-observability.test.ts` | agent-runtime | Tests for observability emission | — | Observability coverage |
| `apps/agent-runtime/src/autonomous-coding-loop.ts` | agent-runtime | Self-contained code iteration loop | `runAutonomousCodingLoop()` | Enables agents to write, test, and fix code autonomously |
| `apps/agent-runtime/src/autonomous-coding-loop.test.ts` | agent-runtime | Tests for coding loop behavior | — | Loop coverage |
| `apps/agent-runtime/src/autonomous-loop-orchestrator.ts` | agent-runtime | Coordinates multiple autonomous coding loops | `AutonomousLoopOrchestrator` | Manages parallel agent coding sessions |
| `apps/agent-runtime/src/autonomous-loop-orchestrator.test.ts` | agent-runtime | Tests for orchestrator coordination | — | Orchestrator coverage |
| `apps/agent-runtime/src/evidence-assembler.ts` | agent-runtime | Assembles evidence bundles from action records | `assembleEvidence()`, `EvidenceBundle` | Compiles screenshots, diffs, and diffs for approvals |
| `apps/agent-runtime/src/evidence-assembler.test.ts` | agent-runtime | Tests for evidence assembly | — | Evidence coverage |
| `apps/agent-runtime/src/evidence-record-contract.ts` | agent-runtime | TypeScript types for evidence records | `EvidenceRecord` interface | Shared contract for audit evidence |
| `apps/agent-runtime/src/evidence-record-writer.ts` | agent-runtime | Writes evidence records to Prisma | `writeEvidenceRecord()` | Persists evidence for compliance |
| `apps/agent-runtime/src/evidence-record-writer.test.ts` | agent-runtime | Tests for evidence writing | — | Evidence writer coverage |
| `apps/agent-runtime/src/evaluator-webhook.ts` | agent-runtime | Sends task results to external evaluator | `notifyEvaluator()` | Hooks external QA/scoring systems |
| `apps/agent-runtime/src/evaluator-webhook.test.ts` | agent-runtime | Tests for evaluator webhook | — | Evaluator coverage |
| `apps/agent-runtime/src/local-workspace-executor.ts` | agent-runtime | Runs shell commands in local workspace | `LocalWorkspaceExecutor`, `runCommand()` | Executes code edits, builds, tests in local env |
| `apps/agent-runtime/src/local-workspace-executor.test.ts` | agent-runtime | Tests for workspace command execution | — | Executor coverage |
| `apps/agent-runtime/src/task-planner.ts` | agent-runtime | Breaks tasks into subtask plans | `planTask()`, `TaskPlan` | Enables multi-step agent planning |
| `apps/agent-runtime/src/plan-executor.ts` | agent-runtime | Executes a TaskPlan step-by-step | `executePlan()` | Walks plan steps, calls execution engine per step |
| `apps/agent-runtime/src/planner-loop.ts` | agent-runtime | Outer loop: plan → execute → evaluate | `runPlannerLoop()` | Full agent think-act-evaluate cycle |
| `apps/agent-runtime/src/task-intelligence-memory.ts` | agent-runtime | Stores and retrieves task-specific insights | `TaskIntelligenceMemory` | Prevents redundant re-discovery on repeated tasks |
| `apps/agent-runtime/src/task-intelligence-memory.test.ts` | agent-runtime | Tests for task memory | — | Memory coverage |
| `apps/agent-runtime/src/task-progress-reporter.ts` | agent-runtime | SSE-based task progress emission | `TaskProgressReporter`, `emitProgress()` | Real-time progress updates to dashboard |
| `apps/agent-runtime/src/task-progress-reporter.test.ts` | agent-runtime | Tests for progress reporting | — | Reporter coverage |
| `apps/agent-runtime/src/skills-registry.ts` | agent-runtime | Registry of all available agent skills | `SkillsRegistry`, `registerSkill()`, `getSkill()` | Central catalog of what the agent can do |
| `apps/agent-runtime/src/skills-registry.test.ts` | agent-runtime | Tests for skill registration | — | Registry coverage |
| `apps/agent-runtime/src/skill-execution-engine.ts` | agent-runtime | Executes individual skills from registry | `executeSkill()` | Runs a named skill with typed input/output |
| `apps/agent-runtime/src/skill-execution-engine.test.ts` | agent-runtime | Tests for skill execution | — | Skill execution coverage |
| `apps/agent-runtime/src/skill-execution-engine-extended.test.ts` | agent-runtime | Extended edge-case tests for skill execution | — | Extended coverage |
| `apps/agent-runtime/src/skill-composition-engine.ts` | agent-runtime | Composes multiple skills into pipelines | `SkillCompositionEngine` | Enables multi-skill workflows |
| `apps/agent-runtime/src/skill-composition-engine.test.ts` | agent-runtime | Tests for skill composition | — | Composition coverage |
| `apps/agent-runtime/src/skill-pipeline.ts` | agent-runtime | Defines ordered skill pipeline execution | `SkillPipeline`, `runPipeline()` | Sequential skill execution with context passing |
| `apps/agent-runtime/src/skill-pipeline.test.ts` | agent-runtime | Tests for pipeline execution | — | Pipeline coverage |
| `apps/agent-runtime/src/skill-scheduler.ts` | agent-runtime | Schedules skills on time or event triggers | `SkillScheduler`, `scheduleSkill()` | Cron-like skill invocation |
| `apps/agent-runtime/src/skill-scheduler.test.ts` | agent-runtime | Tests for skill scheduling | — | Scheduler coverage |
| `apps/agent-runtime/src/skill-dependency-dag.ts` | agent-runtime | Dependency graph for skill ordering | `SkillDependencyDAG`, `topologicalSort()` | Ensures skills execute in correct order |
| `apps/agent-runtime/src/skill-dependency-dag.test.ts` | agent-runtime | Tests for DAG ordering | — | DAG coverage |
| `apps/agent-runtime/src/multi-agent-orchestrator.ts` | agent-runtime | Coordinates parallel sub-agent spawning | `MultiAgentOrchestrator`, `spawnSubagent()` | Enables multi-agent collaborative tasks |
| `apps/agent-runtime/src/multi-agent-orchestrator.test.ts` | agent-runtime | Tests for multi-agent coordination | — | Orchestrator coverage |
| `apps/agent-runtime/src/mcp-registry-client.ts` | agent-runtime | Client for MCP server registry | `McpRegistryClient`, `registerServer()`, `getServers()` | Allows runtime to discover and use MCP tools |
| `apps/agent-runtime/src/repo-knowledge-graph.ts` | agent-runtime | Builds and queries repo knowledge graph | `RepoKnowledgeGraph`, `indexRepo()`, `query()` | Gives agent structural understanding of the codebase |
| `apps/agent-runtime/src/repo-knowledge-graph.test.ts` | agent-runtime | Tests for knowledge graph | — | Graph coverage |
| `apps/agent-runtime/src/provider-state-persistence.ts` | agent-runtime | Persists LLM provider health state to disk | `saveProviderState()`, `loadProviderState()` | Survives process restarts without losing cooldown state |
| `apps/agent-runtime/src/provider-state-persistence.test.ts` | agent-runtime | Tests for state persistence | — | Persistence coverage |
| `apps/agent-runtime/src/system-prompt-builder.ts` | agent-runtime | Builds dynamic system prompts | `buildSystemPrompt()` | Combines role + repo + task context into final system prompt |
| `apps/agent-runtime/src/system-prompt-builder.test.ts` | agent-runtime | Tests for prompt building | — | Builder coverage |
| `apps/agent-runtime/src/code-review-learning.ts` | agent-runtime | Learns from code review feedback | `CodeReviewLearning`, `recordFeedback()` | Improves agent code quality over time |
| `apps/agent-runtime/src/code-review-learning.test.ts` | agent-runtime | Tests for review learning | — | Learning coverage |
| `apps/agent-runtime/src/loop-learning-store.ts` | agent-runtime | Stores loop iteration outcomes for learning | `LoopLearningStore` | Tracks what worked/failed in past loops |
| `apps/agent-runtime/src/effort-estimator.ts` | agent-runtime | Estimates task effort before execution | `estimateEffort()`, `EffortEstimate` | Helps scheduler and planner prioritize |
| `apps/agent-runtime/src/effort-estimator.test.ts` | agent-runtime | Tests for effort estimation | — | Estimator coverage |
| `apps/agent-runtime/src/package-manager-service.ts` | agent-runtime | Detects and runs package manager commands | `PackageManagerService`, `install()`, `runScript()` | Supports npm/yarn/pnpm in workspace tasks |
| `apps/agent-runtime/src/package-manager-service.test.ts` | agent-runtime | Tests for package manager detection | — | PM coverage |
| `apps/agent-runtime/src/web-research-service.ts` | agent-runtime | Performs web search and page fetch for agent | `webSearch()`, `fetchPage()` | Gives agent internet access for research tasks |
| `apps/agent-runtime/src/web-research-service.test.ts` | agent-runtime | Tests for web research | — | Research coverage |
| `apps/agent-runtime/src/vision-service.ts` | agent-runtime | Analyzes screenshots with vision LLM | `analyzeScreenshot()` | Powers screenshot-based action verification |
| `apps/agent-runtime/src/vision-service.test.ts` | agent-runtime | Tests for vision analysis | — | Vision coverage |
| `apps/agent-runtime/src/voicebox-client.ts` | agent-runtime | Client for TTS/voice services | `VoiceboxClient`, `speak()` | Provides voice output for meeting/speaking agents |
| `apps/agent-runtime/src/voicebox-client.test.ts` | agent-runtime | Tests for voicebox client | — | Client coverage |
| `apps/agent-runtime/src/voxcpm2-client.ts` | agent-runtime | Client for local voxcpm2 TTS server | `Voxcpm2Client`, `synthesize()` | Local offline TTS via Docker container |
| `apps/agent-runtime/src/voxcpm2-client.test.ts` | agent-runtime | Tests for voxcpm2 client | — | Client coverage |
| `apps/agent-runtime/src/voicebox-mcp-registrar.ts` | agent-runtime | Registers voicebox as MCP tool | `registerVoiceboxMcp()` | Makes voice available to MCP-aware agents |
| `apps/agent-runtime/src/speaking-agent.ts` | agent-runtime | Agent that participates in voice meetings | `SpeakingAgent`, `joinMeeting()`, `speak()` | Powers live meeting participation |
| `apps/agent-runtime/src/speaking-agent.test.ts` | agent-runtime | Tests for speaking agent | — | Agent coverage |
| `apps/agent-runtime/src/meeting-transcription.ts` | agent-runtime | Transcribes meeting audio to text | `transcribeMeeting()` | Converts meeting audio for agent comprehension |
| `apps/agent-runtime/src/meeting-transcription.test.ts` | agent-runtime | Tests for transcription | — | Transcription coverage |
| `apps/agent-runtime/src/wake-coalescer.ts` | agent-runtime | Coalesces rapid wake signals to one task start | `WakeCoalescer`, `coalesce()` | Prevents duplicate task triggers on rapid events |
| `apps/agent-runtime/src/wake-coalescer.test.ts` | agent-runtime | Tests for wake coalescing | — | Coalescer coverage |
| `apps/agent-runtime/src/webhook-ingestion.ts` | agent-runtime | Ingests incoming webhook events | `ingestWebhook()` | Accepts external triggers (GitHub, Slack, etc.) |
| `apps/agent-runtime/src/webhook-ingestion.test.ts` | agent-runtime | Tests for webhook ingestion | — | Ingestion coverage |
| `apps/agent-runtime/src/workspace-rate-limiter.ts` | agent-runtime | Per-workspace action rate limiting | `WorkspaceRateLimiter`, `checkLimit()` | Prevents runaway agent action storms |
| `apps/agent-runtime/src/workspace-rate-limiter.test.ts` | agent-runtime | Tests for rate limiting | — | Rate limiter coverage |
| `apps/agent-runtime/src/agent-feedback.ts` | agent-runtime | Collects and processes human feedback on agent actions | `recordFeedback()` | Closes feedback loop for agent quality improvement |
| `apps/agent-runtime/src/agent-feedback.test.ts` | agent-runtime | Tests for feedback collection | — | Feedback coverage |
| `apps/agent-runtime/src/notification-hook.ts` | agent-runtime | Sends notifications on task events | `notifyOnTaskEvent()` | Triggers notifications when task state changes |
| `apps/agent-runtime/src/crm-hook.ts` | agent-runtime | CRM integration hook for agent actions | `notifyCrm()` | Writes agent activity to CRM systems |
| `apps/agent-runtime/src/erp-hook.ts` | agent-runtime | ERP integration hook for agent actions | `notifyErp()` | Writes agent activity to ERP systems |
| `apps/agent-runtime/src/structured-telemetry-collector.ts` | agent-runtime | Collects structured telemetry for observability | `collectTelemetry()` | Sends typed telemetry events to observability stack |
| `apps/agent-runtime/src/runtime-audit-integration.ts` | agent-runtime | Integrates runtime with audit log writer | `auditRuntimeAction()` | Ensures every runtime action has an audit trail |
| `apps/agent-runtime/src/llm-quality-tracker.ts` | agent-runtime | Tracks LLM output quality over time | `trackQuality()`, `QualityRecord` | Identifies provider degradation and model drift |
| `apps/agent-runtime/src/tester-agent-profile.ts` | agent-runtime | Specialized profile for tester agent role | `TESTER_AGENT_PROFILE` | Configuration constants for tester agent |
| `apps/agent-runtime/src/advanced-runtime-features.ts` | agent-runtime | Extended/experimental runtime capabilities | NOT FOUND — needs investigation | Advanced feature flags or experimental integrations |
| `apps/agent-runtime/src/desktop-action-governance.test.ts` | agent-runtime | Tests for desktop action governance | — | Desktop governance coverage |
| `apps/agent-runtime/src/db-snapshot-smoke.ts` | agent-runtime | DB snapshot smoke test runner | `runDbSnapshotSmoke()` | Validates DB state after startup |
| `apps/agent-runtime/src/e2e-playwright-smoke.ts` | agent-runtime | End-to-end Playwright smoke test | `runE2ESmoke()` | Full browser automation smoke validation |
| `apps/agent-runtime/src/task-planner-smoke.ts` | agent-runtime | Smoke test for task planner | `runTaskPlannerSmoke()` | Quick sanity check for planner integration |
| `apps/agent-runtime/src/config/notification-config.ts` | agent-runtime | Notification channel configuration | `NOTIFICATION_CONFIG` | Centralizes notification routing rules |
| `apps/agent-runtime/src/__tests__/desktop-operator-factory.test.ts` | agent-runtime | Tests for desktop operator factory selection | — | Factory coverage |

---

## apps/api-gateway

Fastify v5 server (port 3000). Central HTTP gateway for all dashboard, website, and agent runtime communication.

### src/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/api-gateway/src/main.ts` | api-gateway | Server entry point | Starts Fastify, registers all 75+ route files, starts background workers | Gateway process start |
| `apps/api-gateway/src/agent-runtime-stubs.ts` | api-gateway | Stub implementations for agent runtime calls | `AgentRuntimeStubs` | Enables testing without live agent runtime |

### src/lib/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/api-gateway/src/lib/session-auth.ts` | api-gateway | HMAC-SHA256 session token build/verify | `buildSessionToken()`, `verifySessionToken()` | Secure stateless sessions |
| `apps/api-gateway/src/lib/approval-packet.ts` | api-gateway | Parses structured approval packet fields | `parseApprovalPacket()`, `ApprovalPacket` | Extracts structured data from agent approval payloads |
| `apps/api-gateway/src/lib/approval-packet.test.ts` | api-gateway | Tests for approval packet parsing | — | Parser coverage |
| `apps/api-gateway/src/lib/db.ts` | api-gateway | Prisma client singleton | `prisma` | Shared DB client for all gateway routes |
| `apps/api-gateway/src/lib/password.ts` | api-gateway | Argon2 password hashing/verification | `hashPassword()`, `verifyPassword()` | Secure password handling for auth |
| `apps/api-gateway/src/lib/rate-limit.ts` | api-gateway | Basic rate limiter middleware | `rateLimit()` | Protects endpoints from abuse |
| `apps/api-gateway/src/lib/rate-limit-v2.ts` | api-gateway | Sliding window rate limiter v2 | `rateLimitV2()` | More precise rate limiting implementation |
| `apps/api-gateway/src/lib/azure-client.ts` | api-gateway | Azure SDK client wrappers | `AzureClient` | Wraps Azure ARM/resource provisioning calls |
| `apps/api-gateway/src/lib/internal-login-policy.ts` | api-gateway | Login policy enforcement for internal users | `enforceInternalLoginPolicy()` | Controls internal user login rules |
| `apps/api-gateway/src/lib/run-recovery-worker.ts` | api-gateway | Background worker for run recovery | `RunRecoveryWorker` | Restarts interrupted agent runs after crashes |
| `apps/api-gateway/src/lib/secret-store.ts` | api-gateway | Secrets management abstraction | `getSecret()`, `setSecret()` | Centralizes secret retrieval from env/vault |
| `apps/api-gateway/src/lib/vm-bootstrap.ts` | api-gateway | VM bootstrap helpers for provisioning | `bootstrapVm()` | Shared VM setup logic used in provisioning |
| `apps/api-gateway/src/lib/provider-clients.ts` | api-gateway | LLM provider client factories | `getOpenAiClient()`, `getAnthropicClient()`, etc. | Gateway-side LLM clients for config validation |
| `apps/api-gateway/src/lib/provider-clients.test.ts` | api-gateway | Tests for provider client factories | — | Client coverage |

### src/routes/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/api-gateway/src/routes/auth.ts` | api-gateway | Login, logout, signup, session routes | `POST /auth/login`, `POST /auth/signup`, `POST /auth/logout`, `GET /auth/session` | User authentication |
| `apps/api-gateway/src/routes/auth.test.ts` | api-gateway | Tests for auth routes | — | Auth route coverage |
| `apps/api-gateway/src/routes/auth.internal-login-policy.test.ts` | api-gateway | Tests for internal login policy in auth | — | Policy coverage |
| `apps/api-gateway/src/routes/internal-login-policy.ts` | api-gateway | Internal login policy route handler | `POST /auth/internal-login-policy` | Enforces IP/MFA rules for internal users |
| `apps/api-gateway/src/routes/internal-login-policy.test.ts` | api-gateway | Tests for internal policy route | — | Policy route coverage |
| `apps/api-gateway/src/routes/approvals.ts` | api-gateway | Approval queue CRUD and decision routes | `GET /approvals`, `POST /approvals/:id/decision`, `GET /approvals/:id/packet` | Human-in-the-loop approval flow |
| `apps/api-gateway/src/routes/approvals.test.ts` | api-gateway | Tests for approval routes | — | Approval route coverage |
| `apps/api-gateway/src/routes/runtime-tasks.ts` | api-gateway | Task submission and status routes | `POST /runtime/tasks`, `GET /runtime/tasks/:id`, `DELETE /runtime/tasks/:id` | Agent task lifecycle management |
| `apps/api-gateway/src/routes/runtime-tasks.test.ts` | api-gateway | Tests for task routes | — | Task route coverage |
| `apps/api-gateway/src/routes/runtime-tasks.lease-concurrency.test.ts` | api-gateway | Tests for task lease concurrency control | — | Concurrency safety coverage |
| `apps/api-gateway/src/routes/billing.ts` | api-gateway | Billing, plan, order, invoice routes | `GET /billing/plans`, `POST /billing/orders`, `POST /billing/webhook` | Payment and subscription management |
| `apps/api-gateway/src/routes/audit.ts` | api-gateway | Audit log query routes | `GET /audit`, `GET /audit/:id` | Compliance audit trail access |
| `apps/api-gateway/src/routes/audit.test.ts` | api-gateway | Tests for audit routes | — | Audit route coverage |
| `apps/api-gateway/src/routes/connector-auth.ts` | api-gateway | OAuth connector auth initiation and callback | `GET /connectors/:type/auth`, `GET /connectors/:type/callback` | Starts OAuth flow for connectors |
| `apps/api-gateway/src/routes/connector-auth.test.ts` | api-gateway | Tests for connector OAuth routes | — | Auth route coverage |
| `apps/api-gateway/src/routes/connector-actions.ts` | api-gateway | Proxy routes for connector actions | `POST /connectors/:type/actions/:action` | Forwards action calls to connector-gateway |
| `apps/api-gateway/src/routes/connector-actions.test.ts` | api-gateway | Tests for connector action proxying | — | Action proxy coverage |
| `apps/api-gateway/src/routes/connector-health.ts` | api-gateway | Connector health status routes | `GET /connectors/health` | Reports connector availability |
| `apps/api-gateway/src/routes/admin-provision.ts` | api-gateway | Admin provisioning control routes | `POST /admin/provision`, `GET /admin/provision/:jobId` | Admin-triggered workspace/tenant provisioning |
| `apps/api-gateway/src/routes/admin-provision.test.ts` | api-gateway | Tests for admin provisioning | — | Admin route coverage |
| `apps/api-gateway/src/routes/activity-events.ts` | api-gateway | Activity event query routes | `GET /activity`, `GET /activity/:workspaceId` | Workspace activity feed |
| `apps/api-gateway/src/routes/activity-events.test.ts` | api-gateway | Tests for activity routes | — | Activity coverage |
| `apps/api-gateway/src/routes/adapter-registry.ts` | api-gateway | Connector adapter registration routes | `GET /adapters`, `POST /adapters/register` | Dynamic connector adapter management |
| `apps/api-gateway/src/routes/agent-feedback.ts` | api-gateway | Agent feedback submission routes | `POST /agent-feedback` | Collects human feedback on agent actions |
| `apps/api-gateway/src/routes/autonomous-loops.ts` | api-gateway | Autonomous loop management routes | `POST /loops`, `GET /loops/:id`, `DELETE /loops/:id` | Start/stop/query autonomous loops |
| `apps/api-gateway/src/routes/budget-policy.ts` | api-gateway | Token budget policy routes | `GET /budget-policy`, `PUT /budget-policy` | Configure LLM token spend limits |
| `apps/api-gateway/src/routes/budget-policy.test.ts` | api-gateway | Tests for budget policy routes | — | Policy coverage |
| `apps/api-gateway/src/routes/ci-failures.ts` | api-gateway | CI failure triage routes | `GET /ci-failures`, `POST /ci-failures/:id/triage` | Reports CI failures to agents |
| `apps/api-gateway/src/routes/ci-failures.test.ts` | api-gateway | Tests for CI failure routes | — | CI route coverage |
| `apps/api-gateway/src/routes/desktop-actions.ts` | api-gateway | Desktop/browser action routes | `POST /desktop/actions`, `GET /desktop/sessions/:id` | Desktop action submission and session retrieval |
| `apps/api-gateway/src/routes/desktop-actions.test.ts` | api-gateway | Tests for desktop action routes | — | Desktop coverage |
| `apps/api-gateway/src/routes/desktop-profile.ts` | api-gateway | Desktop profile CRUD routes | `GET /desktop/profiles`, `POST /desktop/profiles` | Manages desktop operator profiles |
| `apps/api-gateway/src/routes/desktop-profile.test.ts` | api-gateway | Tests for desktop profile routes | — | Profile coverage |
| `apps/api-gateway/src/routes/env-reconciler.ts` | api-gateway | Environment variable reconciliation routes | `POST /env/reconcile` | Syncs workspace env vars to expected state |
| `apps/api-gateway/src/routes/env-reconciler.test.ts` | api-gateway | Tests for env reconciler | — | Reconciler coverage |
| `apps/api-gateway/src/routes/governance-kpis.ts` | api-gateway | Governance KPI query routes | `GET /governance/kpis` | Surfaces governance metrics to dashboard |
| `apps/api-gateway/src/routes/governance-workflows.ts` | api-gateway | Governance workflow routes | `GET /governance/workflows`, `POST /governance/workflows` | Manages approval workflow definitions |
| `apps/api-gateway/src/routes/governance-workflows.test.ts` | api-gateway | Tests for governance workflow routes | — | Workflow coverage |
| `apps/api-gateway/src/routes/handoffs.ts` | api-gateway | Agent-to-human handoff routes | `POST /handoffs`, `GET /handoffs/:id` | Escalates tasks to human operators |
| `apps/api-gateway/src/routes/handoffs.test.ts` | api-gateway | Tests for handoff routes | — | Handoff coverage |
| `apps/api-gateway/src/routes/ide-state.ts` | api-gateway | IDE state persistence routes | `GET /ide-state/:workspaceId`, `PUT /ide-state/:workspaceId` | Saves/restores editor state per workspace |
| `apps/api-gateway/src/routes/ide-state.test.ts` | api-gateway | Tests for IDE state routes | — | IDE state coverage |
| `apps/api-gateway/src/routes/knowledge-graph.ts` | api-gateway | Knowledge graph query routes | `GET /knowledge-graph/:workspaceId` | Exposes repo knowledge graph to dashboard |
| `apps/api-gateway/src/routes/language.ts` | api-gateway | Language configuration routes | `GET /language/:workspaceId`, `PUT /language/:workspaceId` | Per-workspace/tenant language settings |
| `apps/api-gateway/src/routes/language.test.ts` | api-gateway | Tests for language routes | — | Language route coverage |
| `apps/api-gateway/src/routes/mcp-registry.ts` | api-gateway | MCP server registry routes | `GET /mcp-servers`, `POST /mcp-servers`, `DELETE /mcp-servers/:id` | Tenant MCP server management |
| `apps/api-gateway/src/routes/meetings.ts` | api-gateway | Meeting session routes | `POST /meetings`, `GET /meetings/:id` | Meeting session lifecycle |
| `apps/api-gateway/src/routes/meetings.test.ts` | api-gateway | Tests for meeting routes | — | Meeting coverage |
| `apps/api-gateway/src/routes/memory.ts` | api-gateway | Agent memory CRUD routes | `GET /memory/:workspaceId`, `POST /memory/:workspaceId` | Read/write agent memory via API |
| `apps/api-gateway/src/routes/observability.ts` | api-gateway | Observability data routes | `GET /observability/metrics`, `GET /observability/traces` | Runtime metrics and trace access |
| `apps/api-gateway/src/routes/observability.test.ts` | api-gateway | Tests for observability routes | — | Observability coverage |
| `apps/api-gateway/src/routes/plugin-loading.ts` | api-gateway | Plugin loading and management routes | `POST /plugins/load`, `GET /plugins` | Dynamic plugin system for connector extensions |
| `apps/api-gateway/src/routes/plugin-loading.test.ts` | api-gateway | Tests for plugin loading | — | Plugin coverage |
| `apps/api-gateway/src/routes/pull-requests.ts` | api-gateway | Pull request management routes | `POST /prs`, `GET /prs/:id`, `PATCH /prs/:id` | Agent-created PR tracking |
| `apps/api-gateway/src/routes/pull-requests.test.ts` | api-gateway | Tests for PR routes | — | PR coverage |
| `apps/api-gateway/src/routes/questions.ts` | api-gateway | Agent question/clarification routes | `GET /questions`, `POST /questions/:id/answer` | Human answers agent clarification requests |
| `apps/api-gateway/src/routes/questions.test.ts` | api-gateway | Tests for question routes | — | Question coverage |
| `apps/api-gateway/src/routes/repro-packs.ts` | api-gateway | Reproduction pack routes | `GET /repro-packs`, `POST /repro-packs` | Creates and retrieves bug reproduction packs |
| `apps/api-gateway/src/routes/repro-packs.test.ts` | api-gateway | Tests for repro pack routes | — | Repro coverage |
| `apps/api-gateway/src/routes/retention-policy.ts` | api-gateway | Retention policy CRUD routes | `GET /retention-policies`, `POST /retention-policies` | Manages data retention rules |
| `apps/api-gateway/src/routes/roles.ts` | api-gateway | Bot role management routes | `GET /roles`, `POST /roles`, `PUT /roles/:id` | Agent role assignment per workspace |
| `apps/api-gateway/src/routes/roles.test.ts` | api-gateway | Tests for role routes | — | Role coverage |
| `apps/api-gateway/src/routes/runtime-llm-config.ts` | api-gateway | LLM provider configuration routes | `GET /runtime/llm-config`, `PUT /runtime/llm-config` | Per-workspace LLM provider overrides |
| `apps/api-gateway/src/routes/runtime-llm-config.test.ts` | api-gateway | Tests for LLM config routes | — | Config coverage |
| `apps/api-gateway/src/routes/skill-composition-execute.ts` | api-gateway | Skill composition execution routes | `POST /skills/compose/execute` | Triggers composed skill pipeline execution |
| `apps/api-gateway/src/routes/skill-pipelines.ts` | api-gateway | Skill pipeline CRUD routes | `GET /skill-pipelines`, `POST /skill-pipelines` | Manages named skill pipelines |
| `apps/api-gateway/src/routes/skill-scheduler.ts` | api-gateway | Skill scheduler routes | `POST /skill-scheduler/schedule` | Schedules skills via API |
| `apps/api-gateway/src/routes/snapshots.ts` | api-gateway | Workspace snapshot routes | `POST /snapshots`, `GET /snapshots/:id` | Workspace state snapshots for rollback |
| `apps/api-gateway/src/routes/snapshots.test.ts` | api-gateway | Tests for snapshot routes | — | Snapshot coverage |
| `apps/api-gateway/src/routes/sse-tasks.ts` | api-gateway | Server-sent events for task progress | `GET /tasks/:id/sse` | Real-time task progress stream to clients |
| `apps/api-gateway/src/routes/sse-tasks.test.ts` | api-gateway | Tests for SSE task stream | — | SSE coverage |
| `apps/api-gateway/src/routes/webhooks.ts` | api-gateway | Webhook management routes | `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id` | Outbound webhook registration and delivery |
| `apps/api-gateway/src/routes/webhooks.test.ts` | api-gateway | Tests for webhook routes | — | Webhook coverage |
| `apps/api-gateway/src/routes/work-memory.ts` | api-gateway | Work memory (in-flight context) routes | `GET /work-memory/:taskId`, `POST /work-memory/:taskId` | Stores active task working context |
| `apps/api-gateway/src/routes/work-memory.test.ts` | api-gateway | Tests for work memory routes | — | Work memory coverage |
| `apps/api-gateway/src/routes/workspace-session.ts` | api-gateway | Workspace session state routes | `GET /workspaces/:id/session`, `PUT /workspaces/:id/session` | Manages workspace session state |
| `apps/api-gateway/src/routes/workspace-session.test.ts` | api-gateway | Tests for workspace session routes | — | Session coverage |
| `apps/api-gateway/src/routes/zoho-sign-webhook.ts` | api-gateway | ZohoSign webhook receiver | `POST /billing/zoho-sign-webhook` | Receives contract signature events from ZohoSign |
| `apps/api-gateway/src/routes/zoho-sign-webhook.test.ts` | api-gateway | Tests for ZohoSign webhook | — | Webhook coverage |
| `apps/api-gateway/src/routes/api-routes.test.ts` | api-gateway | Integration tests for all API routes | — | Full route integration coverage |
| `apps/api-gateway/src/routes/sprint3-integration.test.ts` | api-gateway | Sprint 3 integration test suite | — | Sprint 3 regression coverage |
| `apps/api-gateway/src/routes/sprint4-integration.test.ts` | api-gateway | Sprint 4 integration test suite | — | Sprint 4 regression coverage |

### src/services/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/api-gateway/src/services/azure-provisioning-steps.ts` | api-gateway | Azure provisioning step definitions | `AZURE_PROVISIONING_STEPS` | Defines ordered steps for VM provisioning |
| `apps/api-gateway/src/services/provisioning-worker.ts` | api-gateway | Background provisioning job worker | `ProvisioningWorker`, `start()` | Processes provisioning jobs from queue |
| `apps/api-gateway/src/services/provisioning-monitoring.ts` | api-gateway | Monitors provisioning job health | `ProvisioningMonitor` | Alerts on stuck or failed provisioning jobs |
| `apps/api-gateway/src/services/provisioning-monitoring.test.ts` | api-gateway | Tests for provisioning monitoring | — | Monitor coverage |
| `apps/api-gateway/src/services/connector-token-lifecycle-worker.ts` | api-gateway | Background token refresh worker | `ConnectorTokenLifecycleWorker` | Keeps OAuth tokens fresh before expiry |
| `apps/api-gateway/src/services/connector-token-lifecycle-worker.test.ts` | api-gateway | Tests for token lifecycle | — | Token refresh coverage |
| `apps/api-gateway/src/services/connector-health-worker.ts` | api-gateway | Background connector health check worker | `ConnectorHealthWorker` | Polls connector endpoints for availability |
| `apps/api-gateway/src/services/connector-health-worker.test.ts` | api-gateway | Tests for health worker | — | Health check coverage |
| `apps/api-gateway/src/services/payment-service.ts` | api-gateway | Stripe and Razorpay payment processing | `PaymentService`, `createOrder()`, `processPayment()` | Handles payments for plan subscriptions |
| `apps/api-gateway/src/services/payment-service.test.ts` | api-gateway | Tests for payment service | — | Payment coverage |
| `apps/api-gateway/src/services/contract-generator.ts` | api-gateway | Generates PDF contracts for orders | `ContractGenerator`, `generateContract()` | Creates contract PDFs for ZohoSign signing |
| `apps/api-gateway/src/services/contract-generator.test.ts` | api-gateway | Tests for contract generation | — | Contract coverage |
| `apps/api-gateway/src/services/zoho-sign-client.ts` | api-gateway | ZohoSign API client | `ZohoSignClient`, `sendForSignature()`, `getStatus()` | Sends contracts to ZohoSign for e-signature |
| `apps/api-gateway/src/services/zoho-sign-client.test.ts` | api-gateway | Tests for ZohoSign client | — | Client coverage |
| `apps/api-gateway/src/services/run-recovery-worker.ts` | api-gateway | Background run recovery worker | `RunRecoveryWorker` | Recovers interrupted task runs after process restart |
| `apps/api-gateway/src/services/run-recovery-worker.test.ts` | api-gateway | Tests for run recovery | — | Recovery coverage |

### src/scripts/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/api-gateway/src/scripts/seed-plans.ts` | api-gateway | Seeds pricing plans into DB | `seedPlans()` | Initial plan data for Starter/Professional/Enterprise |

---

## apps/dashboard

Next.js 15 App Router dashboard (port 3001) for internal ops teams and workspace managers.

### app/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/dashboard/app/layout.tsx` | dashboard | Root layout with nav, sidebar, providers | `RootLayout` | Dashboard shell layout |
| `apps/dashboard/app/page.tsx` | dashboard | Main dashboard home page | `DashboardPage` — approval queue, agent status, metrics | Primary operator interface |
| `apps/dashboard/app/globals.css` | dashboard | Global CSS | Base styles, CSS variables | App-wide styling |
| `apps/dashboard/middleware.ts` | dashboard | Auth middleware | Session check, redirect to login | Protects all dashboard routes |
| `apps/dashboard/next.config.mjs` | dashboard | Next.js configuration | API rewrite rules, feature flags | Dashboard build config |

### app/components/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/dashboard/app/components/approval-queue-panel.tsx` | dashboard | Approval queue display with action drawer | `ApprovalQueuePanel`, approval table + detail drawer | Human review of agent approvals |
| `apps/dashboard/app/components/approval-queue-panel.test.ts` | dashboard | Tests for approval queue panel | — | Panel coverage |
| `apps/dashboard/app/components/approval-evidence-pagination.ts` | dashboard | Pagination logic for evidence viewer | `paginateEvidence()` | Paginated evidence browsing |
| `apps/dashboard/app/components/approval-evidence-pagination.test.ts` | dashboard | Tests for evidence pagination | — | Pagination coverage |
| `apps/dashboard/app/components/agent-chat-panel.tsx` | dashboard | Real-time agent chat interface | `AgentChatPanel` | Live chat with running agent |
| `apps/dashboard/app/components/agent-memory-pattern-panel.tsx` | dashboard | Memory pattern visualization | `AgentMemoryPatternPanel` | Shows agent memory usage patterns |
| `apps/dashboard/app/components/agent-question-panel.tsx` | dashboard | Agent clarification question panel | `AgentQuestionPanel` | Answer agent questions from dashboard |
| `apps/dashboard/app/components/audit/` — see audit page | — | — | — | — |
| `apps/dashboard/app/components/command-palette.tsx` | dashboard | Keyboard command palette | `CommandPalette` | Quick navigation and action triggering |
| `apps/dashboard/app/components/connector-config-panel.tsx` | dashboard | Connector configuration panel | `ConnectorConfigPanel` | Configure OAuth and API connectors |
| `apps/dashboard/app/components/connector-marketplace-panel.tsx` | dashboard | Connector marketplace browser | `ConnectorMarketplacePanel` | Browse and install connectors |
| `apps/dashboard/app/components/adapter-discovery-panel.tsx` | dashboard | Adapter discovery UI | `AdapterDiscoveryPanel` | Discover available runtime adapters |
| `apps/dashboard/app/components/copy-link-button.tsx` | dashboard | Copy-to-clipboard button | `CopyLinkButton` | Share links from dashboard |
| `apps/dashboard/app/components/cost-dashboard-panel.tsx` | dashboard | LLM token cost visualization | `CostDashboardPanel` | Track LLM spend per workspace |
| `apps/dashboard/app/components/dashboard-deep-link-bar.tsx` | dashboard | Deep-link navigation bar | `DashboardDeepLinkBar` | Direct links to workspace resources |
| `apps/dashboard/app/components/dashboard-mobile-shell.tsx` | dashboard | Mobile-responsive shell | `DashboardMobileShell` | Mobile layout for dashboard |
| `apps/dashboard/app/components/dashboard-navigation.ts` | dashboard | Navigation configuration logic | `getDashboardNavItems()` | Dynamic nav based on user permissions |
| `apps/dashboard/app/components/dashboard-navigation.test.ts` | dashboard | Tests for navigation logic | — | Nav coverage |
| `apps/dashboard/app/components/dashboard-tab-nav.tsx` | dashboard | Tab navigation component | `DashboardTabNav` | Tabbed view switching |
| `apps/dashboard/app/components/dashboard-tab-storage.ts` | dashboard | Persists active tab to localStorage | `saveActiveTab()`, `loadActiveTab()` | Tab state persistence across page loads |
| `apps/dashboard/app/components/dashboard-tab-storage.test.ts` | dashboard | Tests for tab storage | — | Tab storage coverage |
| `apps/dashboard/app/components/dashboard-workspace-switcher.tsx` | dashboard | Workspace switcher dropdown | `DashboardWorkspaceSwitcher` | Switch active workspace context |
| `apps/dashboard/app/components/empty-state.tsx` | dashboard | Empty state placeholder | `EmptyState` | Standard empty state UI |
| `apps/dashboard/app/components/evidence-compliance-panel.tsx` | dashboard | Evidence compliance view | `EvidenceCompliancePanel` | Shows compliance evidence per approval |
| `apps/dashboard/app/components/evidence-viewer.tsx` | dashboard | Evidence artifact viewer | `EvidenceViewer` | Display screenshots, diffs, test results |
| `apps/dashboard/app/components/governance-kpis-panel.tsx` | dashboard | Governance KPI charts | `GovernanceKpisPanel` | Displays approval rates, time-to-approve, risk scores |
| `apps/dashboard/app/components/governance-workflow-panel.tsx` | dashboard | Workflow definition viewer | `GovernanceWorkflowPanel` | Shows configured governance workflows |
| `apps/dashboard/app/components/health-ring.tsx` | dashboard | Circular health indicator | `HealthRing` | Visual health status for bots/connectors |
| `apps/dashboard/app/components/internal-skill-catalog-panel.tsx` | dashboard | Internal skill catalog browser | `InternalSkillCatalogPanel` | Lists all registered internal skills |
| `apps/dashboard/app/components/kanban-board-utils.ts` | dashboard | Kanban board data utilities | `groupByStatus()`, `reorderCards()` | Task kanban logic |
| `apps/dashboard/app/components/kanban-board-utils.test.ts` | dashboard | Tests for kanban utilities | — | Kanban coverage |
| `apps/dashboard/app/components/knowledge-graph-explorer.tsx` | dashboard | Visual knowledge graph explorer | `KnowledgeGraphExplorer` | Browse repo knowledge graph interactively |
| `apps/dashboard/app/components/kpi-animated-counter.tsx` | dashboard | Animated number counter for KPIs | `KpiAnimatedCounter` | Smooth KPI number transitions |
| `apps/dashboard/app/components/llm-config-panel.tsx` | dashboard | LLM provider configuration panel | `LlmConfigPanel` | Set per-workspace LLM provider and model |
| `apps/dashboard/app/components/metric-sparkline.tsx` | dashboard | Inline sparkline chart | `MetricSparkline` | Compact time-series for metric cards |
| `apps/dashboard/app/components/mission-mini-nav.tsx` | dashboard | Compact mission navigation | `MissionMiniNav` | Quick access to mission-critical pages |
| `apps/dashboard/app/components/operational-signal-timeline.tsx` | dashboard | Operational signal timeline display | `OperationalSignalTimeline` | Shows agent activity over time |
| `apps/dashboard/app/components/operational-signal-timeline.test.tsx` | dashboard | Tests for timeline component | — | Timeline coverage |
| `apps/dashboard/app/components/plugin-loading-panel.tsx` | dashboard | Plugin loading status panel | `PluginLoadingPanel` | Shows active plugin load state |
| `apps/dashboard/app/components/runtime-observability-panel.tsx` | dashboard | Runtime observability panel | `RuntimeObservabilityPanel` | Agent runtime metrics and traces |
| `apps/dashboard/app/components/runtime-observability-utils.ts` | dashboard | Utility functions for observability data | `formatMetric()`, `groupTraces()` | Data prep for observability panel |
| `apps/dashboard/app/components/runtime-observability-utils.test.ts` | dashboard | Tests for observability utilities | — | Utility coverage |
| `apps/dashboard/app/components/session-replay-loader.tsx` | dashboard | Loads session replay data | `SessionReplayLoader` | Fetches browser session recordings |
| `apps/dashboard/app/components/session-replay-timeline.tsx` | dashboard | Session replay timeline player | `SessionReplayTimeline` | Plays back browser automation sessions |
| `apps/dashboard/app/components/skill-invoke-panel.tsx` | dashboard | Skill manual invocation panel | `SkillInvokePanel` | Manually trigger skills from dashboard |
| `apps/dashboard/app/components/skill-marketplace-panel.tsx` | dashboard | Skill marketplace browser | `SkillMarketplacePanel` | Discover and install skills |
| `apps/dashboard/app/components/skill-search-panel.tsx` | dashboard | Skill search interface | `SkillSearchPanel` | Full-text search across skills |
| `apps/dashboard/app/components/webhook-manager-panel.tsx` | dashboard | Webhook management panel | `WebhookManagerPanel` | Create and manage outbound webhooks |
| `apps/dashboard/app/components/workspace-budget-panel.tsx` | dashboard | Workspace token budget UI | `WorkspaceBudgetPanel` | Set and monitor per-workspace budget limits |
| `apps/dashboard/app/components/workspace-budget-panel-utils.ts` | dashboard | Budget panel data utilities | `formatBudgetUsage()` | Data formatting for budget panel |
| `apps/dashboard/app/components/workspace-budget-panel-utils.test.ts` | dashboard | Tests for budget utilities | — | Budget utility coverage |

### app/api/ (proxy routes to api-gateway)

| File Path | Package | Purpose | Why It Exists |
|---|---|---|---|
| `apps/dashboard/app/api/runtime/route-handler-core.ts` | dashboard | Core proxy handler for runtime API calls | Shared proxy logic for all runtime routes |
| `apps/dashboard/app/api/runtime/route-handler-core.test.ts` | dashboard | Tests for core proxy handler | Handler coverage |
| `apps/dashboard/app/api/runtime/runtime-proxy-utils.ts` | dashboard | Utilities for runtime proxy requests | Auth forwarding, error normalization |
| `apps/dashboard/app/api/runtime/runtime-proxy-utils.test.ts` | dashboard | Tests for proxy utilities | Utility coverage |
| `apps/dashboard/app/api/approvals/batch/` | dashboard | Batch approval decision route | Bulk approve/reject |
| `apps/dashboard/app/api/approvals/decision/` | dashboard | Single approval decision route | Individual decision |
| `apps/dashboard/app/api/approvals/escalate/` | dashboard | Escalation route | Escalate to senior reviewer |
| `apps/dashboard/app/api/approvals/governance/` | dashboard | Governance workflow routes | Workflow-bound decisions |
| `apps/dashboard/app/api/approvals/plugins/` | dashboard | Plugin-gated approval routes | Plugin-filtered approvals |
| `apps/dashboard/app/api/auth/internal-login/` | dashboard | Internal login proxy | Dashboard internal session |
| `apps/dashboard/app/api/audit/` | dashboard | Audit log proxy routes | Compliance audit access |
| `apps/dashboard/app/api/marketplace/` | dashboard | Marketplace proxy routes | Skill/connector browsing |
| `apps/dashboard/app/api/questions/` | dashboard | Agent question answer routes | Answer agent clarifications |
| `apps/dashboard/app/api/workspaces/[workspaceId]/` | dashboard | Dynamic workspace routes | Per-workspace operations |

### app/ pages

| File Path | Package | Purpose |
|---|---|---|
| `apps/dashboard/app/agent-chat/page.tsx` | dashboard | Agent chat page |
| `apps/dashboard/app/audit/page.tsx` | dashboard | Audit log page |
| `apps/dashboard/app/audit/session-replay/` | dashboard | Session replay page |
| `apps/dashboard/app/connectors/page.tsx` | dashboard | Connector management page |
| `apps/dashboard/app/connector-marketplace/` | dashboard | Connector marketplace page |
| `apps/dashboard/app/cost-dashboard/` | dashboard | Cost dashboard page |
| `apps/dashboard/app/governance/page.tsx` | dashboard | Governance overview page |
| `apps/dashboard/app/governance/kpis/` | dashboard | Governance KPI page |
| `apps/dashboard/app/governance/plugins/` | dashboard | Governance plugin page |
| `apps/dashboard/app/internal/skills/` | dashboard | Internal skills catalog page |
| `apps/dashboard/app/knowledge-graph/` | dashboard | Knowledge graph explorer page |
| `apps/dashboard/app/login/` | dashboard | Login page |
| `apps/dashboard/app/marketplace/` | dashboard | Skill marketplace page |
| `apps/dashboard/app/provisioning/page.tsx` | dashboard | Provisioning management page |
| `apps/dashboard/app/signup/` | dashboard | Signup page |
| `apps/dashboard/app/skill-search/` | dashboard | Skill search page |
| `apps/dashboard/app/target/` | dashboard | Target workspace page |
| `apps/dashboard/app/webhooks/` | dashboard | Webhook management page |
| `apps/dashboard/app/adapters/` | dashboard | Adapter management page |

### app/lib/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/dashboard/app/lib/internal-session.ts` | dashboard | Internal session management | `getInternalSession()` | Dashboard internal auth session |
| `apps/dashboard/app/lib/marketplace-entitlements.ts` | dashboard | Entitlement checks for marketplace items | `checkEntitlement()` | Gates marketplace content behind plan |
| `apps/dashboard/app/lib/marketplace-entitlements.test.ts` | dashboard | Tests for entitlement checks | — | Entitlement coverage |

### scripts/

| File Path | Package | Purpose | Why It Exists |
|---|---|---|---|
| `apps/dashboard/scripts/mobile-drawer-e2e.mjs` | dashboard | E2E test for mobile drawer | Mobile navigation smoke test |
| `apps/dashboard/scripts/workspace-tab-e2e.mjs` | dashboard | E2E test for workspace tab | Tab switching smoke test |

---

## apps/orchestrator

Coordinates multi-agent tasks, schedules routines, and manages parallel task execution.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/orchestrator/src/main.ts` | orchestrator | Orchestrator service entry point | Starts Fastify, registers routes | Orchestrator process start |
| `apps/orchestrator/src/main.test.ts` | orchestrator | Tests for orchestrator startup | — | Startup coverage |
| `apps/orchestrator/src/goap-planner.ts` | orchestrator | GOAP-based multi-step task planner | `GoapPlanner`, `plan()` | Goal-Oriented Action Planning for complex tasks |
| `apps/orchestrator/src/goap-planner.test.ts` | orchestrator | Tests for GOAP planner | — | Planner coverage |
| `apps/orchestrator/src/parallel-task-manager.ts` | orchestrator | Manages parallel task execution | `ParallelTaskManager`, `runParallel()` | Concurrent agent task execution |
| `apps/orchestrator/src/parallel-task-manager.test.ts` | orchestrator | Tests for parallel task management | — | Parallel coverage |
| `apps/orchestrator/src/task-scheduler.ts` | orchestrator | Cron-based task scheduling | `TaskScheduler`, `schedule()`, `cancel()` | Time-based task triggers |
| `apps/orchestrator/src/task-scheduler.test.ts` | orchestrator | Tests for task scheduler | — | Scheduler coverage |
| `apps/orchestrator/src/routine-scheduler.ts` | orchestrator | Schedules recurring agent routines | `RoutineScheduler` | Daily/weekly standup, report generation |
| `apps/orchestrator/src/routine-scheduler.test.ts` | orchestrator | Tests for routine scheduler | — | Routine coverage |
| `apps/orchestrator/src/orchestrator-state-store.ts` | orchestrator | Persists orchestrator state | `OrchestratorStateStore` | Survives restarts without losing task state |
| `apps/orchestrator/src/orchestrator-state-store.test.ts` | orchestrator | Tests for state store | — | State coverage |
| `apps/orchestrator/src/agent-handoff-manager.ts` | orchestrator | Manages agent-to-agent handoffs | `AgentHandoffManager`, `handoff()` | Routes tasks between specialized agents |
| `apps/orchestrator/src/plugin-capability-guard.ts` | orchestrator | Guards capabilities behind plugin requirements | `PluginCapabilityGuard`, `check()` | Prevents capability use without required plugin |
| `apps/orchestrator/src/plugin-capability-guard.test.ts` | orchestrator | Tests for capability guard | — | Guard coverage |
| `apps/orchestrator/src/proactive-signal-detector.ts` | orchestrator | Detects signals to proactively start tasks | `ProactiveSignalDetector` | Triggers agent tasks based on environment signals |

---

## apps/trigger-service

Event ingestion and routing service. Routes external events (webhooks, Slack, email) to the correct agent runtime.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/trigger-service/src/main.ts` | trigger-service | Service entry point | Starts TriggerEngine | Trigger service process start |
| `apps/trigger-service/src/trigger-engine.ts` | trigger-service | Central event routing engine | `TriggerEngine`, `start()`, `stop()` | Wires sources → router → dispatcher |
| `apps/trigger-service/src/trigger-router.ts` | trigger-service | LLM-based multi-tenant event router | `TriggerRouter`, `route()` | Determines which tenant/agent handles an event |
| `apps/trigger-service/src/trigger-router.test.ts` | trigger-service | Tests for routing logic | — | Router coverage |
| `apps/trigger-service/src/trigger-dispatcher.ts` | trigger-service | Dispatches events to agent runtime | `TriggerDispatcher`, `dispatch()` | POSTs to agent runtime `/run-task` |
| `apps/trigger-service/src/trigger-dispatcher.test.ts` | trigger-service | Tests for dispatcher | — | Dispatcher coverage |
| `apps/trigger-service/src/reply-dispatcher.ts` | trigger-service | Routes agent replies back to source | `ReplyDispatcher`, `reply()` | Sends agent response to originating channel |
| `apps/trigger-service/src/reply-dispatcher.test.ts` | trigger-service | Tests for reply dispatcher | — | Reply coverage |
| `apps/trigger-service/src/config-loader.ts` | trigger-service | Loads trigger service config from env | `loadConfig()` | Config hydration at startup |
| `apps/trigger-service/src/types.ts` | trigger-service | TypeScript types for trigger events | `TriggerEvent`, `RoutingDecision` | Shared types for all trigger sources |
| `apps/trigger-service/src/sources/webhook-trigger.ts` | trigger-service | HTTP webhook event source | `WebhookTrigger`, HMAC-SHA256 verification | Receives GitHub/Jira/custom webhooks |
| `apps/trigger-service/src/sources/slack-trigger.ts` | trigger-service | Slack Events API source | `SlackTrigger`, challenge verification | Receives Slack messages and events |
| `apps/trigger-service/src/sources/email-trigger.ts` | trigger-service | IMAP email polling source | `EmailTrigger`, `EMAIL_POLL_INTERVAL_MS` | Receives tasks via email |

---

## apps/website

Next.js 15 App Router marketing website and customer portal (port 3002).

### app/ pages

| File Path | Package | Purpose |
|---|---|---|
| `apps/website/app/layout.tsx` | website | Root layout — Navbar, Footer, theme providers |
| `apps/website/app/page.tsx` | website | Homepage — hero, features, pricing, CTA |
| `apps/website/app/not-found.tsx` | website | Custom 404 page |
| `apps/website/app/robots.ts` | website | Robots.txt generation |
| `apps/website/app/sitemap.ts` | website | Sitemap.xml generation |
| `apps/website/app/opengraph-image.tsx` | website | OG image generation |
| `apps/website/app/pricing/page.tsx` | website | Pricing page with plan comparison |
| `apps/website/app/marketplace/page.tsx` | website | Bot marketplace browse page |
| `apps/website/app/marketplace/[slug]/` | website | Individual bot detail page |
| `apps/website/app/checkout/page.tsx` | website | Checkout page |
| `apps/website/app/checkout/billing/` | website | Billing details in checkout |
| `apps/website/app/onboarding/page.tsx` | website | Post-signup onboarding wizard |
| `apps/website/app/login/` | website | Login page |
| `apps/website/app/signup/` | website | Signup page |
| `apps/website/app/forgot-password/` | website | Password reset page |
| `apps/website/app/about/` | website | About page |
| `apps/website/app/blog/` | website | Blog listing and post pages |
| `apps/website/app/changelog/` | website | Changelog/release notes page |
| `apps/website/app/company/` | website | Company overview page |
| `apps/website/app/compare/` | website | Competitor comparison page |
| `apps/website/app/connectors/` | website | Connector catalog page |
| `apps/website/app/contact/` | website | Contact form page |
| `apps/website/app/customers/` | website | Customer stories page |
| `apps/website/app/dashboard/` | website | Customer dashboard redirect/frame |
| `apps/website/app/docs/` | website | Documentation pages |
| `apps/website/app/get-started/` | website | Get started guide |
| `apps/website/app/how-it-works/` | website | Product explainer page |
| `apps/website/app/privacy/` | website | Privacy policy page |
| `apps/website/app/product/` | website | Product feature pages |
| `apps/website/app/security/` | website | Security page |
| `apps/website/app/terms/` | website | Terms of service page |
| `apps/website/app/use-cases/` | website | Use case landing pages |
| `apps/website/app/book-demo/` | website | Book a demo form page |
| `apps/website/app/admin/page.tsx` | website | Admin panel home |
| `apps/website/app/admin/layout.tsx` | website | Admin layout |
| `apps/website/app/admin/audit/` | website | Admin audit log viewer |
| `apps/website/app/admin/billing/` | website | Admin billing management |
| `apps/website/app/admin/bots/` | website | Admin bot management |
| `apps/website/app/admin/integrations/` | website | Admin integration settings |
| `apps/website/app/admin/roles/` | website | Admin role management |
| `apps/website/app/admin/security/` | website | Admin security settings |
| `apps/website/app/admin/superadmin/page.tsx` | website | Superadmin control panel |
| `apps/website/app/admin/users/` | website | Admin user management |

### app/api/

| File Path | Package | Purpose |
|---|---|---|
| `apps/website/app/api/auth/login/` | website | Login API — dual-write to api-gateway |
| `apps/website/app/api/auth/logout/` | website | Logout API — clears cookies |
| `apps/website/app/api/auth/signup/` | website | Signup API — creates tenant + user |
| `apps/website/app/api/auth/session/` | website | Session check API |
| `apps/website/app/api/auth/forgot-password/` | website | Password reset initiation |
| `apps/website/app/api/billing/plans/` | website | Pricing plans fetch |
| `apps/website/app/api/billing/orders/` | website | Order creation |
| `apps/website/app/api/billing/create-order/` | website | Alternative order creation endpoint |
| `apps/website/app/api/billing/webhook/` | website | Payment webhook receiver (Stripe/Razorpay) |
| `apps/website/app/api/webhooks/zoho-sign/` | website | ZohoSign signature webhook |
| `apps/website/app/api/provisioning/process/` | website | Process provisioning request |
| `apps/website/app/api/provisioning/retry/` | website | Retry failed provisioning job |
| `apps/website/app/api/provisioning/status/` | website | Provisioning job status |
| `apps/website/app/api/marketplace/` | website | Marketplace data proxy |
| `apps/website/app/api/activity/` | website | Activity feed proxy |
| `apps/website/app/api/admin/` | website | Admin API proxy routes |
| `apps/website/app/api/approvals/` | website | Approvals proxy |
| `apps/website/app/api/audit/` | website | Audit log proxy |
| `apps/website/app/api/connectors/` | website | Connector management proxy |
| `apps/website/app/api/deployments/` | website | Deployment status proxy |
| `apps/website/app/api/evidence/` | website | Evidence proxy |
| `apps/website/app/api/onboarding/` | website | Onboarding step API |
| `apps/website/app/api/superadmin/overview/` | website | Superadmin overview stats |
| `apps/website/app/api/superadmin/tenants/` | website | Superadmin tenant management |
| `apps/website/app/api/superadmin/sessions/` | website | Superadmin session management |
| `apps/website/app/api/superadmin/logs/` | website | Superadmin log access |
| `apps/website/app/api/superadmin/fleet/` | website | Superadmin fleet management |
| `apps/website/app/api/superadmin/audit/` | website | Superadmin audit access |
| `apps/website/app/api/superadmin/billing/` | website | Superadmin billing view |
| `apps/website/app/api/superadmin/incidents/` | website | Superadmin incident management |
| `apps/website/app/api/superadmin/integrations/` | website | Superadmin integration management |

### components/

| File Path | Package | Purpose |
|---|---|---|
| `apps/website/components/home/Hero.tsx` | website | Homepage hero section with headline and CTA |
| `apps/website/components/home/HeroScene3D.tsx` | website | 3D animated hero scene |
| `apps/website/components/home/HeroScene3DCanvas.tsx` | website | Three.js/R3F canvas for 3D hero |
| `apps/website/components/home/Architecture.tsx` | website | Architecture diagram section |
| `apps/website/components/home/CallToAction.tsx` | website | CTA band component |
| `apps/website/components/home/DemoSection.tsx` | website | Product demo section |
| `apps/website/components/home/FAQ.tsx` | website | FAQ accordion |
| `apps/website/components/home/HowItWorks.tsx` | website | How it works steps |
| `apps/website/components/home/Integrations.tsx` | website | Integration logos grid |
| `apps/website/components/home/LogosStrip.tsx` | website | Customer/integration logo strip |
| `apps/website/components/home/MetricsTicker.tsx` | website | Animated metrics ticker |
| `apps/website/components/home/NewsletterCapture.tsx` | website | Newsletter signup form |
| `apps/website/components/home/PricingSection.tsx` | website | Homepage pricing cards |
| `apps/website/components/home/Problem.tsx` | website | Problem statement section |
| `apps/website/components/home/RobotTypes.tsx` | website | Agent role showcase |
| `apps/website/components/home/SocialProofBar.tsx` | website | Social proof/trust bar |
| `apps/website/components/home/Solution.tsx` | website | Solution section |
| `apps/website/components/home/StatsCounter.tsx` | website | Animated stats counters |
| `apps/website/components/home/TeamBuilderWizard.tsx` | website | Interactive team builder wizard |
| `apps/website/components/home/Testimonials.tsx` | website | Customer testimonials carousel |
| `apps/website/components/layout/Navbar.tsx` | website | Top navigation bar |
| `apps/website/components/layout/Footer.tsx` | website | Site footer |
| `apps/website/components/layout/MarketingShell.tsx` | website | Marketing page shell wrapper |
| `apps/website/components/layout/AppSidebar.tsx` | website | App/dashboard sidebar |
| `apps/website/components/layout/DocsSidebar.tsx` | website | Documentation sidebar |
| `apps/website/components/layout/MobileStickyCTA.tsx` | website | Mobile sticky CTA bar |
| `apps/website/components/shared/Button.tsx` | website | Shared button component |
| `apps/website/components/shared/ButtonLink.tsx` | website | Button styled as link |
| `apps/website/components/shared/CartIcon.tsx` | website | Shopping cart icon with badge |
| `apps/website/components/shared/CartProvider.tsx` | website | Cart state context provider |
| `apps/website/components/shared/CartSidebar.tsx` | website | Slide-out cart sidebar |
| `apps/website/components/shared/AddToCartButton.tsx` | website | Add to cart button |
| `apps/website/components/shared/CommandPalette.tsx` | website | Site-wide command palette |
| `apps/website/components/shared/ContactForm.tsx` | website | Contact form component |
| `apps/website/components/shared/CookieConsent.tsx` | website | Cookie consent banner |
| `apps/website/components/shared/MotionProvider.tsx` | website | Framer Motion context provider |
| `apps/website/components/shared/MultiStepForm.tsx` | website | Multi-step form wizard |
| `apps/website/components/shared/PremiumIcon.tsx` | website | Premium/Pro tier icon |
| `apps/website/components/shared/ScrollToTop.tsx` | website | Scroll to top button |
| `apps/website/components/shared/ThemeProvider.tsx` | website | Dark/light theme context provider |
| `apps/website/components/shared/ThemeToggle.tsx` | website | Theme toggle button |
| `apps/website/components/shared/ToastProvider.tsx` | website | Toast notification provider |
| `apps/website/components/shared/WaitlistForm.tsx` | website | Waitlist signup form |
| `apps/website/components/pricing/PricingCalculator.tsx` | website | Interactive pricing calculator |
| `apps/website/components/product/ProductDemoVideo.tsx` | website | Product demo video embed |
| `apps/website/components/product/ProductSceneSection.tsx` | website | Product scene highlight section |
| `apps/website/components/marketplace/MarketplaceGrid.tsx` | website | Bot/skill marketplace grid |
| `apps/website/components/marketplace/BotDetailClient.tsx` | website | Bot detail page client component |
| `apps/website/components/marketplace/MarketplaceDeployButton.tsx` | website | Deploy bot from marketplace button |
| `apps/website/components/dashboard/ActivityFeed.tsx` | website | Activity feed for customer dashboard |
| `apps/website/components/dashboard/ApprovalsQueue.tsx` | website | Approvals queue in customer dashboard |
| `apps/website/components/dashboard/DeploymentHistoryTable.tsx` | website | Deployment history table |
| `apps/website/components/dashboard/DeploymentStatusPanel.tsx` | website | Deployment status panel |
| `apps/website/components/dashboard/EvidenceCompliancePanel.tsx` | website | Evidence compliance panel |
| `apps/website/components/dashboard/ProvisioningOpsPanel.tsx` | website | Provisioning ops panel |
| `apps/website/components/dashboard/ProvisioningProgressCard.tsx` | website | Provisioning progress card |
| `apps/website/components/dashboard/RiskyActionTrigger.tsx` | website | Risky action trigger display |

### lib/

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `apps/website/lib/auth-store.ts` | website | Client-side auth state store | `useAuthStore()` | Zustand store for auth state |
| `apps/website/lib/bots.ts` | website | Bot data and fetch helpers | `getBots()`, `getBotBySlug()` | Bot listing and detail data access |
| `apps/website/lib/bots-catalogue.ts` | website | Static bot catalogue data | `BOT_CATALOGUE` | Static list of all available bots |
| `apps/website/lib/bot-avatar.ts` | website | Bot avatar image resolution | `getBotAvatar()` | Maps bot type to avatar image |
| `apps/website/lib/cart-store.tsx` | website | Shopping cart state store | `useCartStore()` | Zustand store for marketplace cart |
| `apps/website/lib/cn.ts` | website | Class name utility | `cn()` | Tailwind class merging (clsx + tailwind-merge) |
| `apps/website/lib/connector-store.ts` | website | Connector state store | `useConnectorStore()` | Zustand store for connector config |
| `apps/website/lib/rate-limit.ts` | website | Rate limiting for website API routes | `rateLimit()` | Protects website API from abuse |
| `apps/website/lib/use-funnel-tracking.ts` | website | Marketing funnel tracking hook | `useFunnelTracking()` | Tracks user journey steps |
| `apps/website/lib/useCompactMotion.ts` | website | Motion reduction hook | `useCompactMotion()` | Respects prefers-reduced-motion |
| `apps/website/lib/waitlist.ts` | website | Waitlist submission logic | `submitWaitlist()` | Handles waitlist form submissions |

### tests/

| File Path | Package | Purpose | Why It Exists |
|---|---|---|---|
| `apps/website/tests/approvals-flow.test.ts` | website | End-to-end approval flow tests | E2E approval coverage |
| `apps/website/tests/connectors-bot-scope.test.ts` | website | Connector bot scope tests | Connector scope coverage |
| `apps/website/tests/deployments-flow.test.ts` | website | Deployment flow tests | Deployment coverage |
| `apps/website/tests/deployments-history-ui.test.ts` | website | Deployment history UI tests | UI coverage |
| `apps/website/tests/evidence-compliance.test.ts` | website | Evidence compliance tests | Compliance coverage |
| `apps/website/tests/permissions.test.ts` | website | Permission and auth tests | Auth coverage |
| `apps/website/tests/provisioning-progress-ui.test.ts` | website | Provisioning progress UI tests | UI coverage |
| `apps/website/tests/provisioning-worker.test.ts` | website | Provisioning worker tests | Worker coverage |
| `apps/website/tests/session-auth.test.ts` | website | Session auth tests | Auth coverage |
| `apps/website/tests/signup-flow.test.ts` | website | Signup flow tests | Signup coverage |

### scripts/

| File Path | Package | Purpose | Why It Exists |
|---|---|---|---|
| `apps/website/scripts/ui-smoke.mjs` | website | UI smoke test runner | Quick UI sanity check |
| `apps/website/scripts/verify-ui-baseline.mjs` | website | Verifies UI baseline screenshots | Screenshot regression prevention |

---

## services/agent-observability

Provides audit log writing, action interception, screenshot upload, and correctness scoring.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/agent-observability/src/index.ts` | agent-observability | Package entry point | Re-exports all observability APIs | Package root export |
| `services/agent-observability/src/audit-log-writer.ts` | agent-observability | Writes structured audit log entries | `getAuditLogWriter()`, `AuditLogWriter` | Central audit log for all agent actions |
| `services/agent-observability/src/audit-log-writer.test.ts` | agent-observability | Tests for audit log writer | — | Writer coverage |
| `services/agent-observability/src/action-interceptor.ts` | agent-observability | Intercepts actions before execution | `ActionInterceptor`, `intercept()` | Pre-execution logging and policy checks |
| `services/agent-observability/src/action-interceptor.test.ts` | agent-observability | Tests for action interceptor | — | Interceptor coverage |
| `services/agent-observability/src/browser-action-with-upload.ts` | agent-observability | Browser action executor with blob upload | `executeBrowserActionWithUpload()` | Browser actions that upload screenshots to Azure Blob |
| `services/agent-observability/src/browser-action-with-upload.test.ts` | agent-observability | Tests for upload-integrated browser actions | — | Upload coverage |
| `services/agent-observability/src/browser-agent-wrapper.ts` | agent-observability | Wraps browser agent for observability | `BrowserAgentWrapper` | Injects observability into browser agent calls |
| `services/agent-observability/src/correctness-scorer.ts` | agent-observability | Scores action correctness from screenshots | `CorrectnessScorer`, `score()` | Validates browser actions completed correctly |
| `services/agent-observability/src/correctness-scorer.test.ts` | agent-observability | Tests for correctness scoring | — | Scorer coverage |
| `services/agent-observability/src/diff-verifier.ts` | agent-observability | Verifies code diffs before committing | `DiffVerifier`, `verify()` | Ensures code changes match expected diff |
| `services/agent-observability/src/diff-verifier.test.ts` | agent-observability | Tests for diff verification | — | Verifier coverage |
| `services/agent-observability/src/desktop-agent-wrapper.py` | agent-observability | Python wrapper for native desktop agent | — | Native OS automation for Python-based tools |

---

## services/agent-question-service

Stores and routes agent clarification questions to human operators.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/agent-question-service/src/index.ts` | agent-question-service | Package entry point | Re-exports question service APIs | Package root export |
| `services/agent-question-service/src/question-store.ts` | agent-question-service | Interface for question storage | `QuestionStore` interface | Abstracts question persistence |
| `services/agent-question-service/src/question-store.test.ts` | agent-question-service | Tests for question store | — | Store coverage |
| `services/agent-question-service/src/prisma-question-store.ts` | agent-question-service | Prisma-backed question store | `PrismaQuestionStore` | Persists questions to PostgreSQL |

---

## services/approval-service

Manages approval batching, enforcement, and governance workflows.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/approval-service/src/index.ts` | approval-service | Package entry point | Re-exports approval service APIs | Package root export |
| `services/approval-service/src/approval-enforcer.ts` | approval-service | Enforces approval requirements on actions | `ApprovalEnforcer`, `requiresApproval()`, `enforce()` | Blocks high-risk actions without approval |
| `services/approval-service/src/approval-enforcer.test.ts` | approval-service | Tests for approval enforcement | — | Enforcer coverage |
| `services/approval-service/src/approval-batcher.ts` | approval-service | Batches multiple approvals for bulk review | `ApprovalBatcher`, `batch()` | Groups related approvals for efficient review |
| `services/approval-service/src/governance-workflow-manager.ts` | approval-service | Manages governance workflow execution | `GovernanceWorkflowManager`, `runWorkflow()` | Orchestrates multi-step approval workflows |
| `services/approval-service/src/governance-workflow-manager.test.ts` | approval-service | Tests for governance workflows | — | Workflow coverage |

---

## services/audit-storage

Handles Azure Blob Storage upload of screenshots and audit artifacts.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/audit-storage/src/index.ts` | audit-storage | Package entry point | Re-exports storage APIs | Package root export |
| `services/audit-storage/src/types.ts` | audit-storage | TypeScript types for storage | `StorageBlob`, `UploadResult` | Shared types for audit storage |
| `services/audit-storage/src/azure-blob-storage.ts` | audit-storage | Azure Blob Storage client | `AzureBlobStorage`, `upload()`, `getSignedUrl()` | Stores screenshots and audit artifacts |
| `services/audit-storage/src/screenshot-uploader.ts` | audit-storage | Uploads screenshots to blob storage | `ScreenshotUploader`, `upload()` | Persists browser action screenshots |
| `services/audit-storage/src/screenshot-uploader.test.ts` | audit-storage | Tests for screenshot upload | — | Uploader coverage |

---

## services/browser-actions

Browser automation action definitions.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/browser-actions/src/web-actions.ts` | browser-actions | Defines browser web action types | `WebAction`, `ClickAction`, `FillAction`, `NavigateAction` | Typed browser action contracts |

---

## services/compliance-export

Exports compliance data for external audit systems.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/compliance-export/src/index.ts` | compliance-export | Package entry point | Re-exports export APIs | Package root export |
| `services/compliance-export/src/types.ts` | compliance-export | TypeScript types for compliance export | `ComplianceExport`, `ExportFormat` | Shared types for export |
| `services/compliance-export/src/compliance-export-service.ts` | compliance-export | Generates compliance export files | `ComplianceExportService`, `exportAuditLog()` | Produces CSV/JSON audit exports for regulators |

---

## services/connector-gateway

Plugin-based connector system for 9+ external integrations.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/connector-gateway/src/index.ts` | connector-gateway | Package entry point | Re-exports gateway APIs | Package root export |
| `services/connector-gateway/src/adapter-registry.ts` | connector-gateway | Registry of all connector adapters | `AdapterRegistry`, `register()`, `get()` | Central catalog of installed connectors |
| `services/connector-gateway/src/adapter-registry.test.ts` | connector-gateway | Tests for adapter registry | — | Registry coverage |
| `services/connector-gateway/src/plugin-loader.ts` | connector-gateway | Dynamically loads connector plugins | `PluginLoader`, `load()` | Runtime connector plugin loading |
| `services/connector-gateway/src/plugin-loader.test.ts` | connector-gateway | Tests for plugin loader | — | Loader coverage |
| `services/connector-gateway/src/mtls-verifier.ts` | connector-gateway | Verifies mutual TLS for enterprise connectors | `MtlsVerifier`, `verify()` | mTLS authentication for enterprise connections |
| `services/connector-gateway/src/mtls-verifier.test.ts` | connector-gateway | Tests for mTLS verification | — | mTLS coverage |
| `services/connector-gateway/src/pii-filter.ts` | connector-gateway | Filters PII from connector responses | `PiiFilter`, `filter()` | Prevents PII from appearing in agent context |
| `services/connector-gateway/src/pii-filter.test.ts` | connector-gateway | Tests for PII filtering | — | PII coverage |
| `services/connector-gateway/src/connectors/index.ts` | connector-gateway | Connector exports index | Re-exports all 9 connectors | Connector barrel file |
| `services/connector-gateway/src/connectors/github-connector.ts` | connector-gateway | GitHub API connector | `GitHubConnector`, `listIssues()`, `createPR()`, etc. | GitHub integration |
| `services/connector-gateway/src/connectors/slack-connector.ts` | connector-gateway | Slack API connector | `SlackConnector`, `sendMessage()`, `listChannels()` | Slack integration |
| `services/connector-gateway/src/connectors/azure-devops-connector.ts` | connector-gateway | Azure DevOps connector | `AzureDevOpsConnector`, `getWorkItems()`, `createPR()` | ADO integration |
| `services/connector-gateway/src/connectors/confluence-connector.ts` | connector-gateway | Confluence connector | `ConfluenceConnector`, `getPage()`, `createPage()` | Confluence integration |
| `services/connector-gateway/src/connectors/email-connector.ts` | connector-gateway | Email (IMAP/SMTP) connector | `EmailConnector`, `sendEmail()`, `fetchEmails()` | Email integration |
| `services/connector-gateway/src/connectors/linear-connector.ts` | connector-gateway | Linear issue tracker connector | `LinearConnector`, `getIssues()`, `createIssue()` | Linear integration |
| `services/connector-gateway/src/connectors/notion-connector.ts` | connector-gateway | Notion connector | `NotionConnector`, `getPage()`, `createPage()` | Notion integration |
| `services/connector-gateway/src/connectors/pagerduty-connector.ts` | connector-gateway | PagerDuty connector | `PagerDutyConnector`, `getIncidents()`, `triggerAlert()` | PagerDuty integration |
| `services/connector-gateway/src/connectors/sentry-connector.ts` | connector-gateway | Sentry error tracking connector | `SentryConnector`, `getIssues()`, `resolveIssue()` | Sentry integration |

---

## services/evidence-service

Evidence indexing, vector search, and governance KPI computation.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/evidence-service/src/index.ts` | evidence-service | Package entry point | Re-exports evidence APIs | Package root export |
| `services/evidence-service/src/governance-kpi.ts` | evidence-service | Computes governance KPIs from evidence | `computeGovernanceKpis()`, `GovernanceKpi` | Aggregates approval rates, risk scores |
| `services/evidence-service/src/governance-kpi.test.ts` | evidence-service | Tests for KPI computation | — | KPI coverage |
| `services/evidence-service/src/hnsw-index.ts` | evidence-service | HNSW vector index for evidence search | `HnswIndex`, `addVector()`, `search()` | Approximate nearest-neighbor search for evidence retrieval |
| `services/evidence-service/src/hnsw-index.test.ts` | evidence-service | Tests for HNSW index | — | Index coverage |

---

## services/identity-service

Identity and access management service.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/identity-service/src/index.ts` | identity-service | Package entry point | NOT FOUND — needs investigation | Identity service root |

---

## services/meeting-agent

Meeting participation, transcription, and voice pipeline.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/meeting-agent/src/index.ts` | meeting-agent | Package entry point | Re-exports meeting agent APIs | Package root export |
| `services/meeting-agent/src/meeting-lifecycle.ts` | meeting-agent | Manages meeting join/speak/leave lifecycle | `MeetingLifecycle`, `join()`, `speak()`, `leave()` | Enables agents to participate in video meetings |
| `services/meeting-agent/src/meeting-lifecycle.test.ts` | meeting-agent | Tests for meeting lifecycle | — | Lifecycle coverage |
| `services/meeting-agent/src/voice-pipeline.ts` | meeting-agent | Processes audio input/output for meetings | `VoicePipeline`, `processAudio()` | Handles STT/TTS pipeline for meeting agent |
| `services/meeting-agent/src/voice-pipeline.test.ts` | meeting-agent | Tests for voice pipeline | — | Pipeline coverage |

---

## services/memory-service

Agent memory persistence and retrieval.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/memory-service/src/index.ts` | memory-service | Package entry point | Re-exports memory APIs | Package root export |
| `services/memory-service/src/memory-types.ts` | memory-service | TypeScript types for memory | `MemoryEntry`, `MemoryLayer`, `MemoryQuery` | Shared types for memory system |
| `services/memory-service/src/memory-store.ts` | memory-service | In-memory and Prisma memory store | `MemoryStore`, `read()`, `write()`, `search()` | Core memory persistence interface |
| `services/memory-service/src/memory-store.test.ts` | memory-service | Tests for memory store | — | Store coverage |

---

## services/notification-service

Multi-channel notification dispatch.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/notification-service/src/index.ts` | notification-service | Package entry point | Re-exports notification APIs | Package root export |
| `services/notification-service/src/notification-dispatcher.ts` | notification-service | Routes notifications to correct channel | `NotificationDispatcher`, `dispatch()` | Sends notifications via Slack/email/Discord/Telegram/voice |
| `services/notification-service/src/notification-dispatcher.test.ts` | notification-service | Tests for dispatcher | — | Dispatcher coverage |
| `services/notification-service/src/channels/slack-adapter.ts` | notification-service | Slack notification adapter | `SlackAdapter`, `send()` | Sends messages to Slack channels |
| `services/notification-service/src/channels/email-adapter.ts` | notification-service | Email notification adapter | `EmailAdapter`, `send()` | Sends notification emails |
| `services/notification-service/src/channels/discord-adapter.ts` | notification-service | Discord notification adapter | `DiscordAdapter`, `send()` | Sends messages to Discord |
| `services/notification-service/src/channels/telegram-adapter.ts` | notification-service | Telegram notification adapter | `TelegramAdapter`, `send()` | Sends Telegram messages |
| `services/notification-service/src/channels/voice-adapter.ts` | notification-service | Voice notification adapter | `VoiceAdapter`, `speak()` | TTS-based voice notifications |
| `services/notification-service/src/channels/voice-adapter.test.ts` | notification-service | Tests for voice adapter | — | Voice coverage |

---

## services/policy-engine

Governance routing and policy evaluation.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/policy-engine/src/index.ts` | policy-engine | Package entry point | Re-exports policy APIs | Package root export |
| `services/policy-engine/src/governance-routing-policy.ts` | policy-engine | Evaluates governance routing policies | `GovernanceRoutingPolicy`, `evaluate()` | Determines approval routing based on risk/role |
| `services/policy-engine/src/governance-routing-policy.test.ts` | policy-engine | Tests for routing policy | — | Policy coverage |

---

## services/provisioning-service

VM and workspace provisioning state machine.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/provisioning-service/src/index.ts` | provisioning-service | Package entry point | Re-exports provisioning APIs | Package root export |
| `services/provisioning-service/src/state-machine.ts` | provisioning-service | Provisioning job state machine | `ProvisioningStateMachine`, `transition()` | Models provisioning as explicit state transitions |
| `services/provisioning-service/src/job-processor.ts` | provisioning-service | Processes individual provisioning jobs | `JobProcessor`, `process()` | Runs each provisioning step in sequence |
| `services/provisioning-service/src/job-processor.test.ts` | provisioning-service | Tests for job processing | — | Processor coverage |
| `services/provisioning-service/src/default-step-executor.ts` | provisioning-service | Default implementation of step executor | `DefaultStepExecutor`, `execute()` | Runs provisioning steps (create VM, install deps, etc.) |
| `services/provisioning-service/src/default-step-executor.test.ts` | provisioning-service | Tests for step executor | — | Executor coverage |
| `services/provisioning-service/src/vm-bootstrap.ts` | provisioning-service | VM bootstrap script runner | `VmBootstrap`, `bootstrap()` | Runs bootstrap scripts on new VMs |
| `services/provisioning-service/src/vm-bootstrap.test.ts` | provisioning-service | Tests for VM bootstrap | — | Bootstrap coverage |

---

## services/retention-cleanup

Automated data retention enforcement.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `services/retention-cleanup/src/index.ts` | retention-cleanup | Package entry point | Re-exports cleanup APIs | Package root export |
| `services/retention-cleanup/src/types.ts` | retention-cleanup | TypeScript types for retention | `RetentionJob`, `CleanupResult` | Shared retention types |
| `services/retention-cleanup/src/retention-cleanup-job.ts` | retention-cleanup | Runs retention cleanup jobs | `RetentionCleanupJob`, `run()` | Deletes expired sessions, recordings, evidence |

---

## packages/connector-contracts

Shared TypeScript contracts for connector integrations.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `packages/connector-contracts/src/index.ts` | connector-contracts | Package entry point | `ConnectorContract`, `ConnectorAction`, `ConnectorConfig` | Shared types for all connectors |

---

## packages/db-schema

Prisma schema and generated client for PostgreSQL 16.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `packages/db-schema/prisma/schema.prisma` | db-schema | Prisma schema — 45+ models | All 45+ Prisma models | Single source of truth for DB schema |
| `packages/db-schema/src/index.ts` | db-schema | Package entry point | `prisma` — Prisma client export | Shared Prisma client for all packages |

---

## packages/observability

Shared observability utilities (tracing, metrics, logging).

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `packages/observability/src/index.ts` | observability | Package entry point | `createTracer()`, `createMetrics()`, `createLogger()` | Shared observability primitives |

---

## packages/queue-contracts

Shared TypeScript contracts for queue messages between services.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `packages/queue-contracts/src/index.ts` | queue-contracts | Package entry point | `TaskQueueMessage`, `ApprovalQueueMessage`, `ProvisioningQueueMessage` | Inter-service queue message contracts |

---

## packages/shared-types

Shared TypeScript types used across all packages and services.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `packages/shared-types/src/index.ts` | shared-types | Package entry point | Re-exports all shared types | Barrel file for type consumers |
| `packages/shared-types/src/audit-ids.ts` | shared-types | ID generation for audit entities | `generateSessionId()`, `generateActionId()`, `generateScreenshotId()` | Deterministic, traceable audit IDs |
| `packages/shared-types/src/browser-audit.ts` | shared-types | Browser audit event types | `BrowserActionEvent`, `NetworkEntry`, `CorrectnessAssertion` | Shared browser audit schema |
| `packages/shared-types/src/desktop-operator.ts` | shared-types | Desktop operator type contracts | `DesktopOperator`, `DesktopOperatorConfig` | Shared desktop operator interface |
| `packages/shared-types/src/adapter-registry.ts` | shared-types | Adapter registry types | `AdapterRegistryEntry`, `AdapterCapability` | Shared types for adapter registry |
| `packages/shared-types/src/autonomous-loop.ts` | shared-types | Autonomous loop type contracts | `AutonomousLoopConfig`, `LoopState` | Shared types for autonomous coding loops |
| `packages/shared-types/src/skill-composition.ts` | shared-types | Skill composition types | `SkillNode`, `SkillEdge`, `SkillGraph` | Shared types for skill pipelines |
| `packages/shared-types/src/task-plan.ts` | shared-types | Task plan types | `TaskPlan`, `PlanStep`, `PlanState` | Shared types for task planning |
| `packages/shared-types/src/telemetry.ts` | shared-types | Telemetry event types | `TelemetryEvent`, `TelemetryPayload` | Shared telemetry schema |
| `packages/shared-types/src/notification.ts` | shared-types | Notification types | `NotificationPayload`, `NotificationChannel` | Shared notification schema |
| `packages/shared-types/src/crm.ts` | shared-types | CRM integration types | `CrmEvent`, `CrmContact` | Shared CRM event schema |
| `packages/shared-types/src/erp.ts` | shared-types | ERP integration types | `ErpEvent`, `ErpRecord` | Shared ERP event schema |
| `packages/shared-types/src/governance-kpis.ts` | shared-types | Governance KPI types | `GovernanceKpi`, `KpiSnapshot` | Shared governance metric schema |
| `packages/shared-types/src/provider-failover.ts` | shared-types | LLM provider failover types | `ProviderHealth`, `FailoverDecision` | Shared types for LLM health tracking |
| `packages/shared-types/src/retention-policy.ts` | shared-types | Retention policy types | `RetentionPolicy`, `RetentionRule` | Shared retention configuration types |
| `packages/shared-types/src/storage-paths.ts` | shared-types | Storage path conventions | `getScreenshotPath()`, `getRecordingPath()` | Standardized file path generation |
| `packages/shared-types/src/contract-compatibility.test.ts` | shared-types | Tests for cross-package contract compatibility | — | Contract regression coverage |

---

## infrastructure

Azure Bicep IaC for control-plane and runtime-plane.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `infrastructure/control-plane/main.bicep` | infrastructure | Control-plane Azure resources | App Service, PostgreSQL, Key Vault, Storage | Deploys api-gateway, dashboard, website to Azure |
| `infrastructure/control-plane/README.md` | infrastructure | Control-plane deployment docs | — | Deployment instructions |
| `infrastructure/runtime-plane/main.bicep` | infrastructure | Runtime-plane Azure resources | ACI/AKS containers, Redis, agent runtime | Deploys agent-runtime, trigger-service to Azure |
| `infrastructure/runtime-plane/README.md` | infrastructure | Runtime-plane deployment docs | — | Deployment instructions |

---

## scripts

Root-level build, quality, and CI scripts.

| File Path | Package | Purpose | Why It Exists |
|---|---|---|---|
| `scripts/quality-gate.mjs` | root | Runs full quality gate: lint + typecheck + test | `pnpm quality:gate` entrypoint |
| `scripts/coverage-threshold-check.mjs` | root | Validates test coverage meets thresholds | Enforces minimum coverage per package |
| `scripts/a4-contract-validation.mjs` | root | Validates cross-package type contracts | Prevents contract drift between services |
| `scripts/a4-import-boundary-check.mjs` | root | Enforces import boundary rules | Prevents illegal cross-domain imports |
| `scripts/e2e-integration.mjs` | root | Runs E2E integration test suite | Full system integration validation |
| `scripts/e2e-smoke.mjs` | root | Runs E2E smoke tests | Quick sanity check for CI |
| `scripts/backfill-audit-replay-to-prisma.mjs` | root | Backfills historical audit events to Prisma | Data migration for audit replay feature |
| `scripts/graphify.mjs` | root | Generates knowledge graph from repo | Builds repo dependency/knowledge graph |
| `scripts/website-swa-verify.mjs` | root | Verifies Azure Static Web App deployment | Post-deploy SWA validation |
| `scripts/dev-setup.md` | root | Developer setup documentation | Onboarding guide for new developers |

---

## tools

Custom ESLint plugins and tooling.

| File Path | Package | Purpose | Key Exports / Functions | Why It Exists |
|---|---|---|---|---|
| `tools/eslint-plugin-agentfarm-boundaries.cjs` | tools | ESLint plugin for import boundary enforcement | `no-cross-domain-imports` rule | Prevents apps from importing directly from other apps |

---

## Summary

| Domain | Approximate File Count |
|---|---|
| apps/agent-runtime | ~105 files |
| apps/api-gateway | ~80 files |
| apps/dashboard | ~80 files |
| apps/website | ~120 files |
| apps/orchestrator | ~15 files |
| apps/trigger-service | ~12 files |
| services/* (15 services) | ~80 files |
| packages/* (5 packages) | ~25 files |
| infrastructure/ | 4 files |
| scripts/ | 10 files |
| tools/ | 1 file |
| **Total (estimated)** | **~530 source files** |

> Note: The 1,971 figure from the full scan includes test files, config files (tsconfig.json, package.json, next.config files), public assets, and all generated type files. This inventory covers all hand-authored source files. Config-only files (package.json, tsconfig.json per package) are omitted for brevity but exist in every app/service/package root.
