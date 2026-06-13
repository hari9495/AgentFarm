# Customer Dashboard — User Guide

> **Created:** 2026-06-13 (full-repo audit) · Covers the customer-facing dashboard at `apps/website/app/dashboard/` (25 pages, 20 sections — verified by page enumeration). This is the **customer** surface; the internal operator dashboard (`apps/dashboard`, port 3001) is documented in [INTERNAL_DASHBOARD_NAVIGATION.md](INTERNAL_DASHBOARD_NAVIGATION.md) and `docs/dashboard/`.
> ⚠ Manual QA on 2026-06-12 found several wiring issues on this surface (root `QA-CUSTOMER-DASHBOARD-FINDINGS.md`); behavior described here reflects intended function per the codebase — re-verify after the QA fixes land.

---

## Getting In

1. **Sign up** at `/signup` (or `/get-started`); portal accounts are separate from internal logins (`TenantPortalAccount`). Email verification and password reset are supported (`/forgot-password`, `TenantPasswordResetToken`).
2. **Log in** at `/login` (portal session cookie).
3. **Onboard** via `/onboarding` — the setup wizard walks role → connectors → persona → approval policy → deploy (`SetupWizardSession`).

## Dashboard Sections (verified page directories)

| Section | What you do there |
|---|---|
| **Agents** / **Bots** | View and manage your deployed AI teammates; deploy new ones |
| **Tasks** | Submit work to an agent and track task history/status |
| **Approvals** | Review and approve/reject actions your agents proposed (medium/high-risk actions wait here) |
| **Activity** | Event feed of what your agents have done |
| **Deployments** | Agent provisioning status (VM lifecycle) |
| **Integrations** / **Adapters** / **MCP** | Connect your tools (Jira, GitHub, Slack, email, telephony…); manage adapter registrations and MCP servers |
| **Webhooks** | Inbound/outbound webhook configuration |
| **Evidence** / **Audit** | Inspect the evidence trail and audit log for agent actions |
| **Governance** | Policies, kill-switch and guardrails for your tenant |
| **Billing** | Plan, invoices, orders, usage ($0.10/task metering + subscriptions) |
| **Reports** | Scheduled/usage reports |
| **Notifications** | Alert channels and notification history |
| **Team** / **Roles** | Invite teammates, assign roles |
| **Security** | Session/auth settings (SSO/MFA per tenant config) |
| **Settings** | Tenant and workspace configuration |
| **Support** | Raise issues with AgentFarm's own support agent (chat/voice) |

## Typical First Session

1. Complete onboarding → first agent deploys (watch **Deployments**).
2. Connect at least one tool in **Integrations** (OAuth or API key).
3. Submit a task in **Tasks** (or let triggers/email/Slack create them).
4. Watch **Approvals** — your agent will pause there for anything risky.
5. Check **Evidence/Audit** to see exactly what was done, then **Billing** for usage.

## Known Issues (as of 2026-06-12 QA — see root QA findings doc for current status)

- Billing page may show "No active plan" despite an active subscription.
- Team "Add Member" created members who couldn't log in (no invite flow yet).
- Provisioning can stall if the platform's worker-runner isn't running (operator-side issue).
- Some CTAs ("Add AI Teammate", "Manage Plan") navigate to public marketing pages instead of in-dashboard flows.
