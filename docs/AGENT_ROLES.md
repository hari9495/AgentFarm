# Agent Roles

> AgentFarm — 12 agent role profiles with connectors, capabilities, and risk posture.
> Last updated: 2026-05-10

---

## Overview

Each agent in AgentFarm operates under a **role**. The role determines:
- The system prompt injected into the LLM context
- Which connector action types are permitted (role policy)
- Which tier of local workspace actions may be executed
- The risk profile for approval routing

Roles are defined in:
- `apps/agent-runtime/src/role-system-prompts.ts` — LLM system prompts
- `packages/connector-contracts/src/role-policies.ts` — connector action permission policies
- `apps/agent-runtime/src/execution-engine.ts` — risk classification thresholds

---

## Role Registry

### 1. `developer`

**Purpose:** Backend/general software development.

**Capabilities:**
- Read and write code files in the workspace
- Run shell commands, tests, and build scripts
- Interact with version control (git)
- Create and update tickets in task trackers
- Create pull request drafts
- Triage CI failures
- Query and update work memory

**Connector actions permitted:**
`create_issue`, `update_issue`, `close_issue`, `comment_on_issue`, `create_pr`, `review_pr`, `merge_pr`, `create_branch`, `push_commit`, `run_pipeline`, `send_message`, `send_email`, `search_knowledge_base`

**Workspace tier access:** Tiers 1–10 (code, shell, git, test, IDE intelligence, REPL, language adapters, governance, release, productivity). Tier 11/12 (desktop/meeting/sub-agent) blocked by default.

**Risk posture:** Code changes to non-test files = `MEDIUM`. Changes to CI config, build scripts, Dockerfile = `HIGH`.

---

### 2. `fullstack_developer`

**Purpose:** End-to-end feature implementation across frontend and backend.

**Capabilities:** Everything in `developer` plus:
- Modify frontend code (HTML, CSS, React/Next.js)
- Manage API contracts between layers
- Update database schemas (with review gate)
- Cross-stack dependency management

**Connector actions permitted:** Same as `developer` plus: `create_repository`, `delete_branch`.

**Risk posture:** Same as `developer`. Schema migration changes escalate to `HIGH`.

---

### 3. `tester`

**Purpose:** Test writing, test coverage analysis, and quality assurance.

**Capabilities:**
- Write unit, integration, and E2E tests
- Analyze coverage reports and identify gaps
- Run test suites and interpret failures
- Create bug reports from test failures
- Suggest test improvements

**Connector actions permitted:**
`create_issue`, `comment_on_issue`, `close_issue`, `send_message`

**Workspace tier access:** Tiers 1–6 (file ops, shell exec up to test runner, read-only IDE intelligence). No write-to-main-code permissions. No deployment access.

**Risk posture:** Test-only file changes = `LOW`. Any modification outside `/tests/` or `*.test.*` = `MEDIUM`.

---

### 4. `business_analyst`

**Purpose:** Requirements gathering, specification writing, and acceptance criteria.

**Capabilities:**
- Create and update user stories and epics
- Write specification documents
- Analyse and summarise meeting notes
- Map requirements to technical tasks
- Update project tracking systems

**Connector actions permitted:**
`create_issue`, `update_issue`, `comment_on_issue`, `create_doc`, `update_doc`, `send_message`, `send_email`, `schedule_meeting`

**Workspace tier access:** Tier 1 (file read/write for docs). No code execution, no shell access.

**Risk posture:** All actions `LOW` by default. Bulk epic creation = `MEDIUM`.

---

### 5. `technical_writer`

**Purpose:** Documentation, API references, runbooks, and developer guides.

**Capabilities:**
- Write and update documentation files (Markdown, RST, MDX)
- Generate API reference docs from code
- Maintain runbooks and operations guides
- Publish updates to docs platforms

**Connector actions permitted:**
`create_doc`, `update_doc`, `send_message`, `send_email`

**Workspace tier access:** Tier 1 (file read/write for `/docs/`, `*.md`, `*.mdx`). No code execution.

**Risk posture:** All actions `LOW`.

---

### 6. `content_writer`

**Purpose:** Marketing content, blog posts, social media, and copy.

**Capabilities:**
- Write and edit marketing copy, blog posts, product announcements
- Schedule social media posts
- Update CMS content
- Draft email campaigns

**Connector actions permitted:**
`create_doc`, `update_doc`, `send_message`, `send_email`, `schedule_post`

**Workspace tier access:** Tier 1 (file read/write for content directories).

**Risk posture:** All actions `LOW`.

---

### 7. `sales_rep`

**Purpose:** Lead qualification, CRM updates, and outbound outreach.

**Capabilities:**
- Qualify leads based on defined criteria
- Create and update CRM records
- Draft and send outreach emails
- Schedule discovery calls
- Generate and update proposals

**Connector actions permitted:**
`create_record`, `update_record`, `send_email`, `schedule_meeting`, `send_message`, `search_knowledge_base`

**Workspace tier access:** None (no local workspace execution needed).

**Risk posture:** Sending emails to external parties = `MEDIUM`. Bulk outreach = `HIGH`.

---

### 8. `marketing_specialist`

**Purpose:** Campaign planning, analytics, and performance reporting.

**Capabilities:**
- Plan and document marketing campaigns
- Analyse performance metrics and create reports
- Update marketing project tracking
- Draft campaign content
- Monitor brand mentions

**Connector actions permitted:**
`create_doc`, `update_doc`, `create_issue`, `update_issue`, `send_message`, `send_email`, `search_knowledge_base`

**Risk posture:** All actions `LOW`. Campaign emails to large lists = `HIGH`.

---

### 9. `corporate_assistant`

**Purpose:** Internal operations, scheduling, and administrative support.

**Capabilities:**
- Schedule meetings and manage calendars
- Draft and send internal communications
- Create and route internal tickets
- Summarise meeting notes
- Coordinate action items across teams

**Connector actions permitted:**
`schedule_meeting`, `send_email`, `send_message`, `create_issue`, `comment_on_issue`, `create_doc`

**Risk posture:** All actions `LOW`. Sending on behalf of senior stakeholders = `MEDIUM`.

---

### 10. `recruiter`

**Purpose:** Candidate sourcing, qualification, and outreach.

**Capabilities:**
- Screen and qualify candidates against job descriptions
- Draft and send outreach messages
- Update applicant tracking systems
- Schedule interviews
- Generate qualification summaries

**Connector actions permitted:**
`send_email`, `send_message`, `create_record`, `update_record`, `schedule_meeting`, `search_knowledge_base`

**Risk posture:** Bulk candidate outreach = `HIGH`. Individual outreach = `MEDIUM`.

---

### 11. `devops`

**Purpose:** Infrastructure management, CI/CD, and deployment operations.

**Capabilities:**
- Manage infrastructure-as-code files
- Trigger and monitor CI/CD pipelines
- Create and update runbooks
- Monitor deployments and alerts
- Coordinate release processes

**Connector actions permitted:**
`run_pipeline`, `create_issue`, `update_issue`, `send_message`, `push_commit`, `create_branch`, `merge_pr`

**Workspace tier access:** Tiers 1–10. Tier 9 (release actions) = `HIGH` risk requiring approval.

**Risk posture:** Any production deployment trigger = `HIGH`. Infrastructure file changes = `HIGH`. CI/CD config changes = `MEDIUM`.

---

### 12. `data_analyst`

**Purpose:** Data querying, reporting, dashboard creation, and insight generation.

**Capabilities:**
- Query databases and data warehouses
- Create and update reports and dashboards
- Generate data visualisations
- Write analytical scripts (SQL, Python, R)
- Summarise and present findings

**Connector actions permitted:**
`query_data`, `create_doc`, `update_doc`, `send_message`, `send_email`, `search_knowledge_base`

**Workspace tier access:** Tiers 1, 5 (REPL for Python/R analysis). No deployment access.

**Risk posture:** Read-only queries = `LOW`. Write queries against production data = `HIGH`.

---

## Risk Classification

### HIGH_RISK_ACTIONS (require approval before execution)

The following action patterns are classified as `HIGH` risk:

| Pattern | Reason |
|---|---|
| Production deployment triggers | Irreversible, wide blast radius |
| Schema migrations on production databases | Data loss risk |
| Delete file / delete repository | Irreversible data deletion |
| Push to main / merge to main | Production code change |
| Send bulk email (> 10 recipients) | External brand / legal risk |
| Execute shell commands modifying system paths | Host system risk |
| Activate kill-switch | Blocks all agent actions |
| Modify CI/CD pipeline config | Supply chain risk |
| Modify infrastructure-as-code (Terraform/Bicep/ARM) | Cloud resource risk |
| Create/modify IAM roles or permissions | Privilege escalation risk |
| Modify `.env` or secret config files | Credential exposure risk |
| Access connector tokens directly | Credential exposure risk |
| Modify security policies (OPA rules) | Governance bypass risk |
| Install new npm/pip packages in production | Supply chain risk |
| Run arbitrary code via `eval()` | Code injection risk |
| Access or export user PII | Privacy/compliance risk |
| Modify audit log retention policies | Compliance risk |

### MEDIUM_RISK_ACTIONS (approval queue, execute after human review)

Examples: modifying test config, creating PRs against protected branches, sending email to single external parties, updating CRM records.

### LOW_RISK_ACTIONS (execute immediately)

Examples: reading files, creating issues, posting Slack messages in designated channels, writing documentation, running tests.

---

## LLM Provider Selection

Each role can be configured with an LLM provider and model profile per workspace. Defaults:

| Profile | Providers Tried (in order) |
|---|---|
| `quality_first` | Anthropic Claude Opus, OpenAI GPT-4o, Google Gemini Pro |
| `speed_first` | Google Gemini Flash, OpenAI GPT-4o-mini, Mistral |
| `cost_balanced` | Together AI, Mistral, GitHub Models |
| `auto` | Health-score failover across all configured providers |

The `auto` profile computes a 5-minute rolling health score (error rate + P95 latency) and selects the highest-scoring available provider at task time. Each failover is recorded in `ProviderFailoverTraceRecord[]` on the task record for debugging.

---

## Skills Crystallization

When an agent completes a task successfully, the **Hermes Skill pattern** can crystallize the run into a reusable skill template:

1. **draft** — skill extracted from run, not yet validated
2. **active** — reviewed and promoted to active usage
3. **deprecated** — superseded by a better skill

`SkillsRegistry.findMatching(taskDescription)` is called at pre-task scout time. If a matching active skill is found, it injects the template into the LLM context to accelerate execution.

---

## Memory System

Each agent maintains three memory tiers:

| Tier | Storage | TTL | Purpose |
|---|---|---|---|
| `short_term` | DB (`AgentShortTermMemory`) | Per-session / TTL-bound | Working context for current task |
| `long_term` | DB (`AgentLongTermMemory`) | Persistent / relevance-ranked | Learned patterns and preferences |
| `repo_knowledge` | DB (`AgentRepoKnowledge`) | Persistent | Indexed codebase knowledge graph |

Memory is read at pre-task scout and written/updated at post-task closeout.

---

## Connector Policy by Role

`packages/connector-contracts/src/role-policies.ts` defines which normalized action types each role may execute against each connector category.

### Normalized Action Types (18)

| Action Type | Category |
|---|---|
| `create_issue` | Task Tracker |
| `update_issue` | Task Tracker |
| `close_issue` | Task Tracker |
| `comment_on_issue` | Task Tracker |
| `assign_issue` | Task Tracker |
| `create_pr` | Code |
| `review_pr` | Code |
| `merge_pr` | Code |
| `create_branch` | Code |
| `push_commit` | Code |
| `run_pipeline` | Code |
| `create_repository` | Code |
| `delete_branch` | Code |
| `send_message` | Messaging |
| `schedule_meeting` | Messaging |
| `send_email` | Email |
| `create_doc` | Document |
| `search_knowledge_base` | Search |

### Connector Registry (18 connectors)

| Category | Connectors |
|---|---|
| Task Tracker | Jira, Linear, Asana, Monday, Trello, ClickUp, Generic REST |
| Messaging | Microsoft Teams, Slack, Generic REST |
| Code | GitHub, GitLab, Azure DevOps, Generic REST |
| Email | Outlook (Graph API), Gmail, Generic REST, Generic SMTP |
