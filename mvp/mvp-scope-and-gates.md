# AgentFarm MVP Scope and Gates
## MVP Goal
Launch one high-quality role first, prove value, then expand.
Planning-first rule: MVP implementation starts only after architecture baseline is approved.
## MVP Role
1. Developer Agent
## MVP Integrations
1. Jira
2. Microsoft Teams
3. GitHub
4. Company email workflow
## Included in MVP
1. Role-based task handling
2. Identity setup behavior standards
3. Human approval flow for risky actions
4. Action logs and audit trail
5. Weekly quality reporting
6. Connector contracts for Jira, Microsoft Teams, GitHub, and company email
7. Evidence records for all active release gates
## Not Included in MVP (Original Scope)
1. Many roles at once
2. Deep enterprise customization
3. Large analytics dashboard suite
4. Advanced multi-region scaling
5. Live meeting participation (voice join and spoken Q and A)
6. HR interview automation mode
## MVP Release Gates
1. Identity Realism = 5
2. Role Fidelity and Task Quality = 5
3. Autonomy with Human Approval = 5
4. No critical security issues
5. Pilot readiness confirmed
6. Architecture decision gates A-D approved
7. MVP architecture exit criteria completed
## Architecture Completion Checklist
1. Control plane, runtime plane, and evidence plane are documented.
2. Risk taxonomy and approval thresholds are approved by Safety Lead.
3. Audit schema supports full action and approval traceability.
4. Connector contracts are reviewed and signed off by Engineering Lead.
5. Kill switch behavior is tested in architecture review.
## MVP Success Metrics
1. Task completion quality
2. Rework rate
3. Escalation correctness
4. Time to onboard
5. Pilot customer satisfaction
6. Approval latency
7. Audit completeness

## Post-MVP Developer Agent Planning References
Use the following documents when planning the next implementation wave after MVP baseline completion:
1. planning/developer-agent-mvp-implementation-backlog.md
2. planning/future-agent-build-playbook.md
3. planning/developer-agent-sprint-board.md
4. planning/developer-agent-sprint-program.md
5. planning/sprints/sprint-1-trust-and-execution-core.md
6. planning/sprints/sprint-2-adoption-and-reliability-scale.md
7. planning/sprints/sprint-3-memory-and-compliance-packaging.md
8. planning/sprints/sprint-8-durable-handoff-and-evaluator-loop-week-1.md

Planning guardrail:
1. Any item that expands scope beyond the current MVP role/integration boundaries must be explicitly approved through architecture and safety governance before implementation starts.

---

## Implementation Status (as of 2026-05-06)

All MVP items above are built and tested. Quality gate: **EXIT_CODE=0 PASS**.

Latest incremental hardening delivered:
1. Durable orchestrator persistence for agent handoff records across restarts.
2. Runtime evaluator feedback loop wiring (outbound webhook + existing evaluator signal ingestion endpoint).

### Sprint 2 Features Built Beyond MVP Scope

The following features were built as Sprint 2 open-source-inspired additions:

| Feature | Status | Notes |
|---------|--------|-------|
| Messaging gateway (Telegram/Slack/Discord/Webhook) | **Built** | notification-service, 31 tests |
| Voice notification channel (VoxCPM/VoIP) | **Built** | voice-adapter.ts � previously listed as "Not Included in MVP" |
| GOAP A* goal planner | **Built** | orchestrator/goap-planner.ts |
| SSE task stream with auto-recovery | **Built** | api-gateway/routes/sse-tasks.ts |
| Skills crystallization (Hermes Agent pattern) | **Built** | agent-runtime/skills-registry.ts |
| Monorepo dependency graph tool (graphify) | **Built** | scripts/graphify.mjs |
| mTLS cert verifier + PII-strip middleware | **Built** | connector-gateway |
| HNSW vector index for evidence retrieval | **Built** | evidence-service/hnsw-index.ts |
| Kanban board (drag-and-drop logic) | **Built** | dashboard/kanban-board-utils.ts |
| Approval-only messaging gateway | **Built** | dispatchApprovalAlert() in notification-service |
| Meeting agent (AI disclosure, voice pipeline) | **Built** | services/meeting-agent/ (bonus) |

Note: Voice notification channel (VoxCPM) has been built. Live meeting participation (voice join to a real meeting call) remains out of scope until a separate safety gate is approved.


<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
