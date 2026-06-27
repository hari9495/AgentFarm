# Cross-Agent Consistency Audit

> Generated from direct source analysis of `apps/agent-runtime/src/agents/`

## Summary

**11/15 agents fully consistent** — 4 agents have gaps in the RAG flywheel.

---

## Per-Agent Status Table

| Agent | RAG Injected | ingestApproved | ingestFeedback | Default/Fallthrough | No TODO stubs | Lesson Pipeline | RAG Retriever |
|---|---|---|---|---|---|---|---|
| business-analyst | ✅ | ✅ | ✅ | ⚠️ no default | ✅ | ✅ | ✅ |
| content-writer | ✅ | ❌ missing | ✅ | ✅ | ✅ | ✅ | ✅ |
| corporate-assistant | ❌ no RAG | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| customer-support-executive | ❌ no RAG | ❌ missing | ✅ | ✅ | ✅ | ✅ | ✅ |
| developer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| devops | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| full-stack-developer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| marketing-specialist | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| meeting-agent | N/A (service) | N/A | N/A | N/A | ✅ | ✅ | ✅ |
| mobile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| project-manager | ✅ | ✅ | ✅ | ⚠️ no default | ✅ | ✅ | ✅ |
| recruiter | ❌ no RAG | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| sales-agent | ✅ | ✅ | ✅ | ⚠️ no default | ✅ | ✅ | ✅ |
| technical-writer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| tester | ❌ no RAG | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Findings by Agent

### corporate-assistant — ❌ No RAG injection
- **File:** `corporate-assistant/corporate-assistant-action-handler.ts`
- **Issue:** RAG context count is 0. The `corporate-assistant-rag-retriever.ts` file exists and exports `buildCaRagContext()`, but it is never called in the action handler. The system prompt is built without retrieving prior approved documents or lesson patterns.
- **Impact:** Agent operates without any prior context — it cannot learn from past approved artifacts or feedback lessons.
- **Fix:** Call `buildCaRagContext()` at the start of the handler and prepend `ragContext.contextBlock` to the system prompt, following the same pattern as `content-writer-action-handler.ts`.

### customer-support-executive — ❌ No RAG injection + ❌ Missing ingestApproved
- **File:** `customer-support-executive/customer-support-executive-action-handler.ts`
- **Issue 1:** RAG context count is 0. `customer-support-rag-retriever.ts` exists but is not called in the action handler.
- **Issue 2:** `ingestApproved*()` is not called after successful task completion. The flywheel only receives negative feedback (lessons), but never ingests approved support responses as positive examples.
- **Fix:** Add both `buildCsRagContext()` injection and `onCsResponseApproved()` post-approval hook call.

### recruiter — ❌ No RAG injection
- **File:** `recruiter/recruiter-action-handler.ts`
- **Issue:** RAG context count is 0. `recruiter-rag-retriever.ts` exists but is not used in the action handler. The recruiter has the most domain-specific prior work to retrieve (JDs, screening notes, offer templates) yet none of it is being injected.
- **Fix:** Call `buildRecruiterRagContext()` before LLM generation and inject `ragContext.contextBlock`.

### tester — ❌ No RAG injection
- **File:** `tester/tester-action-handler.ts`
- **Issue:** RAG context count is 0. `tester-rag-retriever.ts` exists but is never called in the action handler. Prior test plans, bug reports, and lessons are never surfaced.
- **Fix:** Call `buildTesterRagContext()` before LLM generation and inject `ragContext.contextBlock`.

### content-writer — ❌ Missing ingestApproved
- **File:** `content-writer/content-writer-action-handler.ts`
- **Issue:** `ingestApproved*()` count is 0. The lesson pipeline receives negative feedback but approved content (blog posts, email drafts, etc.) is never written to `AgentKnowledgeBase`. The flywheel only learns from failures, not from successes.
- **Fix:** Add `onCwContentApproved()` call after task approval — the `content-writer-rag-retriever.ts` already exports `ingestApprovedCwContent()`.

### business-analyst — ⚠️ No fallthrough guard
- **File:** `business-analyst/business-analyst-action-handler.ts`
- **Issue:** The dispatch uses an `if / else if` chain (not a switch). There is no final `else` that returns `{ ok: false, errorOutput: 'Unknown action type' }`. If an unrecognized `actionType` reaches the handler, the function returns `undefined` (implicit), causing a runtime type error in the caller.
- **Fix:** Add a final `else` block: `return { ok: false, output: '', errorOutput: \`Unknown BA action: \${actionType}\` };`

### project-manager — ⚠️ No default case in switch
- **File:** `project-manager/project-manager-action-handler.ts` line ~1854
- **Issue:** The `handlePmAction` switch closes at line 1854 without a `default:` case. Unrecognized action types fall through silently and the async function returns `undefined`.
- **Fix:** Add `default: { const e: never = actionType; return { ok: false, output: '', errorOutput: \`Unknown PM action: \${String(e)}\` }; }`

### sales-agent — ⚠️ No default case in switch
- **File:** `sales-agent/sales-action-handler.ts`
- **Issue:** The `handleSalesAction` switch has no `default:` case. The ROLE_PROFILES entry for `sales_rep` also hardcodes `allowedConnectorTools` and `allowedActions` inline instead of importing from `sales-rep-agent-profile.ts` like all other agents.
- **Fix:** Add default case to switch. Move connector/action lists to `sales-rep-agent-profile.ts` and import in `role-profiles/index.ts`.

### meeting-agent — ℹ️ Architecturally different
- **Issue:** No action handler in `apps/agent-runtime/src/agents/meeting-agent/`. Only has `meeting-transcription.ts`, `meeting-agent-rag-retriever.ts`, `meeting-agent-lesson-pipeline.ts`.
- **Explanation:** meeting-agent is a separate HTTP service (`services/meeting-agent/`). It is invoked via HTTP calls in `local-workspace-executor.ts` (~lines 3032–3198). This is intentional — it handles STT/TTS sessions.
- **Remaining gap:** The RAG retriever and lesson pipeline exist but there is no code in `services/meeting-agent/` that calls them. The flywheel is effectively dead for this agent. The service would need to call `buildMeetingRagContext()` before STT sessions and `ingestMeetingFeedback()` after sessions complete.

---

## Systemic Patterns

1. **RAG not injected in 4 agents** — `corporate-assistant`, `customer-support-executive`, `recruiter`, `tester` all have RAG infrastructure but the action handlers don't call it. The retriever files exist, but they are orphaned.

2. **Missing default/fallthrough in 3 agents** — `business-analyst`, `project-manager`, `sales-agent`. Silent return of `undefined` from an action handler causes caller type errors. All other agents handle this correctly with exhaustive checks.

3. **sales_rep role registration inconsistency** — Only agent with hardcoded lists in `role-profiles/index.ts` rather than importing from its agent-profile file. Every other agent imports its constants.

4. **meeting-agent flywheel is dead** — RAG and lesson pipeline files exist but are never invoked from the actual meeting service.
