# Phase 5 — Customer-Uploaded Policy Documents (Design + TDD Breakdown)

**Date:** 2026-06-26
**Goal:** Let customers upload policy documents (PDF/DOCX/MD/…) that actually influence agent behavior — not display-only. Two outputs from one upload:
1. **RAG grounding** — embed into `AgentKnowledgeBase` so agents are policy-aware in-context.
2. **Structured extraction** — LLM extracts candidate `GovernanceRule`s → **human review** in the dashboard → apply into the existing unified `GovernancePolicy` (hard-enforced by Phases 1–4).

**Non-negotiables (carried from the plan):** customer policy can only TIGHTEN; nothing auto-applies without human approval; fail-safe (extraction/parse failure never blocks the platform or weakens the floor).

## Reuse (no new infra)
- `@agentfarm/document-converter` `convertToMarkdown(buffer, mimeType)` — PDF/DOCX/XLSX/PPTX/HTML/MD → markdown. Already an api-gateway dep.
- `@agentfarm/memory-service` `chunkText` + `writeSemanticMemory` — RAG grounding (mirror `routes/memory/knowledge-base.ts ingest-file`).
- Existing unified policy route `routes/governance/policy.ts` — candidate rules are applied by publishing into the same combined `rulesJson` document (one active policy per scope).
- `PolicyDocument` model (Phase 1) — already has fileName/mimeType/storageKey/sha256/status/extractedRulesJson/failureReason.

## Storage decision
Single-host: store the converted markdown inline in a new `PolicyDocument.extractedText` column; `storageKey` = `urn:policydoc:<sha256>` (no object-storage/volume). Re-extraction + display work off `extractedText`.

## Data shapes (shared-types)
- `ExtractedRuleCandidate` = `GovernanceRule` + `{ id: string; confidence: number; sourceQuote?: string }`.
- `PolicyDocumentRecord` = row projection incl. `candidates: ExtractedRuleCandidate[]`, `status`, `appliedPolicyId?`, `appliedAt?`.

## TDD groups

### A — Schema + types
- A1: migration — add `extractedText TEXT NULL`, `appliedPolicyId TEXT NULL`, `appliedAt TIMESTAMP NULL` to `PolicyDocument`; schema.prisma. Verify create/read live.
- A2: shared-types `ExtractedRuleCandidate`, `PolicyDocumentRecord` (compile/export = test).

### B — Ingestion pipeline (pure-ish module, injected deps)
- `ingestPolicyDocument({ buffer, fileName, mimeType, tenantId }, { convertFn, extractRulesFn, embedWriteFn, prisma })`:
  1. convert → markdown (fail → status `failed` + failureReason)
  2. embed chunks for RAG (best-effort; failure logged, not fatal)
  3. LLM extract candidates (best-effort; failure → empty candidates, status still `parsed`)
  4. persist `PolicyDocument` (status `parsed`, extractedText, extractedRulesJson=candidates)
- Default `createPolicyRuleExtractor()` — fetch-based LLM call returning strict JSON candidates; validates/normalizes against `GovernanceRule` shape (drops malformed; clamps effect to allow|require_approval|deny).
- Tests: injected fakes — happy path, convert-failure → failed, extract-failure → parsed+empty, malformed LLM JSON dropped, dedup by sha256.

### C — api-gateway routes (`/v1/governance/policy-documents`)
- `POST` (multipart) → store + ingest → 201 record. Auth, tenant from session, sha256 dedup (409 or return existing).
- `GET` list / `GET /:id` (with candidates + extractedText).
- `POST /:id/apply` body `{ scope, roleKey?, candidateIds[] }` → merge selected candidates into the scope's active `GovernancePolicy` (reuse combined-publish), set `appliedPolicyId`/`appliedAt`. Tighten-only.
- `DELETE /:id` → soft remove.
- Tests: route happy/validation/dedup + 3 auth-regression 401s.

### D — Dashboard UI
- `PolicyDocumentsPanel`: upload, list with status, candidate review table (checkboxes + confidence + source quote + effect/connector/tool/env/mode), "Apply selected" → publish into scope. Proxy routes under `app/api/governance/policy-documents/`.
- Verify live in dashboard preview.

### E — Wire + live verify
- Register route in route-registry; rebuild api-gateway image (pre-built); e2e: upload a sample policy → candidates extracted → apply → appears in unified policy → enforced.

## Out of scope (later)
- The "simulate a sample action against this policy" tester (nice-to-have).
- Raw-file retention / object storage (inline markdown is enough single-host).
- Re-extraction UI (data supports it; no button yet).
