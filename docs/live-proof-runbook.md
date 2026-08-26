# Live-Proof Runbook — Agent Human-Replacement Pass

Everything shipped in the agent-by-agent pass is **unit/seam-tested with mocks/fakes**.
This runbook is how you turn that into **live proof against real services**. It splits
into two tiers: what runs with **no external credentials** (proves the internal
plumbing is live), and what needs **your tokens** (proves the real outward action).

The credential-gated actions cannot be run by the coding agent — API keys, OAuth,
and payment/telephony credentials must be supplied by a human. This runbook tells
you exactly which token each capability needs and the command to prove it.

---

## Tier 0 — Stack up (prerequisite)

```bash
docker compose up -d postgres redis opa migrate
docker compose up -d api-gateway agent-runtime
# health
curl -sf http://localhost:3000/health && echo " gateway OK"
curl -sf http://localhost:4000/health && echo " runtime OK"
```

Required env (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `OPA_BASE_URL`,
`API_SESSION_SECRET` (32+), the HMAC tokens (`RUNTIME_TASK_SHARED_TOKEN`,
`CONNECTOR_EXEC_SHARED_TOKEN`, `APPROVAL_INTAKE_SHARED_TOKEN`, …).

---

## Tier 1 — Internal-path proof (NO external creds)

Proves an agent action flows end to end: intake → runtime → planner → risk →
handler → connector-execute endpoint, using the **connector simulator** (opt-in)
instead of real providers. This is the "the wiring is live" proof.

```bash
# the 93 agent-runtime integration tests need the live stack (postgres/redis/gateway):
pnpm --filter @agentfarm/agent-runtime test    # with the stack up + test env
# or the DB-integration lane:
pnpm test:db
```

Confirms: task execution path, approval intake/decision, capability snapshots,
evidence records, connector dispatch — all against real postgres/redis, no
third-party accounts.

---

## Tier 2 — Real outward action per capability (YOUR tokens)

For each, configure the connector in the workspace (token store), then run the one
action and confirm the real side effect. `<X>` = provide via the dashboard connector
setup or the connector token store — never in the action payload.

| Agent · action | Real proof | Token / service needed |
|---|---|---|
| recruiter `send_outreach` (send=true) | candidate gets the email | Gmail/Outlook connector |
| recruiter `manage_pipeline` (move) / `source_candidates` (atsQuery) / `screen_resume` (candidateId) | Greenhouse candidate moves / records return | Greenhouse API key + `on_behalf_of` |
| recruiter `post_job` / `schedule_interview` | job posted / event booked in the board+calendar UI | browser tier + desktop VM (no API) |
| recruiter `conduct_phone_screen` (join=true) / BA `elicit_requirements` (join=true) | agent joins the call and runs the scored protocol | desktop VM + Voicebox STT/TTS + Zoom/Teams/SIP |
| recruiter `generate_offer` / `compose_rejection` (approved) | offer/rejection email sent (+ ATS reject) | Gmail/Outlook (+ Greenhouse) |
| BA / TW / CW / PM doc publish + deliver | doc in Confluence/Notion/repo; report posted to Slack | Confluence/Notion/GitHub + Slack connector |
| content-writer `publish_cms` | post live on WordPress | WordPress connector |
| sales `outreach_send` / `cold_call` / `linkedin_outreach` / `contract_send` / `crm_sync` | email/call/DM/contract/CRM record created | SendGrid/Twilio/PhantomBuster/e-sign/CRM (SalesAgentConfig) |
| corporate-assistant `email_send` / `message_send` / `calendar_schedule` | email/message/event created | Gmail/Slack/Teams/Calendar |
| customer-support `reply_send` / `reply_followup` / ticket ops / `refund_process` | reply sent, ticket moves, refund issued | Gmail + Zendesk/Jira + payment provider |
| devops `tf_apply` / `helm_install` / `docker_push` / `pipeline_trigger` | real infra change / image pushed / pipeline runs | cloud CLI creds + kubeconfig + registry + CI token |
| any agent `standup_report` (post=true) | standup posts to the channel | Slack connector |

---

## Recommended first live proof (smallest real signal)

1. Tier 0 stack up.
2. Tier 1 integration tests green → internal path proven.
3. One Tier-2 action with the cheapest token to set up — **Slack `standup_report` post**
   (any agent): configure the Slack connector, run standup with `post=true` +
   `channel`, confirm the message lands. Proves connector → real third party live.
4. Then the higher-value one for your use case (e.g., Gmail send, or Greenhouse move).

---

## Known blockers (from the pass)

- **Main CI red > 1 month** (pre-existing) — get a green baseline before trusting a full run.
- **Connector-blocked capabilities** (no native connector exists): marketing ads/ESP,
  live-chat platform, calendar/job-board — these run via the **browser fallback** tier
  (desktop VM) until connectors are built.
- **Presence live-media adapter** (`meeting-interview-adapter.ts`) is verified with
  injected fakes only — needs a real desktop VM + Voicebox to confirm on a live call.
