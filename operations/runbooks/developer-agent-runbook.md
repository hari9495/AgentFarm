# Developer Agent — Operator Runbook

**Runbook type:** Operational reference  
**Scope:** Provisioning, monitoring, incident response, and compliance for the Developer agent role  
**Audience:** AgentFarm platform engineers and customer success operators  
**Last updated:** Sprint 8

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Provisioning a Developer Agent](#3-provisioning-a-developer-agent)
4. [Monitoring and Alerts](#4-monitoring-and-alerts)
5. [Common Issues and Remediation](#5-common-issues-and-remediation)
6. [GDPR Compliance Checklist](#6-gdpr-compliance-checklist)
7. [Billing Verification](#7-billing-verification)
8. [Pilot Customer Onboarding Steps](#8-pilot-customer-onboarding-steps)
9. [Deprovisioning](#9-deprovisioning)
10. [Escalation Paths](#10-escalation-paths)

---

## 1. Overview

The Developer agent automates software engineering tasks:
- Code changes triggered by Jira (or MCP-compatible task sources)
- Pull request drafts submitted for human approval
- CI/CD failure triage and root-cause analysis
- Dependency and test maintenance

The agent runs in an isolated Docker VM. Every code change requires human approval before the PR is published. Episodic memory (pgvector) enables context accumulation across sessions.

**Role identifier:** `developer`  
**Default approval policy:** `require_human` for PR merges; `auto` for documentation edits  

---

## 2. Prerequisites

| Requirement | Details |
|---|---|
| Provisioned workspace | Workspace created via setup wizard or `POST /v1/workspaces` |
| Database | PostgreSQL with `pgvector` extension enabled |
| Redis | Required for task queue (`REDIS_URL`) |
| GitHub / GitLab OAuth | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` in Key Vault |
| OpenAI or Azure OpenAI | `OPENAI_API_KEY` or `AZURE_OPENAI_KEY` in Key Vault |
| GDPR opt-out URL | `AGENT_OPT_OUT_BASE_URL` env var pointing to preference centre |
| Key Vault | All secrets must be stored in Azure Key Vault — never in env files |

---

## 3. Provisioning a Developer Agent

### 3.1 Via Setup Wizard (recommended for pilot customers)

1. Customer navigates to `/marketplace/developer`.
2. Clicks **Hire Developer Agent**.
3. Setup wizard collects:
   - Repository access (GitHub/GitLab OAuth)
   - Jira/Linear project key (task source)
   - Agent persona: display name, email, timezone
   - Approval rules: who approves PRs
4. On wizard completion, `POST /v1/bots` is called automatically with `role: 'developer'`.
5. Confirm bot appears in `/agents` list with status `active`.

### 3.2 Via API (operator / CI provisioning)

```bash
curl -X POST https://api.agentfarm.dev/v1/bots \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "<TENANT_ID>",
    "name": "Dev Agent Alpha",
    "role": "developer",
    "workspaceId": "<WORKSPACE_ID>"
  }'
```

Store the returned `id` — this is the `botId` used in all subsequent API calls.

### 3.3 Persona configuration

After bot creation, set the persona:

```bash
curl -X POST https://api.agentfarm.dev/v1/personas/<BOT_ID> \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Alex",
    "emailAddress": "alex@<customer-domain>",
    "communicationStyle": "concise",
    "disclosureStatement": "This message was sent by an AI agent named Alex, operating on behalf of <Company>.",
    "timezone": "UTC",
    "workingHours": { "start": "08:00", "end": "18:00" }
  }'
```

> **Security:** `emailAddress` is stored encrypted at rest. Rotation requires re-patching the persona record and restarting the runtime pod.

---

## 4. Monitoring and Alerts

### 4.1 Key metrics to watch

| Metric | Healthy | Warning | Alert |
|---|---|---|---|
| Task queue depth | < 10 | 10–50 | > 50 |
| Task completion rate | > 95% | 85–95% | < 85% |
| Approval response time (p95) | < 24 h | 24–48 h | > 48 h |
| PR publish rate | > 80% | 60–80% | < 60% |
| LLM error rate | < 1% | 1–5% | > 5% |

### 4.2 Dashboards

- **CI / CD Triage:** `/ci` — shows current build failures and hypothesis cards
- **PR Drafts:** `/pr-drafts` — lists drafts awaiting approval or recently published
- **Agent Memory:** `/memory` — episodic memory timeline
- **Runtime Observability:** Approvals tab in main dashboard

### 4.3 Log locations

| Component | Log stream |
|---|---|
| Agent Runtime | `apps/agent-runtime` container stdout |
| API Gateway | `apps/api-gateway` container stdout |
| Task Queue | Redis `BLPOP agent-task-queue` |
| Audit events | `BrowserActionEvent` table in PostgreSQL |

### 4.4 Alert configuration

Configure alerts in Azure Monitor (or your observability stack) for:
- `task_error_rate > 0.05` for 5 minutes
- `approval_queue_depth > 20` for 10 minutes
- `llm_latency_p95 > 30s` for 5 minutes

---

## 5. Common Issues and Remediation

### 5.1 Agent stuck on task (no activity for > 15 min)

**Symptoms:** Task shows `in_progress` but no log activity.

**Steps:**
1. Check `agent-runtime` logs for LLM API errors (rate limits, timeout).
2. If LLM timeout: restart task via `PATCH /v1/tasks/<TASK_ID>` with `{ "status": "queued" }`.
3. If queue stuck: inspect Redis queue depth (`LLEN agent-task-queue`). If depth > 100, the worker may be blocked — restart the agent-runtime pod.

### 5.2 PR draft not appearing

**Symptoms:** Task completed but no PR draft in `/pr-drafts`.

**Steps:**
1. Confirm task type was `code_change` (only this type generates PRs).
2. Check `pr_draft` table in PostgreSQL for the `botId`.
3. If draft exists in DB but not UI: clear dashboard cache and reload.
4. If no draft in DB: review `agent-runtime` logs for GitHub API errors (check token expiry in Key Vault).

### 5.3 Approval not routing to correct reviewer

**Symptoms:** Approval email sent to wrong address, or not sent.

**Steps:**
1. Check persona approval rules: `GET /v1/personas/<BOT_ID>`.
2. Verify `approvalEmail` field is set correctly.
3. Confirm notification provider is configured (`SLACK_BOT_TOKEN` or SMTP settings).
4. Test notification manually: `POST /v1/notifications/test`.

### 5.4 CI triage panel shows no reports

**Symptoms:** `/ci` page is empty despite pipeline failures.

**Steps:**
1. Confirm CI webhook is configured in GitHub/GitLab to forward to `POST /v1/ci-reports`.
2. Check webhook secret matches `CI_WEBHOOK_SECRET` env var.
3. Verify `ci_report` table has recent entries.

### 5.5 Memory not accumulating

**Symptoms:** Agent repeats context it should already know.

**Steps:**
1. Confirm `pgvector` extension is installed: `SELECT * FROM pg_extension WHERE extname = 'vector';`
2. Check `episodic_memory` table for recent entries.
3. If empty: verify `ENABLE_EPISODIC_MEMORY=true` env var on agent-runtime.
4. Re-index: `POST /v1/memory/reindex` (operator endpoint).

---

## 6. GDPR Compliance Checklist

Run through this checklist before activating any Developer agent for an EU customer.

- [ ] **AI disclosure in emails** — All outgoing emails include the GDPR footer via `appendGdprFooter()` in `gdpr-email-footer.ts`. Verify by sending a test email and confirming the footer is present.
- [ ] **Opt-out URL is live** — `AGENT_OPT_OUT_BASE_URL` resolves to a working preference-centre page that accepts opt-out requests.
- [ ] **Persona disclosure statement** — `disclosureStatement` field on the persona is set and non-empty. This is appended to LLM system prompt for all external-facing messages.
- [ ] **No PII in logs** — Search logs for email addresses or names: `grep -E "[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}" agent-runtime.log`. Should return zero matches.
- [ ] **OAuth tokens in Key Vault** — GitHub, Jira, and email API keys must NOT be in environment files. Verify in Azure Key Vault.
- [ ] **Persona data encrypted at rest** — Confirm PostgreSQL column-level encryption is active for `AgentPersona.emailAddress` (or full-disk encryption is in place at infrastructure level).
- [ ] **Data residency** — Confirm the PostgreSQL instance is in the customer's required region (EU customers → `westeurope` or `northeurope`).
- [ ] **Retention policy** — Episodic memory records older than 90 days are purged by the scheduled job (`MEMORY_RETENTION_DAYS=90`).
- [ ] **Right to erasure** — `DELETE /v1/personas/<BOT_ID>` cascades to all memory, activity, and audit records. Confirm cascade is working in staging before going live.

---

## 7. Billing Verification

### 7.1 Confirming a task is metered

Each completed task emits a `TASK_COMPLETED` billing event. Verify via:

```bash
curl https://api.agentfarm.dev/v1/billing/usage?tenantId=<TENANT_ID>&botId=<BOT_ID> \
  -H "Authorization: Bearer $OPERATOR_TOKEN"
```

Expected response includes `{ "totalTasks": N, "totalTokens": N, "currentPeriodCost": "$X.XX" }`.

### 7.2 Fixing missing usage records

1. Check `billing_event` table: `SELECT * FROM billing_event WHERE bot_id = '<BOT_ID>' ORDER BY created_at DESC LIMIT 20;`
2. If events exist but API shows zero: restart the billing aggregator service.
3. If events are missing: the task completed before the billing hook was wired — manually insert a corrective event via `POST /v1/billing/events` (requires operator scope).

### 7.3 Usage caps

Set a monthly token cap to prevent runaway usage:

```bash
curl -X PATCH https://api.agentfarm.dev/v1/bots/<BOT_ID>/config \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -d '{ "monthlyTokenCap": 500000 }'
```

The agent will auto-pause when the cap is reached and notify the human reviewer.

---

## 8. Pilot Customer Onboarding Steps

Follow these steps when activating the Developer agent for a new pilot customer.

### Day 0 — Pre-activation

- [ ] Confirm NDA / pilot agreement is signed.
- [ ] Gather: GitHub org name, Jira project key, preferred approval contact email.
- [ ] Provision tenant via `POST /v1/tenants`.
- [ ] Set up workspace and confirm database connectivity.
- [ ] Configure Key Vault with GitHub token, Jira API key, email API key.
- [ ] Set `AGENT_OPT_OUT_BASE_URL` for this tenant's opt-out page.

### Day 1 — Agent provisioning

- [ ] Run setup wizard together with customer (screen share).
- [ ] Configure persona: name, email alias, timezone, working hours.
- [ ] Set approval rules (who gets notified for PR approvals).
- [ ] Send test email — confirm GDPR footer is visible.
- [ ] Create first task manually (`POST /v1/tasks`) to verify end-to-end flow.

### Day 2–7 — Supervised operation

- [ ] Review `/pr-drafts` daily — confirm quality of generated PRs.
- [ ] Check `/ci` for any triage activity.
- [ ] Verify billing is accumulating correctly.
- [ ] Weekly sync call with customer to collect feedback.

### Week 2 — Handoff to self-service

- [ ] Customer can manage agent via dashboard independently.
- [ ] Escalation path communicated: [Escalation Paths](#10-escalation-paths).
- [ ] Confirm customer has access to `/billing` and understands usage caps.

---

## 9. Deprovisioning

To fully remove a Developer agent:

```bash
# 1. Pause all active tasks
curl -X POST https://api.agentfarm.dev/v1/bots/<BOT_ID>/pause \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# 2. Delete persona and cascade all memory/activity records
curl -X DELETE https://api.agentfarm.dev/v1/personas/<BOT_ID> \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# 3. Delete the bot
curl -X DELETE https://api.agentfarm.dev/v1/bots/<BOT_ID> \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# 4. Revoke GitHub OAuth token via GitHub API
# 5. Remove Key Vault secrets for this bot
```

> Data retention after deletion follows the customer's retention policy. Final export via `GET /v1/export/<TENANT_ID>` is available for 30 days post-deletion.

---

## 10. Escalation Paths

| Severity | Trigger | Contact |
|---|---|---|
| P0 — Production down | Agent runtime not processing any tasks | On-call engineer (PagerDuty) |
| P1 — Degraded | Error rate > 5% for > 15 min | Engineering team Slack `#incidents` |
| P2 — Feature broken | PR drafts, CI triage, or memory panel not loading | `#engineering` Slack |
| P3 — Customer query | Billing question, usage question, general config | Customer success team |
| GDPR request | Data subject access or erasure request | DPO via `privacy@agentfarm.dev` |
