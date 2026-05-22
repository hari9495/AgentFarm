# Sprint 16 — Technical Writer Role

**Status:** DONE
**Target start:** 2026-05-26
**Completed:** 2026-05-22
**Quality gate:** PASS (runtime-server.ts 80.25% lines, exit 0)

---

## Goal

Build the Technical Writer role from its current stub in
`apps/agent-runtime/src/role-profiles/index.ts` into a first-class runtime
role — following the same structural pattern used for Corporate Assistant
(Sprint 15) and Tester (Sprint 7 Week 4).

By the end of this sprint the Technical Writer agent can:
- Read a git diff and identify which sections of existing documentation are
  stale and need updating.
- Generate API reference documentation from an OpenAPI spec or from inline
  code comments.
- Build a structured release notes draft from a list of merged PR titles and
  commit messages.
- Validate a document against configurable style guide rules and emit a
  violation report.
- Open a pull request on GitHub/GitLab containing documentation changes.
- Record each task outcome as a typed episodic memory pattern.
- Produce a daily standup summary from recent episodic records.

---

## Deliverables

### New files — `apps/agent-runtime/src/`

| File | Purpose |
|---|---|
| `technical-writer-agent-profile.ts` | `TECHNICAL_WRITER_ROLE_ALLOWED_CONNECTORS`, `TECHNICAL_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS`, `TECHNICAL_WRITER_BLOCKED_KEYWORDS` — mirrors `tester-agent-profile.ts`. Connectors from existing stub: `confluence`, `github`, `gitlab`, `google_drive`, `slack` |
| `technical-writer-persona-defaults.ts` | `getTechnicalWriterDefaultPersona(botId, tenantId)` — returns an `AgentPersonaRecord` fallback; default display name "Technical Writer"; disclosure statement scoped to documentation output |
| `technical-writer-episodic-hooks.ts` | `buildTechnicalWriterEpisodicPattern(task, result)` and `buildTechnicalWriterEpisodicSummary(task, result)` — typed pattern keys: `tw:doc_update:success`, `tw:doc_update:fail`, `tw:api_doc:generated`, `tw:release_notes:built`, `tw:style_check:violations`, `tw:style_check:clean`, `tw:pr:opened` |
| `technical-writer-mcp-provisioner.ts` | `provisionTechnicalWriterMcpSession(tenantId, gatewayUrl, token)` — auto-registers connectors with known env-var URLs (`MCP_CONFLUENCE_URL`, `MCP_GITHUB_URL`, `MCP_GITLAB_URL`, `MCP_GOOGLE_DRIVE_URL`, `MCP_SLACK_URL`) — mirrors `tester-mcp-provisioner.ts` |
| `technical-writer-standup-builder.ts` | `buildTechnicalWriterStandupSummary(recentMemory, config)` — derives yesterday / today / blockers from episodic records, returns `StandupSummary` — mirrors `tester-standup-builder.ts` |

### New files — `apps/agent-runtime/src/technical-writer/`

| File | Purpose |
|---|---|
| `doc-diff-builder.ts` | `buildDocUpdateFromDiff(diff, existingDocSections)` — parses a unified diff string, maps changed code symbols and function signatures to their corresponding documentation sections, returns an array of `DocSectionUpdate` (sectionTitle, oldContent, suggestedNewContent, changeReason). Pure function — no connector calls |
| `doc-diff-builder.test.ts` | Unit tests: empty diff returns no updates, diff with renamed function flags doc section, diff with added export suggests new section, diff with deleted export flags removal |
| `api-doc-generator.ts` | `generateApiDocFromOpenApi(openApiJson)` — converts an OpenAPI 3.x JSON object into a Markdown API reference string (paths, methods, parameters, response schemas). `generateApiDocFromCode(sourceText, language)` — extracts JSDoc / TSDoc / docstring comments from source and formats as Markdown. Both return `string` — no connector calls |
| `api-doc-generator.test.ts` | Unit tests: OpenAPI with GET + POST → correct Markdown headings, OpenAPI with no paths → minimal output, code with JSDoc → extracted doc, code with no comments → empty doc |
| `release-notes-builder.ts` | `buildReleaseNotes(prList, options)` — accepts an array of `{ title: string; number: number; labels: string[] }` and groups them by label into sections (Features, Bug Fixes, Chores, Breaking Changes). Returns a structured Markdown release notes string. `classifyPrByLabel(labels)` — maps PR labels to release notes category |
| `release-notes-builder.test.ts` | Unit tests: empty PR list, all PRs in one category, PRs split across categories, unlabelled PR goes to Chores, breaking-change label creates Breaking Changes section |
| `style-guide-checker.ts` | `checkAgainstStyleGuide(documentText, rules)` — accepts document text and a `StyleGuideRule[]` config (each rule: pattern regex, message, severity). Returns a `StyleViolationReport` with per-line violations. `buildStyleViolationReport(violations)` — formats violations as a Markdown table for PR comment or Slack message |
| `style-guide-checker.test.ts` | Unit tests: clean document returns empty violations, passive-voice rule triggers on matching sentence, jargon rule triggers on blocked word, multiple rules fire independently, buildStyleViolationReport Markdown format |

### New file — `apps/agent-runtime/src/role-profiles/`

| File | Purpose |
|---|---|
| `technical-writer-role-profile.ts` | `TECHNICAL_WRITER_BLOCKED_ACTIONS` (Set\<string\>) — hard-blocks developer execution actions (run_tests, code_edit, create_pr from code context, search_candidates, send_email, schedule_meeting, etc.). `TECHNICAL_WRITER_APPROVAL_THRESHOLDS` — opening a PR with doc changes = low risk; deleting an existing doc page = medium risk; publishing to external-facing doc site = high risk |

### Modified files

| File | Change |
|---|---|
| `apps/agent-runtime/src/role-profiles/index.ts` | Import `TECHNICAL_WRITER_ROLE_ALLOWED_CONNECTORS` and `TECHNICAL_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS` from `../technical-writer-agent-profile.js`; replace inline arrays in `technical_writer` profile entry |
| `apps/agent-runtime/src/runtime-server.ts` | Add import of `getTechnicalWriterDefaultPersona` and `provisionTechnicalWriterMcpSession`; wire into bot-startup path |
| `apps/agent-runtime/src/task-classifier.ts` | Import `TECHNICAL_WRITER_BLOCKED_KEYWORDS`; add to role-keyword guard |

---

## Design Decisions

### `doc-diff-builder.ts` — pure function, no LLM
The diff-to-doc-section mapping uses symbol name matching and heuristics only,
not an LLM call. The output is a `DocSectionUpdate[]` array that the agent's
LLM planning loop then uses as input context. This separation keeps the parser
fast, testable, and deterministic.

### `api-doc-generator.ts` — two distinct paths, same output type
OpenAPI-based generation (`generateApiDocFromOpenApi`) works entirely from JSON
structure. Code-based generation (`generateApiDocFromCode`) extracts comments
using regex, not a full AST parser, to avoid adding a heavy parser dependency.
Both return a plain Markdown string so the agent can commit it directly via the
existing `create_pr` / `update_document` action types.

### Style guide rules — config-driven, not hardcoded
`checkAgainstStyleGuide` accepts a `StyleGuideRule[]` at call time. Default
rules are defined in `technical-writer-agent-profile.ts` as a named export.
Tenants can override rules through the connector config without code changes.

### PR action reuse
The Technical Writer role uses the existing `create_pr` action type already in
`TECHNICAL_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS`. No new PR-opening logic is
needed — the writer produces the file content; the executor creates the PR.

---

## Test Targets

| Package | Target pass count |
|---|---|
| `@agentfarm/agent-runtime` | +40 tests above Sprint 15 baseline |

Validation commands:
```
pnpm --filter @agentfarm/agent-runtime typecheck
pnpm --filter @agentfarm/agent-runtime test
pnpm quality:gate
```
