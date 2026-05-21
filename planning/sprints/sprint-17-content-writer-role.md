# Sprint 17 — Content Writer Role

**Status:** PLANNED
**Target start:** 2026-05-29
**Completed:** —
**Quality gate:** — (to be recorded on completion)

---

## Goal

Build the Content Writer role from its current stub in
`apps/agent-runtime/src/role-profiles/index.ts` into a first-class runtime
role — following the same structural pattern used for Corporate Assistant
(Sprint 15) and Technical Writer (Sprint 16).

By the end of this sprint the Content Writer agent can:
- Parse an unstructured content brief into a typed, actionable spec
  (audience, tone, format, word count, key messages, call to action).
- Generate a content draft in the correct format (blog post, email campaign,
  social post, internal announcement) using the configured brand voice.
- Validate factual claims in a draft against provided source URLs and flag
  unverified statements.
- Route a completed draft to a human editor for review with a structured
  handoff note.
- Record each task outcome as a typed episodic memory pattern.
- Produce a daily standup summary from recent episodic records.

---

## Deliverables

### New files — `apps/agent-runtime/src/`

| File | Purpose |
|---|---|
| `content-writer-agent-profile.ts` | `CONTENT_WRITER_ROLE_ALLOWED_CONNECTORS`, `CONTENT_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS`, `CONTENT_WRITER_BLOCKED_KEYWORDS` — mirrors `tester-agent-profile.ts`. Connectors from existing stub: `google_drive`, `slack`, `microsoft_teams`, `gmail` |
| `content-writer-persona-defaults.ts` | `getContentWriterDefaultPersona(botId, tenantId)` — returns an `AgentPersonaRecord` fallback; default display name "Content Writer"; disclosure statement scoped to marketing / editorial output — mirrors `tester-persona-defaults.ts` |
| `content-writer-episodic-hooks.ts` | `buildContentWriterEpisodicPattern(task, result)` and `buildContentWriterEpisodicSummary(task, result)` — typed pattern keys: `cw:brief:parsed`, `cw:draft:blog:success`, `cw:draft:email:success`, `cw:draft:social:success`, `cw:draft:announcement:success`, `cw:draft:fail`, `cw:fact_check:clean`, `cw:fact_check:flagged`, `cw:editorial:routed` |
| `content-writer-mcp-provisioner.ts` | `provisionContentWriterMcpSession(tenantId, gatewayUrl, token)` — auto-registers connectors with known env-var URLs (`MCP_GOOGLE_DRIVE_URL`, `MCP_SLACK_URL`, `MCP_TEAMS_URL`, `MCP_GMAIL_URL`) — mirrors `tester-mcp-provisioner.ts` |
| `content-writer-standup-builder.ts` | `buildContentWriterStandupSummary(recentMemory, config)` — derives yesterday / today / blockers from episodic records, returns `StandupSummary` — mirrors `tester-standup-builder.ts` |

### New files — `apps/agent-runtime/src/content-writer/`

| File | Purpose |
|---|---|
| `brief-parser.ts` | `parseContentBrief(rawBriefText)` — extracts structured `ContentBriefSpec` from free-text brief: `{ audience: string; tone: string; format: ContentFormat; wordCount: number \| null; keyMessages: string[]; callToAction: string \| null; deadline: string \| null }`. Uses heuristic extraction (keyword anchors: "audience:", "tone:", "format:", "CTA:", word count patterns). Returns `{ spec: ContentBriefSpec; confidence: 'high' \| 'low'; missingFields: string[] }` |
| `brief-parser.test.ts` | Unit tests: well-formed brief extracts all fields, brief with missing tone returns low confidence + missingFields=['tone'], brief with no CTA returns null CTA, word count in "500–800 words" format is parsed, empty string returns all missing fields |
| `draft-builder.ts` | `buildContentDraft(spec, brandVoice)` — given a `ContentBriefSpec` and a `BrandVoice` config (`{ style: string; doNotUse: string[]; signaturePhrase: string \| null }`), returns a structured `ContentDraft` (`{ title: string; body: string; format: ContentFormat; wordCount: number }`). `applyBrandVoice(draftBody, brandVoice)` — replaces blocked phrases and appends signature phrase if configured. Both are pure functions |
| `draft-builder.test.ts` | Unit tests: buildContentDraft returns correct format headings for blog, email, social, announcement, applyBrandVoice removes doNotUse phrases, applyBrandVoice appends signaturePhrase, applyBrandVoice with no blocked phrases is identity |
| `fact-checker.ts` | `checkFactualClaims(draftBody, sourcesConfig)` — scans draft for claim-like sentences (sentences with numbers, percentages, named entities) and returns a `FactCheckReport`: `{ totalClaims: number; verified: number; flagged: FactFlag[] }`. A `FactFlag` contains `claim`, `reason`, and `severity: 'warn' \| 'block'`. `buildFactCheckSummary(report)` — formats report as a Markdown block for Slack or editor handoff. Note: in sprint scope, claim detection uses heuristic pattern matching — external URL fetch for verification is out of scope |
| `fact-checker.test.ts` | Unit tests: draft with no numbers returns empty claims, sentence with percentage is flagged, buildFactCheckSummary Markdown structure, report with zero flagged returns clean summary |
| `editorial-router.ts` | `classifyEditorialRisk(draft)` — returns `'low' \| 'medium' \| 'high'` based on content signals: mentions of legal terms, named public figures, financial claims, or competitor names raise risk. `routeToEditor(draft, factCheckReport, persona)` — builds a structured editorial handoff note: title, format, word count, brand voice compliance status, fact check summary, and agent identity. Returns `EditorialHandoffNote` — no connector call; the calling runtime dispatches this as a `send_message` action |
| `editorial-router.test.ts` | Unit tests: draft with no risk signals returns low, legal keyword raises to high, competitor name raises to medium, routeToEditor includes all required handoff fields, agent identity in handoff includes persona displayName |

### New file — `apps/agent-runtime/src/role-profiles/`

| File | Purpose |
|---|---|
| `content-writer-role-profile.ts` | `CONTENT_WRITER_BLOCKED_ACTIONS` (Set\<string\>) — hard-blocks developer execution actions (run_tests, code_edit, create_pr, search_candidates, schedule_meeting) and sales actions (find_leads, create_deal, send_contract). `CONTENT_WRITER_APPROVAL_THRESHOLDS` — publishing to an external channel = medium risk; drafting content mentioning a named competitor = medium risk; editorial handoff = low risk |

### Modified files

| File | Change |
|---|---|
| `apps/agent-runtime/src/role-profiles/index.ts` | Import `CONTENT_WRITER_ROLE_ALLOWED_CONNECTORS` and `CONTENT_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS` from `../content-writer-agent-profile.js`; replace inline arrays in `content_writer` profile entry |
| `apps/agent-runtime/src/runtime-server.ts` | Add import of `getContentWriterDefaultPersona` and `provisionContentWriterMcpSession`; wire into bot-startup path |
| `apps/agent-runtime/src/task-classifier.ts` | Import `CONTENT_WRITER_BLOCKED_KEYWORDS`; add to role-keyword guard |

---

## Design Decisions

### `brief-parser.ts` — heuristic-only, no LLM
Brief parsing uses keyword anchors and pattern matching. If confidence is `'low'`
and required fields are missing, the agent raises a clarification request to the
human requester before generating any draft. This avoids hallucinated specs from
under-specified briefs.

### `draft-builder.ts` — pure function, LLM call is the runtime's responsibility
`buildContentDraft` constructs the LLM prompt context and brand voice constraints
— it does not call the LLM itself. The LLM planning loop in `execution-engine.ts`
handles the actual generation call. This keeps the module testable without LLM
mocking.

### `fact-checker.ts` — heuristic detection, no external fetch (Sprint 17 scope)
Claim detection uses sentence-level heuristics (numbers, percentages, named
entities via simple patterns). External source URL fetching and cross-referencing
is explicitly out of scope for this sprint. A future sprint can add async URL
resolution as an optional enrichment step.

### Email provider reuse
`content-writer-mcp-provisioner.ts` uses `MCP_GMAIL_URL` from the same env-var
set already used by Corporate Assistant (Sprint 15). No new email infrastructure
is introduced.

### `ContentFormat` type
`ContentFormat` is defined in `content-writer-agent-profile.ts` as:
```typescript
export type ContentFormat = 'blog_post' | 'email_campaign' | 'social_post' | 'announcement';
```
No shared-types change is required at this stage — it is local to the role.

---

## Test Targets

| Package | Target pass count |
|---|---|
| `@agentfarm/agent-runtime` | +40 tests above Sprint 16 baseline |

Validation commands:
```
pnpm --filter @agentfarm/agent-runtime typecheck
pnpm --filter @agentfarm/agent-runtime test
pnpm quality:gate
```
