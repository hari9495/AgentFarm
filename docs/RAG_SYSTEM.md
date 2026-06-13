# RAG System — Retrieval-Augmented Generation

> **Status:** Production. All 15 agents wired. Last updated: 2026-05-29; re-verified accurate 2026-06-13 (all 15 agent directories present)

---

## Table of Contents

1. [What is RAG and why AgentFarm uses it](#1-what-is-rag-and-why-agentfarm-uses-it)
2. [Core problems RAG solves](#2-core-problems-rag-solves)
3. [Architecture overview](#3-architecture-overview)
4. [Infrastructure layer](#4-infrastructure-layer)
5. [The three retrieval paths](#5-the-three-retrieval-paths)
6. [The lesson flywheel](#6-the-lesson-flywheel)
7. [Where RAG is applied — all 15 agents](#7-where-rag-is-applied--all-15-agents)
8. [Source type registry](#8-source-type-registry)
9. [Memory pattern key taxonomy](#9-memory-pattern-key-taxonomy)
10. [API endpoints](#10-api-endpoints)
11. [Similarity thresholds and performance](#11-similarity-thresholds-and-performance)
12. [How to add RAG to a new agent](#12-how-to-add-rag-to-a-new-agent)
13. [Configuration](#13-configuration)
14. [Testing guidance](#14-testing-guidance)

---

## 1. What is RAG and why AgentFarm uses it

**Retrieval-Augmented Generation (RAG)** augments an LLM's prompt with content retrieved from an external knowledge store — so the model reasons over workspace-specific, up-to-date information rather than relying solely on what it learned during training.

In AgentFarm, every agent action that produces a document, email, script, or code artefact runs RAG before calling the LLM. The agent does not hallucinate generic content — it reads and builds on real, workspace-specific prior work.

### Without RAG

```
User: "Draft a BRD for our payments feature"
Agent → LLM prompt: [role instructions] + [task brief]
LLM: generates generic BRD based on training data
```

### With RAG

```
User: "Draft a BRD for our payments feature"
Agent → knowledge base: finds 2 similar past BRDs (PCI-DSS compliant, same domain)
Agent → template library: fetches GDPR checklist
Agent → memory: retrieves 3 lessons from stakeholder rejections last month
Agent → LLM prompt: [role instructions] + [task brief] + [prior BRDs] + [compliance requirements] + [lessons]
LLM: generates BRD that matches our approval pattern, includes correct compliance requirements, avoids past mistakes
```

The difference compounds over time. After 50 approved BRDs, the knowledge base contains 50 examples of what the stakeholders actually approve — the agent gets measurably better on each subsequent draft.

---

## 2. Core problems RAG solves

### Problem 1: Generic output that requires heavy editing

**Without RAG:** Every LLM-generated document starts from scratch. The agent does not know the organisation's writing style, compliance obligations, preferred templates, or what has been approved before.

**With RAG:** The agent retrieves past approved documents and injects them into the prompt. The LLM produces output consistent with proven patterns, reducing editing time dramatically.

### Problem 2: Repeated mistakes

**Without RAG:** A stakeholder rejects a document for a specific reason. The agent has no memory of this rejection. The same mistake appears in the next draft.

**With RAG (lesson pipeline):** Every rejection is classified into a lesson category (e.g. `scope`, `compliance`, `format`) and stored in `AgentLongTermMemory`. Before the next draft, those lessons are retrieved and injected: *"Do not include infrastructure requirements in the BRD — stakeholder rejected this three times."*

### Problem 3: Missing compliance requirements

**Without RAG:** The agent may or may not know which regulatory requirements apply to a specific domain. It guesses from training data, which may be outdated or incorrect.

**With RAG (template library):** Compliance checklists (GDPR, HIPAA, PCI-DSS, EEOC, FCRA, CIS, etc.) are stored in the knowledge base as `sourceType: *_template`. The retriever specifically searches for these when `complianceFrameworks` is provided, injecting them as mandatory requirements.

### Problem 4: No institutional memory

**Without RAG:** Each session starts cold. Past deal outcomes, winning email sequences, resolved tickets, and deployment runbooks exist nowhere the agent can access.

**With RAG (flywheel):** Every approved artefact is written back into the knowledge base. Approved proposals, winning outreach emails, resolved incident runbooks, and successful test suites accumulate as retrievable institutional memory — available to every agent, every session, across the entire workspace.

### Problem 5: Multi-tenant data leakage risk

**Without RAG:** Naive in-context injection of company data may not respect tenant boundaries.

**With RAG:** Every knowledge base query is scoped by `tenantId` at the SQL level. A tenant's documents, lessons, and templates are never surfaced to another tenant. The optional `botId` scoping provides further isolation at the agent level.

---

## 3. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Action Handler                               │
│                                                                     │
│   params: { ...existing, gatewayBaseUrl?, serviceToken?,            │
│             workspaceId? }                                          │
│                                                                     │
│   ① build*RagContext()          ← RAG Retriever                    │
│   ② wrap callLlm with context   ← callLlm decorator                │
│   ③ execute action cases        ← unchanged, get RAG for free      │
│   ④ on*Approved()               ← flywheel write-back              │
│   ⑤ on*FeedbackReceived()       ← lesson pipeline                  │
└─────────────────────────────────────────────────────────────────────┘
                │                           │
                ▼                           ▼
┌──────────────────────────┐   ┌────────────────────────────────┐
│   AgentKnowledgeBase     │   │   AgentLongTermMemory           │
│   (pgvector 1536-dim)    │   │   (pgvector 1536-dim)           │
│                          │   │                                  │
│  - approved documents    │   │  - lesson patterns               │
│  - domain templates      │   │  - episodic action outcomes      │
│  - compliance checklists │   │  - stakeholder feedback          │
│  - prior work artefacts  │   │                                  │
│                          │   │  key: <agent>:lesson:<cat>:      │
│  scope: tenantId + botId │   │       <workspaceId>:<lessonId>  │
└──────────────────────────┘   └────────────────────────────────┘
                │                           │
                └────────────┬──────────────┘
                             ▼
                 Azure OpenAI Embeddings API
                 (text-embedding-3-small, 1536-dim)
                 POST /openai/deployments/{deployment}/embeddings
```

### Request flow for a RAG-enabled action

```
1. Handler receives params (including optional gatewayBaseUrl)
2. build*RagContext() called — fires 3 concurrent HTTP requests to API Gateway:
   a. POST /v1/knowledge-base/search  (similar prior work, topK=3, minSim=0.65)
   b. POST /v1/knowledge-base/search  (templates/compliance, topK=4-5, minSim=0.55)
   c. GET  /v1/workspaces/:id/memory/patterns  (lessons by prefix)
3. Results assembled into ## Context block (empty string if nothing found)
4. callLlm wrapped: every LLM call in the handler gets context prepended to system prompt
5. Action cases execute unchanged — RAG is transparent
6. After completion:
   - on*Approved() → POST /v1/knowledge-base/write (flywheel)
   - on*FeedbackReceived() → POST /v1/memory/patterns (lesson learned)
```

---

## 4. Infrastructure layer

### Database tables

#### `AgentKnowledgeBase` — semantic memory (company knowledge RAG)

| Column | Type | Description |
|--------|------|-------------|
| `id` | `String` | CUID primary key |
| `tenantId` | `String` | Tenant isolation — mandatory in every query |
| `botId` | `String?` | Optional agent-level isolation |
| `content` | `String` | The knowledge chunk text (up to 8,192 chars for embedding) |
| `sourceUrl` | `String?` | Original document URL or `urn:agentfarm:*` identifier |
| `sourceType` | `String` | Classification for retrieval filtering (see §8) |
| `embeddingModel` | `String?` | Azure OpenAI deployment name used to embed this chunk |
| `embedding` | `vector(1536)?` | pgvector embedding — the 1536-dimension float32 vector |
| `createdAt` | `DateTime` | Write timestamp |
| `updatedAt` | `DateTime` | Last update timestamp |

**Indexes:** `tenantId`, `botId`

#### `AgentLongTermMemory` — episodic memory (lessons, patterns)

| Column | Type | Description |
|--------|------|-------------|
| `id` | `String` | CUID primary key |
| `tenantId` | `String` | Tenant isolation |
| `workspaceId` | `String` | Workspace scope |
| `botId` | `String?` | Optional agent scope |
| `pattern` | `String` | Structured key (e.g. `ba:lesson:scope:ws123:lesson456`) |
| `summary` | `String?` | Human-readable description of the pattern |
| `confidence` | `Float` | Confidence score (0–1), updated with `GREATEST()` on upsert |
| `observedCount` | `Int` | Increments on every upsert — tracks how many times seen |
| `lastSeen` | `DateTime` | Recency signal for retrieval ranking |
| `embeddingModel` | `String?` | Embedding model name |
| `embedding` | `vector(1536)?` | pgvector embedding for semantic recall |

**Indexes:** `(workspaceId, confidence)`, `(tenantId, workspaceId)`, `botId`
**Unique constraint:** `(tenantId, pattern)` — upserts on repeated observations

### Embedding service

**File:** [`packages/memory-service/src/embed.ts`](../packages/memory-service/src/embed.ts)

```typescript
export type EmbedFn = (text: string) => Promise<number[]>; // 1536-dim float32

createEmbedFn({ endpoint, deployment, apiKey })
// → Azure OpenAI /openai/deployments/{deployment}/embeddings?api-version=2024-02-01
// text is sliced to 8,192 chars (API hard cap)
// timeout: 15s
```

**Model:** `text-embedding-3-small` (1536 dimensions, cost-effective, high quality)

### Vector similarity operator

AgentFarm uses the **pgvector cosine-distance operator `<=>`**:

```sql
1 - (embedding <=> query_vector::vector) AS similarity
```

A similarity of `1.0` = identical vectors. A similarity of `0.0` = orthogonal (unrelated). The `<=>` operator returns cosine distance; subtracting from 1 gives cosine similarity.

**No HNSW index is used on these tables** — the evidence-service uses HNSW for its own search, but `AgentKnowledgeBase` and `AgentLongTermMemory` use a sequential scan with a `LIMIT`. At workspace scale (thousands of chunks, not millions), this is fast enough and avoids index maintenance overhead.

### Memory service package

**File:** [`packages/memory-service/src/index.ts`](../packages/memory-service/src/index.ts)

```typescript
// Write
writeSemanticMemory(request, embedFn, prisma, deployment)   // → AgentKnowledgeBase
writeEpisodicMemory(request, embedFn, prisma, deployment)   // → AgentLongTermMemory (with embedding)
writeEpisodicMemoryNoEmbed(request, prisma)                 // → AgentLongTermMemory (text only)

// Search
searchSemanticMemory(request, embedFn, prisma)              // cosine similarity over AgentKnowledgeBase
searchEpisodicMemory(request, embedFn, prisma)              // cosine similarity over AgentLongTermMemory
searchEpisodicMemoryNoEmbed(request, prisma)                // ILIKE text fallback
```

---

## 5. The three retrieval paths

Every agent RAG retriever runs three searches **concurrently** via `Promise.all()`:

```typescript
const [similarArtifacts, templateChunks, lessons] = await Promise.all([
    retrieveSimilarPriorWork(query, ...),    // Path 1
    retrieveDomainTemplates(query, ...),     // Path 2
    retrieveAgentLessons(tenantId, ...),     // Path 3
]);
```

### Path 1 — Similar prior work (cosine similarity, minSimilarity = 0.65)

Searches `AgentKnowledgeBase` for past **approved** artefacts that match the current task.

- **Filter:** `sourceType !== '*_template'` (excludes templates, targets real prior work)
- **topK:** 3 results by default
- **Query built from:** task title, task description, domain, deal stage, role, channels, etc.
- **What it returns:** Past proposals the deal was won with, BRDs that were approved, emails with high reply rates, runbooks that resolved incidents, etc.

The LLM sees real examples of what this workspace actually approves — not generic internet content.

### Path 2 — Domain templates and compliance requirements (minSimilarity = 0.55)

Searches `AgentKnowledgeBase` for **templates, checklists, and regulatory requirements**.

- **Filter:** `sourceType === '*_template'` (targets templates only)
- **topK:** 4–5 results by default
- **Lower threshold:** 0.55 (wider recall — better for compliance where partial match is fine)
- **What it returns:** GDPR data subject rights requirements, HIPAA PHI handling rules, EEOC non-discrimination language, CIS security benchmarks, brand voice guidelines, interview scorecard frameworks, etc.

When a recruiter agent writes a job description for a healthcare role with `complianceFrameworks: ['eeoc', 'hipaa']`, this path retrieves the mandatory legal language and disclosures. These are injected as **requirements, not suggestions**.

### Path 3 — Workspace lessons from long-term memory

Queries `AgentLongTermMemory` for patterns matching `<agent>:lesson:` prefix for this workspace.

- **No embedding used** — filtered by key prefix, sorted by confidence descending
- **topK:** up to 10 lessons
- **What it returns:** Structured lessons from past rejections and failures (see §6)

The LLM is instructed to apply these lessons proactively rather than waiting for the same rejection.

### Context block assembly

```typescript
const contextBlock =
    sections.length > 0
        ? `## <Agent> Context\n\n${sections.join('\n---\n\n')}`
        : '';
```

If nothing is retrieved, `contextBlock` is an empty string and nothing is injected — no degradation of existing behaviour.

The block is prepended to `callLlm`'s system prompt via a wrapper:

```typescript
callLlm = (prompt: string, sys?: string): Promise<string> =>
    rawCallLlm(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
```

Every LLM call inside the handler receives the context automatically, with no changes to individual action cases.

---

## 6. The lesson flywheel

The lesson flywheel is the mechanism that makes AgentFarm agents get better over time without retraining.

```
                    ┌─────────────────────────────┐
                    │       Task Execution         │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │       RAG retrieves           │
                    │       past lessons            │
                    └─────────────┬───────────────┘
                                  │ lessons injected into prompt
                    ┌─────────────▼───────────────┐
                    │       LLM generates           │
                    │       artefact                │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │       Human reviews           │
                    └──────┬──────────────┬────────┘
                           │ APPROVED     │ REJECTED
              ┌────────────▼──┐      ┌───▼──────────────────┐
              │ on*Approved() │      │ on*FeedbackReceived() │
              │               │      │                        │
              │ ingest into   │      │ classifyFeedback()     │
              │ AgentKnowledge│      │ → lesson category      │
              │ Base          │      │                        │
              │               │      │ store in              │
              │ (future drafts│      │ AgentLongTermMemory   │
              │ reference this│      │                        │
              │ as prior work)│      │ (next draft retrieves │
              └───────────────┘      │ this lesson and avoids│
                                     │ the mistake)          │
                                     └───────────────────────┘
```

### Lesson classification (heuristic, no LLM)

Each lesson pipeline includes a `classifyFeedback(body: string): LessonCategory` function that uses regex patterns to categorise feedback text into domain-specific categories — **no LLM call, no extra cost, no latency.**

Example — business-analyst:
```typescript
{ pattern: /\b(out of scope|scope creep|not included)\b/i, category: 'scope' }
{ pattern: /\b(vague|ambiguous|unclear)\b/i, category: 'clarity' }
{ pattern: /\b(missing|not included|forgot)\b/i, category: 'completeness' }
```

The heuristic covers the most common rejection phrases. When no pattern matches, a safe default category is used (e.g. `clarity` for BA, `resolution_quality` for support, `discovery` for sales).

### Lesson persistence format

Lessons are stored in `AgentLongTermMemory` with this key structure:

```
<agent_prefix>:lesson:<category>:<workspaceId>:<lessonId>
```

Example:
```
ba:lesson:scope:ws_abc123:lesson_xyz789
```

The `summary` field is human-readable for debugging: `[scope] Do not include DevOps infrastructure requirements in the BRD`

The `metadata` JSON column carries the full `*Lesson` object for reconstruction.

### Upsert behaviour

`AgentLongTermMemory` has a unique constraint on `(tenantId, pattern)`. When the same pattern key is written again (same workspace, same lesson ID), the row upserts:

```sql
ON CONFLICT ("tenantId", "pattern") DO UPDATE SET
    "summary"       = EXCLUDED."summary",
    "confidence"    = GREATEST("AgentLongTermMemory"."confidence", EXCLUDED."confidence"),
    "observedCount" = "AgentLongTermMemory"."observedCount" + 1,
    "lastSeen"      = NOW()
```

`observedCount` grows every time the same lesson is reinforced. `confidence` only increases (never decreases via `GREATEST`). Lessons with high `observedCount` and `confidence` are ranked higher in retrieval.

---

## 7. Where RAG is applied — all 15 agents

### Coverage map

| Agent | RAG Retriever | Lesson Pipeline | Handler Integration | Lesson Key Prefix |
|-------|--------------|-----------------|--------------------|--------------------|
| `business-analyst` | [business-analyst-rag-retriever.ts](../apps/agent-runtime/src/agents/business-analyst/business-analyst-rag-retriever.ts) | [business-analyst-lesson-pipeline.ts](../apps/agent-runtime/src/agents/business-analyst/business-analyst-lesson-pipeline.ts) | [business-analyst-action-handler.ts](../apps/agent-runtime/src/agents/business-analyst/business-analyst-action-handler.ts) | `ba:lesson:` |
| `sales-agent` | [sales-agent-rag-retriever.ts](../apps/agent-runtime/src/agents/sales-agent/sales-agent-rag-retriever.ts) | [sales-agent-lesson-pipeline.ts](../apps/agent-runtime/src/agents/sales-agent/sales-agent-lesson-pipeline.ts) | [sales-action-handler.ts](../apps/agent-runtime/src/agents/sales-agent/sales-action-handler.ts) | `sales:lesson:` |
| `recruiter` | [recruiter-rag-retriever.ts](../apps/agent-runtime/src/agents/recruiter/recruiter-rag-retriever.ts) | [recruiter-lesson-pipeline.ts](../apps/agent-runtime/src/agents/recruiter/recruiter-lesson-pipeline.ts) | [recruiter-action-handler.ts](../apps/agent-runtime/src/agents/recruiter/recruiter-action-handler.ts) | `rec:lesson:` |
| `content-writer` | [content-writer-rag-retriever.ts](../apps/agent-runtime/src/agents/content-writer/content-writer-rag-retriever.ts) | [content-writer-lesson-pipeline.ts](../apps/agent-runtime/src/agents/content-writer/content-writer-lesson-pipeline.ts) | [content-writer-action-handler.ts](../apps/agent-runtime/src/agents/content-writer/content-writer-action-handler.ts) | `cw:lesson:` |
| `technical-writer` | [technical-writer-rag-retriever.ts](../apps/agent-runtime/src/agents/technical-writer/technical-writer-rag-retriever.ts) | [technical-writer-lesson-pipeline.ts](../apps/agent-runtime/src/agents/technical-writer/technical-writer-lesson-pipeline.ts) | [technical-writer-action-handler.ts](../apps/agent-runtime/src/agents/technical-writer/technical-writer-action-handler.ts) | `tw:lesson:` |
| `project-manager` | [project-manager-rag-retriever.ts](../apps/agent-runtime/src/agents/project-manager/project-manager-rag-retriever.ts) | [project-manager-lesson-pipeline.ts](../apps/agent-runtime/src/agents/project-manager/project-manager-lesson-pipeline.ts) | [project-manager-action-handler.ts](../apps/agent-runtime/src/agents/project-manager/project-manager-action-handler.ts) | `pm:lesson:` |
| `marketing-specialist` | [marketing-specialist-rag-retriever.ts](../apps/agent-runtime/src/agents/marketing-specialist/marketing-specialist-rag-retriever.ts) | [marketing-specialist-lesson-pipeline.ts](../apps/agent-runtime/src/agents/marketing-specialist/marketing-specialist-lesson-pipeline.ts) | [marketing-specialist-action-handler.ts](../apps/agent-runtime/src/agents/marketing-specialist/marketing-specialist-action-handler.ts) | `ms:lesson:` |
| `devops` | [devops-rag-retriever.ts](../apps/agent-runtime/src/agents/devops/devops-rag-retriever.ts) | [devops-lesson-pipeline.ts](../apps/agent-runtime/src/agents/devops/devops-lesson-pipeline.ts) | [devops-action-handler.ts](../apps/agent-runtime/src/agents/devops/devops-action-handler.ts) | `devops:lesson:` |
| `full-stack-developer` | [fsd-rag-retriever.ts](../apps/agent-runtime/src/agents/full-stack-developer/fsd-rag-retriever.ts) | [fsd-lesson-pipeline.ts](../apps/agent-runtime/src/agents/full-stack-developer/fsd-lesson-pipeline.ts) | [fsd-action-handler.ts](../apps/agent-runtime/src/agents/full-stack-developer/fsd-action-handler.ts) | `fsd:lesson:` |
| `developer` | [developer-rag-retriever.ts](../apps/agent-runtime/src/agents/developer/developer-rag-retriever.ts) | [developer-episodic-hooks.ts](../apps/agent-runtime/src/agents/developer/developer-episodic-hooks.ts) *(pre-existing)* | [developer-action-handler.ts](../apps/agent-runtime/src/agents/developer/developer-action-handler.ts) | `dev:` |
| `customer-support-executive` | [customer-support-rag-retriever.ts](../apps/agent-runtime/src/agents/customer-support-executive/customer-support-rag-retriever.ts) | [customer-support-lesson-pipeline.ts](../apps/agent-runtime/src/agents/customer-support-executive/customer-support-lesson-pipeline.ts) | [customer-support-executive-action-handler.ts](../apps/agent-runtime/src/agents/customer-support-executive/customer-support-executive-action-handler.ts) | `cs:lesson:` |
| `corporate-assistant` | [corporate-assistant-rag-retriever.ts](../apps/agent-runtime/src/agents/corporate-assistant/corporate-assistant-rag-retriever.ts) | [corporate-assistant-lesson-pipeline.ts](../apps/agent-runtime/src/agents/corporate-assistant/corporate-assistant-lesson-pipeline.ts) | [corporate-assistant-action-handler.ts](../apps/agent-runtime/src/agents/corporate-assistant/corporate-assistant-action-handler.ts) | `ca:lesson:` |
| `mobile` | [mobile-rag-retriever.ts](../apps/agent-runtime/src/agents/mobile/mobile-rag-retriever.ts) | [mobile-lesson-pipeline.ts](../apps/agent-runtime/src/agents/mobile/mobile-lesson-pipeline.ts) | [mobile-action-handler.ts](../apps/agent-runtime/src/agents/mobile/mobile-action-handler.ts) | `mobile:lesson:` |
| `tester` | [tester-rag-retriever.ts](../apps/agent-runtime/src/agents/tester/tester-rag-retriever.ts) | [tester-lesson-pipeline.ts](../apps/agent-runtime/src/agents/tester/tester-lesson-pipeline.ts) | [tester-action-handler.ts](../apps/agent-runtime/src/agents/tester/tester-action-handler.ts) | `tester:lesson:` |
| `meeting-agent` | [meeting-agent-rag-retriever.ts](../apps/agent-runtime/src/agents/meeting-agent/meeting-agent-rag-retriever.ts) | [meeting-agent-lesson-pipeline.ts](../apps/agent-runtime/src/agents/meeting-agent/meeting-agent-lesson-pipeline.ts) | [meeting-transcription.ts](../apps/agent-runtime/src/agents/meeting-agent/meeting-transcription.ts) | `meeting:lesson:` |

### Per-agent retrieval paths and lesson categories

#### Business Analyst

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past BRDs, user stories, acceptance criteria, gap analyses | `ba_approved_document` |
| Templates | Compliance checklists (GDPR, HIPAA, PCI-DSS, SOC2, MIFID2, etc.) | `ba_domain_template` |
| Lessons | Stakeholder rejection reasons classified by category | `ba:lesson:*` |

Lesson categories: `scope` · `clarity` · `completeness` · `stakeholder_alignment` · `technical_accuracy` · `format` · `risk_omission`

---

#### Sales Agent

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past proposals, outreach emails, winning deal artefacts | `sales_approved_artifact` |
| Templates | Objection rebuttal scripts, negotiation playbooks | `sales_playbook_template` |
| Lessons | Deal feedback classified by failure mode | `sales:lesson:*` |

Lesson categories: `email_personalization` · `objection_handling` · `proposal_quality` · `timing` · `closing_technique` · `follow_up` · `discovery`

---

#### Recruiter

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past JDs, offer letters, interview guides, phone screen scripts | `recruiter_approved_artifact` |
| Templates | EEOC disclosures, FCRA notices, GDPR recruitment workflows, IR35 | `recruiter_compliance_template` |
| Lessons | Hiring outcome feedback classified by failure mode | `rec:lesson:*` |

Lesson categories: `jd_quality` · `screening_accuracy` · `interview_process` · `offer_strategy` · `candidate_experience` · `compliance` · `diversity`

---

#### Content Writer

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past published articles, blog posts, email copy | `cw_published_content` |
| Templates | Brand voice guidelines, editorial style guides | `cw_brand_guide_template` |
| Lessons | Editor revision comments classified by issue type | `cw:lesson:*` |

Lesson categories: `brand_voice` · `seo_optimization` · `factual_accuracy` · `structure` · `engagement` · `tone` · `clarity`

---

#### Technical Writer

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past API docs, tutorials, release notes, manuals | `tw_approved_doc` |
| Templates | Style guide rules, doc templates, audience standards | `tw_style_guide_template` |
| Lessons | SME review feedback and user confusion reports | `tw:lesson:*` |

Lesson categories: `completeness` · `accuracy` · `structure` · `style_compliance` · `audience_fit` · `code_examples` · `versioning`

---

#### Project Manager

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past project charters, risk registers, status reports | `pm_approved_artifact` |
| Templates | Sprint frameworks, risk matrices, ceremony guides | `pm_methodology_template` |
| Lessons | Delivery failure feedback and retro insights | `pm:lesson:*` |

Lesson categories: `scope_management` · `estimation` · `risk_identification` · `stakeholder_communication` · `delivery_predictability` · `resource_allocation` · `retrospective_insights`

---

#### Marketing Specialist

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past campaign plans, high-performing email sequences, KPI reports | `ms_approved_campaign` |
| Templates | Channel playbooks (email, PPC, SEO, social, influencer) | `ms_channel_playbook_template` |
| Lessons | Campaign post-mortem feedback | `ms:lesson:*` |

Lesson categories: `targeting_accuracy` · `creative_quality` · `channel_selection` · `budget_allocation` · `timing` · `message_clarity` · `conversion_optimization`

---

#### DevOps

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past runbooks, incident reports, IaC configurations | `devops_approved_artifact` |
| Templates | CIS benchmarks, Helm chart templates, deployment checklists | `devops_infra_template` |
| Lessons | Post-mortem findings and deployment failure root causes | `devops:lesson:*` |

Lesson categories: `incident_response` · `deployment_safety` · `configuration_management` · `monitoring_gaps` · `security_compliance` · `cost_optimization` · `reliability`

---

#### Full-Stack Developer

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past component implementations, API designs, feature code | `fsd_approved_implementation` |
| Templates | Design system patterns, ADRs, accessibility standards | `fsd_design_pattern` |
| Lessons | Code review feedback classified by failure type | `fsd:lesson:*` |

Lesson categories: `code_quality` · `performance` · `accessibility` · `api_design` · `testing_strategy` · `security` · `architecture`

---

#### Developer

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past approved code solutions, PR descriptions | `dev_approved_implementation` |
| Templates | Architecture patterns, coding standards | `dev_architecture_pattern` |
| Lessons | Code review rejections and PR feedback (via episodic hooks) | `dev:*` |

The developer agent uses pre-existing `developer-episodic-hooks.ts` for lesson tracking — no separate lesson pipeline needed.

---

#### Customer Support Executive

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past successfully resolved tickets | `support_resolved_ticket` |
| Templates | Product knowledge articles, FAQ entries, known issue workarounds | `support_knowledge_article` |
| Lessons | CSAT failure feedback, escalation mistakes, SLA breaches | `cs:lesson:*` |

Lesson categories: `resolution_quality` · `escalation_timing` · `empathy` · `product_accuracy` · `sla_compliance` · `de_escalation` · `follow_through`

---

#### Corporate Assistant

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past approved emails, memos, meeting summaries | `ca_approved_communication` |
| Templates | Communication templates, escalation protocols | `ca_communication_template` |
| Lessons | Communication failure feedback | `ca:lesson:*` |

Lesson categories: `tone` · `completeness` · `urgency_detection` · `stakeholder_awareness` · `formatting` · `confidentiality` · `escalation_timing`

---

#### Mobile Agent

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past approved SwiftUI/Compose components, API clients | `mobile_approved_component` |
| Templates | HIG guidelines, Material Design rules, component library standards | `mobile_platform_guideline` |
| Lessons | App Store rejections, crash report root causes, UX review notes | `mobile:lesson:*` |

Lesson categories: `platform_consistency` · `performance` · `accessibility` · `ux_patterns` · `code_quality` · `testing_coverage` · `api_integration`

---

#### Tester

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past test plans, effective bug reports, regression suites | `tester_approved_suite` |
| Templates | Testing checklists, security test frameworks, test plan templates | `tester_checklist_template` |
| Lessons | Missed bug root causes, coverage gap reports | `tester:lesson:*` |

Lesson categories: `coverage_gaps` · `bug_reproduction` · `edge_cases` · `environment_setup` · `test_quality` · `regression_detection` · `reporting`

---

#### Meeting Agent

| Path | Content retrieved | Source type |
|------|------------------|-------------|
| Prior work | Past meeting summaries, recurring decisions, open action items | `meeting_approved_summary` |
| Templates | Meeting summary formats, agenda templates | `meeting_summary_template` |
| Lessons | Missed action item reports, summary correction feedback | `meeting:lesson:*` |

Lesson categories: `action_item_clarity` · `decision_capture` · `participant_engagement` · `summary_accuracy` · `follow_up_tracking` · `time_management`

---

## 8. Source type registry

The `sourceType` field on every `AgentKnowledgeBase` row determines which retrieval path finds it. Retrieval path 1 excludes template types; path 2 includes only template types. This is enforced via client-side filtering after the vector search.

| Source type | Agent | Retrieval path | Written by |
|-------------|-------|----------------|------------|
| `ba_approved_document` | Business Analyst | Path 1 (prior work) | `ingestApprovedDocument()` |
| `ba_domain_template` | Business Analyst | Path 2 (templates) | Domain library seeding |
| `sales_approved_artifact` | Sales Agent | Path 1 | `ingestApprovedSalesArtifact()` |
| `sales_playbook_template` | Sales Agent | Path 2 | Playbook seeding |
| `recruiter_approved_artifact` | Recruiter | Path 1 | `ingestApprovedHiringArtifact()` |
| `recruiter_compliance_template` | Recruiter | Path 2 | Compliance seeding |
| `cw_published_content` | Content Writer | Path 1 | `ingestPublishedContent()` |
| `cw_brand_guide_template` | Content Writer | Path 2 | Brand guide seeding |
| `tw_approved_doc` | Technical Writer | Path 1 | `ingestApprovedDoc()` |
| `tw_style_guide_template` | Technical Writer | Path 2 | Style guide seeding |
| `pm_approved_artifact` | Project Manager | Path 1 | `ingestApprovedPmArtifact()` |
| `pm_methodology_template` | Project Manager | Path 2 | Methodology seeding |
| `ms_approved_campaign` | Marketing Specialist | Path 1 | `ingestApprovedCampaign()` |
| `ms_channel_playbook_template` | Marketing Specialist | Path 2 | Playbook seeding |
| `devops_approved_artifact` | DevOps | Path 1 | `ingestApprovedOpsArtifact()` |
| `devops_infra_template` | DevOps | Path 2 | Infra template seeding |
| `fsd_approved_implementation` | Full-Stack Developer | Path 1 | `ingestApprovedImplementation()` |
| `fsd_design_pattern` | Full-Stack Developer | Path 2 | Design system seeding |
| `dev_approved_implementation` | Developer | Path 1 | `ingestApprovedImplementation()` |
| `dev_architecture_pattern` | Developer | Path 2 | ADR seeding |
| `support_resolved_ticket` | Customer Support | Path 1 | `ingestResolvedTicket()` |
| `support_knowledge_article` | Customer Support | Path 2 | KB article seeding |
| `ca_approved_communication` | Corporate Assistant | Path 1 | `ingestApprovedCommunication()` |
| `ca_communication_template` | Corporate Assistant | Path 2 | Template seeding |
| `mobile_approved_component` | Mobile Agent | Path 1 | `ingestApprovedMobileComponent()` |
| `mobile_platform_guideline` | Mobile Agent | Path 2 | Platform guideline seeding |
| `tester_approved_suite` | Tester | Path 1 | `ingestApprovedTestSuite()` |
| `tester_checklist_template` | Tester | Path 2 | Checklist seeding |
| `meeting_approved_summary` | Meeting Agent | Path 1 | `ingestMeetingSummary()` |
| `meeting_summary_template` | Meeting Agent | Path 2 | Summary format seeding |

---

## 9. Memory pattern key taxonomy

Pattern keys in `AgentLongTermMemory` follow a structured naming convention:

```
<agent_prefix>:lesson:<category>:<workspaceId>:<lessonId>   ← new lesson pipeline
<agent_prefix>:<action_type>:<outcome>                       ← episodic action hooks
```

### Lesson keys (written by lesson pipelines)

```
ba:lesson:scope:ws_abc:lesson_123
ba:lesson:clarity:ws_abc:lesson_456
sales:lesson:email_personalization:ws_abc:lesson_789
rec:lesson:jd_quality:ws_abc:lesson_012
cw:lesson:brand_voice:ws_abc:lesson_345
tw:lesson:completeness:ws_abc:lesson_678
pm:lesson:scope_management:ws_abc:lesson_901
ms:lesson:targeting_accuracy:ws_abc:lesson_234
devops:lesson:incident_response:ws_abc:lesson_567
fsd:lesson:performance:ws_abc:lesson_890
cs:lesson:resolution_quality:ws_abc:lesson_123
ca:lesson:tone:ws_abc:lesson_456
mobile:lesson:platform_consistency:ws_abc:lesson_789
tester:lesson:coverage_gaps:ws_abc:lesson_012
meeting:lesson:action_item_clarity:ws_abc:lesson_345
```

### Episodic action keys (written by episodic hooks)

```
ba:draft_brd:success
ba:finalize_brd:approved
ba:finalize_brd:rejected
pm:project_charter:success
pm:sprint_plan:fail
sales:deal_close:won
sales:deal_close:lost
sales:proposal_generate:success
rec:generate_offer:accepted
rec:generate_offer:rejected
dev:implement_feature:success
devops:tf_apply:success
cw:write_prose:success
tw:api_doc_openapi:success
```

---

## 10. API endpoints

All RAG operations go through the API Gateway. Agent runtimes never write to Postgres directly.

### Knowledge base

```
POST /v1/knowledge-base/write
  Body: { tenantId, botId?, content, sourceUrl?, sourceType }
  → Embeds content, stores in AgentKnowledgeBase
  → Returns: { id }

POST /v1/knowledge-base/search
  Body: { tenantId, botId?, queryText, topK?, minSimilarity? }
  → Embeds queryText, cosine-similarity search
  → Returns: { results: [{ id, content, sourceUrl, sourceType, similarity }] }
```

### Memory patterns

```
POST /v1/memory/patterns
  Body: { tenantId, workspaceId, pattern, summary, confidence, observedCount, lastSeen, metadata? }
  → Upserts into AgentLongTermMemory on (tenantId, pattern)

GET /v1/workspaces/:workspaceId/memory/patterns
  → Returns all patterns for workspace (no embedding search — prefix filtered by client)
  → Returns: { patterns: [{ pattern, summary, confidence, observedCount, lastSeen, metadata }] }
```

### Auth

All RAG API calls use `Authorization: Bearer <serviceToken>`. In production this is the `RUNTIME_TASK_SHARED_TOKEN` or `CONNECTOR_EXEC_SHARED_TOKEN`. Requests from agent runtimes include `x-tenant-id` for gateway-level tenant validation.

---

## 11. Similarity thresholds and performance

| Parameter | Default | Configurable | Notes |
|-----------|---------|--------------|-------|
| `minSimilarity` (path 1, prior work) | 0.65 | Yes, per query | Lower = wider recall, more noise |
| `minSimilarity` (path 2, templates) | 0.55 | Fixed | Lower threshold intentional — better recall for compliance |
| `topK` (path 1) | 3 | Yes, per agent | Enough for prompt enrichment without token bloat |
| `topK` (path 2) | 4–5 | Yes, per agent | Templates tend to be chunked — need more results |
| `topK` (path 3, lessons) | up to 10 | Fixed | All lessons fetched, sorted by confidence |
| Embedding API timeout | 15s | Fixed | Per `createEmbedFn` |
| Knowledge base search timeout | 15s | Fixed | Per retriever `AbortSignal.timeout` |
| Memory patterns timeout | 10s | Fixed | Per retriever `AbortSignal.timeout` |

### Content truncation in prompts

Retrieved chunks are truncated before injection to manage token consumption:

| Section | Max chars per chunk |
|---------|--------------------:|
| Similar prior work | 600 |
| Templates / compliance | 800 |
| Lessons | 200 (summary field) |

The LLM context budget is preserved: a typical RAG context block adds ~2,000–4,000 tokens depending on how many results are returned.

### Failure characteristics

All three retrieval paths are wrapped in `try/catch` inside `build*RagContext()`. A gateway outage, embedding failure, or network error returns an empty `contextBlock` — the agent executes the action normally without RAG context. **RAG is strictly additive: its failure never blocks execution.**

---

## 12. How to add RAG to a new agent

### Step 1 — Create `<agent>-rag-retriever.ts`

Use any existing retriever as a template (e.g. [`sales-agent-rag-retriever.ts`](../apps/agent-runtime/src/agents/sales-agent/sales-agent-rag-retriever.ts)):

```typescript
// 1. Define query types specific to this agent's domain
export interface MyAgentRagQuery {
    tenantId: string;
    botId?: string;
    taskTitle: string;
    taskDescription: string;
    documentType: MyDocumentType;
    // ...domain fields
}

export interface MyAgentRagContext {
    contextBlock: string;
    similarArtifactCount: number;
    templateChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

// 2. Implement three retrieval functions
async function retrieveSimilarArtifacts(query, gatewayBaseUrl, serviceToken) { ... }
async function retrieveTemplates(query, gatewayBaseUrl, serviceToken) { ... }
async function retrieveAgentLessons(tenantId, workspaceId, gatewayBaseUrl, serviceToken) { ... }

// 3. Export the context builder
export async function buildMyAgentRagContext(
    query: MyAgentRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
): Promise<MyAgentRagContext> {
    const [artifacts, templates, lessons] = await Promise.all([...]);
    // assemble contextBlock
    return { contextBlock, similarArtifactCount, templateChunkCount, lessonCount, retrievedAt };
}

// 4. Export the flywheel ingest function
export async function ingestApprovedArtifact(params) { ... }
```

### Step 2 — Create `<agent>-lesson-pipeline.ts`

Use any existing pipeline as a template (e.g. [`sales-agent-lesson-pipeline.ts`](../apps/agent-runtime/src/agents/sales-agent/sales-agent-lesson-pipeline.ts)):

```typescript
// 1. Define lesson categories for this domain
export type MyLessonCategory = 'quality' | 'completeness' | 'alignment' | ...;

// 2. Implement lesson store (in-memory for tests, gateway-backed for production)
export class GatewayMyLessonStore implements IMyLessonStore { ... }

// 3. Implement the heuristic classifier (regex patterns, no LLM)
const CATEGORY_PATTERNS = [
    { pattern: /\b(quality|poor|not good enough)\b/i, category: 'quality' },
    ...
];
export function classifyMyFeedback(body: string): MyLessonCategory { ... }

// 4. Export the ingest and format functions
export async function ingestMyFeedback(ctx, feedbackItems, store) { ... }
export function formatMyLessonsForPrompt(lessons) { ... }

// 5. Export episodic hooks for the execution engine
export function buildMyEpisodicPattern(task, result) { ... }
export function buildMyEpisodicSummary(task, result) { ... }
```

### Step 3 — Wire into the action handler

Add optional gateway params to the handler's params type/interface:

```typescript
export interface MyActionParams {
    // ... existing params ...
    gatewayBaseUrl?: string;   // ADD
    serviceToken?: string;     // ADD
    workspaceId?: string;      // ADD
}
```

Add the RAG pre-flight at the top of the handler function, before the switch statement:

```typescript
export async function handleMyAction(params: MyActionParams) {
    const { ..., callLlm: rawCallLlm, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = params;

    // RAG pre-flight
    let callLlm = rawCallLlm;
    if (rawCallLlm && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildMyAgentRagContext } = await import('./my-agent-rag-retriever.js');
            const ragCtx = await buildMyAgentRagContext(
                { tenantId, botId, taskTitle: String(payload['title'] ?? actionType), ... },
                gatewayBaseUrl, serviceToken, workspaceId,
            );
            if (ragCtx.contextBlock) {
                callLlm = (prompt, sys) =>
                    rawCallLlm(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
            }
        } catch { /* non-fatal */ }
    }

    switch (actionType) { /* unchanged */ }
}
```

Add post-decision hooks at the bottom:

```typescript
export async function onMyArtifactApproved(params) { ... }
export async function onMyFeedbackReceived(params) { ... }
```

### Step 4 — Register source types

Decide the `sourceType` strings this agent uses for prior work and templates. Add them to the source type registry table in §8 of this document.

### Step 5 — Seed templates (optional)

If this agent uses compliance or style templates, write them into `AgentKnowledgeBase` at workspace setup time using `POST /v1/knowledge-base/write` with `sourceType: '<agent>_<type>_template'`.

### Step 6 — Update CLAUDE.md

Add the new agent to the coverage table in the `## RAG` section of [CLAUDE.md](../CLAUDE.md).

---

## 13. Configuration

### Required environment variables

| Variable | Used by | Description |
|----------|---------|-------------|
| `AZURE_OPENAI_ENDPOINT` | `createEmbedFn` | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | `createEmbedFn` | Deployment name (default: `text-embedding-3-small`) |
| `AZURE_OPENAI_API_KEY` | `createEmbedFn` | Azure OpenAI API key |
| `API_GATEWAY_URL` | Agent runtimes | Gateway base URL for knowledge-base and memory API calls |
| `RUNTIME_TASK_SHARED_TOKEN` | Agent runtimes | HMAC token for RAG API calls from agent runtime |
| `CONNECTOR_EXEC_SHARED_TOKEN` | Agent runtimes | Alternative token for connector-gateway-routed calls |

### Optional tuning

Override per-agent defaults by extending the RAG query params:

```typescript
buildSalesRagContext(
    {
        ...query,
        topKDocuments: 5,        // default: 3
        topKPlaybooks: 8,         // default: 4
        minSimilarity: 0.70,      // default: 0.65
    },
    gatewayBaseUrl, serviceToken, workspaceId
);
```

### Disabling RAG for a workspace

Pass `gatewayBaseUrl: undefined` (or omit it) when calling the handler — the pre-flight check `if (rawCallLlm && gatewayBaseUrl && serviceToken && workspaceId)` will short-circuit and RAG is skipped entirely.

---

## 14. Testing guidance

### Unit testing RAG retrievers

Mock `fetch` to return controlled results:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesRagContext } from './sales-agent-rag-retriever.js';

test('returns empty contextBlock when KB has no results', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });

    const ctx = await buildSalesRagContext(
        { tenantId: 't1', botId: 'b1', prospectName: 'Acme', contextDescription: 'SaaS', documentType: 'proposal' },
        'http://gateway', 'token', 'ws1',
    );

    assert.strictEqual(ctx.contextBlock, '');
    assert.strictEqual(ctx.similarArtifactCount, 0);
});

test('injects prior work when KB returns results', async () => {
    const fakeResult = { id: '1', content: 'Past proposal for SaaS company', sourceType: 'sales_approved_artifact', similarity: 0.85 };
    globalThis.fetch = async () => new Response(JSON.stringify({ results: [fakeResult] }), { status: 200 });

    const ctx = await buildSalesRagContext(
        { tenantId: 't1', botId: 'b1', prospectName: 'Acme', contextDescription: 'SaaS', documentType: 'proposal' },
        'http://gateway', 'token', 'ws1',
    );

    assert.ok(ctx.contextBlock.includes('## Sales Context'));
    assert.ok(ctx.contextBlock.includes('Past proposal'));
    assert.strictEqual(ctx.similarArtifactCount, 1);
});
```

### Unit testing lesson pipelines

Use `InMemory*LessonStore` for test isolation:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySalesFeedback, ingestSalesFeedback, InMemorySalesLessonStore } from './sales-agent-lesson-pipeline.js';

test('classifies email feedback correctly', () => {
    assert.strictEqual(classifySalesFeedback('The email felt too generic and copy-paste'), 'email_personalization');
    assert.strictEqual(classifySalesFeedback('Price was too high, budget objection'), 'objection_handling');
    assert.strictEqual(classifySalesFeedback('Proposal missing ROI analysis'), 'proposal_quality');
});

test('ingestSalesFeedback stores a lesson', async () => {
    const store = new InMemorySalesLessonStore();
    const lessons = await ingestSalesFeedback(
        { tenantId: 't1', workspaceId: 'ws1', taskId: 'task1', dealId: 'deal1', documentType: 'any', actionType: 'test', correlationId: 'corr1' },
        [{ body: 'The email felt too generic and not personalised to their industry' }],
        store,
    );
    assert.strictEqual(lessons.length, 1);
    assert.strictEqual(lessons[0]?.category, 'email_personalization');

    const retrieved = await store.findByWorkspace('ws1');
    assert.strictEqual(retrieved.length, 1);
});
```

### Integration testing

The handler-level RAG integration is tested by verifying the `callLlm` wrapper receives the context block. Pass a mock `callLlm` that captures its arguments:

```typescript
let capturedSystemPrompt = '';
const mockCallLlm = async (prompt: string, sys?: string): Promise<string> => {
    capturedSystemPrompt = sys ?? '';
    return 'generated content';
};

// stub fetch to return a known KB result
globalThis.fetch = async () => new Response(JSON.stringify({ results: [{ id: '1', content: 'past proposal', sourceType: 'sales_approved_artifact', similarity: 0.80 }] }), { status: 200 });

await handleSalesAction({
    actionType: 'workspace_proposal_generate',
    tenantId: 't1', botId: 'b1', taskId: 'task1',
    payload: { prospect_name: 'Acme', description: 'SaaS analytics' },
    gatewayBaseUrl: 'http://gateway',
    serviceToken: 'token',
    workspaceId: 'ws1',
    callLlm: mockCallLlm,
});

assert.ok(capturedSystemPrompt.includes('## Sales Context'));
assert.ok(capturedSystemPrompt.includes('past proposal'));
```

---

## Summary of benefits

| Benefit | How RAG delivers it |
|---------|---------------------|
| **Institutional memory** | Every approved artefact is stored and retrieved in future sessions |
| **Compounding improvement** | Lesson flywheel: each rejection makes the next draft better, automatically |
| **Domain consistency** | Brand voice, coding standards, compliance requirements injected from workspace-specific templates |
| **Compliance coverage** | Regulatory requirements retrieved and injected as mandatory content (not suggestions) |
| **Tenant isolation** | All KB queries scoped by `tenantId` at SQL level — no cross-tenant data leakage |
| **Zero training cost** | No model fine-tuning needed — workspace knowledge is in the KB, not the weights |
| **Non-blocking** | All RAG calls wrapped in `try/catch` — gateway failure never blocks agent execution |
| **Backwards-compatible** | Gateway params are optional — existing callers without RAG params continue to work |
| **No per-case changes** | `callLlm` wrapper means RAG enriches all LLM calls in a handler without touching individual action cases |
| **Cost-effective** | `text-embedding-3-small` at 1536 dimensions — high quality, low embedding cost |
