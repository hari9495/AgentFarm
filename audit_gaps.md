# Agent Gap Analysis

> Generated from direct source analysis of `apps/agent-runtime/src/agents/` and `role-profiles/index.ts`

## Summary

- **12 agents** are production-ready or near-complete
- **2 agents** have flywheel gaps (RAG/ingest not wired)
- **1 agent** (meeting-agent) is architecturally separate — partial flywheel gap
- **3 agents** have missing default/fallthrough guards in their action dispatch
- **1 agent** (sales_rep) has a registration inconsistency

---

## Summary Table

| Agent | Has Profile | Registered | Action Handler | RAG Retriever | Lesson Pipeline | TODOs | Status |
|---|---|---|---|---|---|---|---|
| business-analyst | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 Missing default case |
| content-writer | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 Missing ingestApproved |
| corporate-assistant | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 RAG not injected |
| customer-support-executive | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 RAG not injected, no ingestApproved |
| developer | ✅ | ✅ | ✅ | ✅ | ✅ (episodic-hooks) | None | 🟢 |
| devops | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟢 |
| full-stack-developer | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟢 |
| marketing-specialist | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟢 |
| meeting-agent | ❌ no profile | ❌ not in ROLE_PROFILES | ❌ no handler | ✅ | ✅ | None | 🔴 Service-only, flywheel dead |
| mobile | ✅ | ✅ (sub-agent) | ✅ | ✅ | ✅ | None | 🟢 |
| project-manager | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 Missing default case |
| recruiter | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 RAG not injected |
| sales-agent | ✅ | ✅ ⚠️ inconsistent | ✅ | ✅ | ✅ | None | 🟡 No default case, inline registration |
| technical-writer | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟢 |
| tester | ✅ | ✅ | ✅ | ✅ | ✅ | None | 🟡 RAG not injected |

---

## Detailed Findings Per Agent

### meeting-agent ✅ Fixed
**Architectural clarification:** The meeting-agent is NOT a role — it is shared infrastructure
that any agent (developer, BA, PM, etc.) uses when it needs to participate in a real-time meeting.
It has no `agent-profile.ts`, `role-profiles` entry, or action handler by design.

**What was broken:** The live meeting brain (`services/meeting-agent/src/server.ts`) had no RAG
context — it spoke without any knowledge of prior meetings, lessons, or workspace patterns.

**What was fixed:**
1. Created `services/meeting-agent/src/meeting-rag-client.ts` — self-contained HTTP client for
   the api-gateway knowledge-base and memory-patterns endpoints (no cross-package imports).
2. At `/start` and `/join→listening`: fetch prior meeting summaries + lessons once per session,
   cache as `session.ragContextBlock`.
3. On every `brain.think()` call: prepend `ragContextBlock` to the LLM memory context.
4. At `/stop`: call `ingestMeetingSessionSummary()` to feed the flywheel with the session transcript.
5. Added `gatewayBaseUrl` and `serviceToken` to `MeetingAgentServerOptions` (opt-in, non-breaking).
6. `bootFromEnv()` reads `API_GATEWAY_URL` and `MEETING_SERVICE_TOKEN` env vars.
7. Added `MEETING_SERVICE_TOKEN` to `.env.example`.

**Note:** The post-meeting transcription RAG (for `workspace_meeting_transcribe`) was already wired
in `apps/agent-runtime/src/agents/meeting-agent/meeting-transcription.ts`. The fix above covers the
live brain path that was missing.

---

### corporate-assistant 🟡
**What's missing:**
- `corporate-assistant-action-handler.ts` does not call `buildCaRagContext()` — RAG retriever is orphaned
- Prior approved artifacts (emails, calendar entries, documents) are never retrieved as context

**Files that exist:** `corporate-assistant-rag-retriever.ts` ✅, `corporate-assistant-lesson-pipeline.ts` ✅, `corporate-assistant-agent-profile.ts` ✅

---

### customer-support-executive 🟡
**What's missing:**
- `customer-support-executive-action-handler.ts` does not call `buildCsRagContext()`
- No `ingestApproved*()` call after successful resolution — approved responses never enter the knowledge base

**Files that exist:** `customer-support-rag-retriever.ts` ✅, `customer-support-lesson-pipeline.ts` ✅, `customer-support-executive-agent-profile.ts` ✅

---

### recruiter 🟡
**What's missing:**
- `recruiter-action-handler.ts` does not call `buildRecruiterRagContext()` — prior JDs, screening notes, offer templates never retrieved

**Files that exist:** `recruiter-rag-retriever.ts` ✅, `recruiter-lesson-pipeline.ts` ✅, `recruiter-agent-profile.ts` ✅

---

### tester 🟡
**What's missing:**
- `tester-action-handler.ts` does not call `buildTesterRagContext()` — prior test plans and bug reproduction steps never retrieved

**Files that exist:** `tester-rag-retriever.ts` ✅, `tester-lesson-pipeline.ts` ✅, `tester-agent-profile.ts` ✅

---

### content-writer 🟡
**What's missing:**
- `content-writer-action-handler.ts` has no `ingestApproved*()` call. Approved content (blog posts, emails, social copy) is never stored in `AgentKnowledgeBase` as positive examples. The lesson pipeline only receives negative signal (rejections).

---

### business-analyst 🟡
**What's missing:**
- `_handleBaActionCore` uses an `if / else if` dispatch chain with no final `else`. Unrecognized action types return `undefined` implicitly, causing a runtime error in the caller.

---

### project-manager 🟡
**What's missing:**
- `handlePmAction` switch statement closes at line ~1854 with no `default:` case. Unrecognized action types fall through to `return undefined`.

---

### sales-agent 🟡
**Two issues:**
1. `handleSalesAction` switch has no `default:` case
2. `role-profiles/index.ts` `sales_rep` entry has hardcoded `allowedConnectorTools` and `allowedActions` arrays inline instead of importing from `sales-rep-agent-profile.ts`. Every other agent imports constants from its agent profile. This means the role profile and agent profile can drift independently.

---

### mobile 🟢 (sub-agent)
- Registered as `mobile_engineer` in ROLE_PROFILES with `parentRole: 'tester'` — this is intentional (sub-agent of tester, not a top-level agent)
- All required files present: action handler, agent profile, RAG retriever, lesson pipeline ✅

---

## Priority Order for Fixing

| Priority | Agent | Effort | Impact |
|---|---|---|---|
| 1 | **customer-support-executive** | Small (add 2 calls) | High — both RAG and ingestApproved missing |
| 2 | **corporate-assistant** | Small (add 1 call) | High — RAG orphaned |
| 3 | **recruiter** | Small (add 1 call) | High — largest domain-specific knowledge base |
| 4 | **tester** | Small (add 1 call) | Medium |
| 5 | **content-writer** | Small (add 1 call) | Medium — ingestApproved missing |
| 6 | **project-manager** | Trivial (add default case) | Medium — silent failure on unknown actions |
| 7 | **business-analyst** | Trivial (add else clause) | Medium — silent failure on unknown actions |
| 8 | **sales-agent** | Small (add default + move constants) | Low — registration inconsistency |
| 9 | **meeting-agent** | Large (wire into services/meeting-agent) | Medium — flywheel dead, not blocking |

**Agents 1–5** are purely additive — call an existing function that already exists. Zero risk, direct flywheel value.
**Agents 6–8** are 1–3 lines each.
**Agent 9** requires changes in a different service (`services/meeting-agent/src/`) and a new role profile entry.
