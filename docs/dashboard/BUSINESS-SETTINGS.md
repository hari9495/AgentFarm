# Business & Settings — Detailed Reference

> **Section:** Business & Settings (sidebar)
> **Auth:** All pages require a valid `agentfarm_internal_session` cookie; redirect to `/login?next=<path>` if missing.

---

## Table of Contents

1. [Billing](#1-billing)
   - [Subscription Status Card](#subscription-status-card)
   - [Usage Summary Card](#usage-summary-card)
   - [Cost Trend Chart](#cost-trend-chart)
   - [Agent Cost Table](#agent-cost-table)
   - [Order and Invoice History](#order-and-invoice-history)
2. [Budget Policy](#2-budget-policy)
3. [LLM Configuration](#3-llm-configuration)
4. [Quality Feedback](#4-quality-feedback)
5. [Notifications](#5-notifications)

---

## 1. Billing

**Route:** `/billing`
**Auth:** Redirects to `/login?next=/billing` if unauthenticated.
**API sources:**
- `GET /api/billing/subscription` — current subscription details.
- `GET /api/billing/usage` — usage metrics for the current period.
- `GET /api/billing/cost-trend` — weekly cost trend data.
- `GET /api/billing/orders` — order and invoice history.

The Billing page is the **complete financial overview** for the tenant. It consolidates subscription status, usage tracking, cost trends, per-agent cost attribution, and invoicing.

---

### Subscription Status Card

Positioned at the top of the page. Displays:

| Field | Description |
|---|---|
| Plan name | The current subscription tier (Free / Starter / Business / Enterprise) |
| Plan status | `active` (green), `trialing` (blue), `past_due` (amber), `cancelled` (red), `grace_period` (amber) |
| Billing cycle | Monthly or annual |
| Renewal date | Next billing date (ISO date formatted as "MMM D, YYYY") |
| Agent slots | `N used / M included` — how many agents are provisioned vs the plan's limit |
| Included LLM credits | Monthly credit allowance included with the plan (e.g., "$50 of LLM API costs per month") |
| Overage rate | Per-unit cost applied when credits are exhausted |

**Grace Period Banner:**
If the subscription is in a grace period (payment failed but service continues for a defined window), an amber banner appears above the card with: "Your payment failed. Service continues until [date]. Please update your payment method."

**Past Due Banner:**
If the subscription is past due and past the grace period, a red hard-stop banner appears: "Access to agent execution is suspended. Please update billing to resume."

**Plan Actions:**
- **Upgrade Plan:** Opens the plan comparison modal.
- **Manage Payment Method:** Links to the Stripe/Razorpay payment portal.
- **Cancel Subscription:** Initiates the cancellation flow with a confirmation dialog and a reasons survey.

---

### Usage Summary Card

A card showing current-period resource consumption vs plan limits:

| Metric | Used | Limit | % Used |
|---|---|---|---|
| LLM API credits (USD) | $34.21 | $50.00 | 68% |
| Task executions | 1,842 | 5,000 | 37% |
| Active agents | 3 | 5 | 60% |
| Storage (GB) | 12.4 | 50 | 25% |
| Seats (operators) | 4 | 10 | 40% |

Each row has a progress bar coloured by usage percentage:
- 0–79%: Blue.
- 80–89%: Amber (approaching limit).
- 90–99%: Orange (near limit).
- 100%+: Red (over limit / overage billing applies).

**Period label:** Shows "Current billing period: [start date] – [end date]".

---

### Cost Trend Chart

A weekly cost breakdown chart for the last 12 billing periods (months) or last 52 weeks, switchable via a toggle:

- **Monthly view:** One bar per month. Bar height = total monthly cost. Colour split by cost type (LLM API / compute / overage).
- **Weekly view:** One bar per week. Useful for spotting cost spikes.

Hovering a bar shows: period, total cost, and the breakdown by cost category.

**Budget line:** If a monthly budget has been set (see Budget Policy), a horizontal dashed red line is drawn at the budget threshold.

---

### Agent Cost Table

A sortable, filterable table showing cost attribution per agent for the current billing period:

| Column | Description |
|---|---|
| Agent | Bot name and role emoji |
| Task Count | Number of tasks executed this period |
| Token Usage | Total tokens consumed (input + output) |
| LLM Cost (USD) | API cost for LLM calls |
| Compute Cost (USD) | VM runtime cost (where applicable) |
| Total Cost (USD) | LLM + compute |
| % of Total | This agent's share of the period total cost |

**Sort:** By any column. Default sort is Total Cost descending.

**Filter:** Free-text search on agent name; workspace filter.

**Export:** Download as CSV for finance/reporting.

---

### Order and Invoice History

A table of all historical billing records:

| Column | Description |
|---|---|
| Invoice ID | Reference number |
| Period | Billing period covered |
| Amount (USD) | Invoice amount |
| Status | `paid` (green), `open` (blue), `overdue` (red), `void` (grey) |
| Payment method | Last 4 digits of card / bank reference |
| Invoice date | Date the invoice was issued |
| Due date | Payment due date |
| Download | PDF download link |

**Download all:** Export all invoices as a ZIP of PDFs.

---

## 2. Budget Policy

**Route:** `/budget`
**Auth:** Auth-guarded.
**Component:** `BudgetPolicyPanel`
**API sources:**
- `GET /api/billing/budget-policy` — fetch current budget policy.
- `POST /api/billing/budget-policy` — save updated policy.

The Budget Policy page lets operators set spending guardrails to prevent unexpected overage charges. The budget policy runs independently of the subscription plan — it is a workspace-level control layer.

### Daily Budget

| Field | Type | Description |
|---|---|---|
| Daily limit (USD) | Number input | Maximum spend allowed per day across all agents |
| Enforcement | Select | `soft` (alert only) or `hard` (stop all LLM calls when limit is hit) |

### Monthly Budget

| Field | Type | Description |
|---|---|---|
| Monthly limit (USD) | Number input | Maximum spend allowed per calendar month across all agents |
| Enforcement | Select | `soft` or `hard` |

### Threshold Alerts

Three notification thresholds — when spend reaches these percentages of the monthly limit, alerts are sent:

| Threshold | Default | Action |
|---|---|---|
| Warning | 80% | Send notification to the configured alert channel |
| Throttle | 90% | Reduce LLM call concurrency by 50% (throttle mode) |
| Hard Stop | 100% | Halt all agent LLM calls until the next period (if `hard` enforcement selected) |

**Alert channel:** Dropdown — select which notification channel to use for budget alerts (must be configured in the Notifications settings).

### Per-Agent Budget Override

Below the global policy, an optional table allows setting per-agent monthly spend caps that override the global limits:

| Column | Description |
|---|---|
| Agent | Bot name |
| Monthly Cap (USD) | Per-agent limit (leave blank to use global policy) |
| Enforcement | `soft` or `hard` |

**Add row:** Click "+ Add Agent Override" to add a new per-agent row.

### Budget History

A chart showing daily/monthly spend vs budget lines for the last 30 days, with threshold lines drawn.

---

## 3. LLM Configuration

**Route:** `/llm-config`
**Auth:** Auth-guarded.
**Component:** `LlmConfigPanel`
**API sources:**
- `GET /api/billing/llm-config` — fetch LLM configuration.
- `POST /api/billing/llm-config` — save LLM configuration.

The LLM Configuration page controls which providers and models are available to agents, and how requests are routed between providers.

### Default Provider and Model

| Field | Type | Description |
|---|---|---|
| Default provider | Select | Which LLM provider to use when no specific provider is configured for a task |
| Default model | Select | Which model to use within the selected provider |
| Fallback provider | Select | Provider to use if the default provider fails or is unavailable |
| Fallback model | Select | Model to use with the fallback provider |

### Provider API Keys

For each configured provider:

| Provider | Field | Description |
|---|---|---|
| OpenAI | API Key | OpenAI API key (sk-...) |
| Anthropic | API Key | Anthropic API key |
| Google Gemini | API Key | Google AI Studio API key |
| Mistral | API Key | Mistral API key |
| Groq | API Key | Groq API key |
| Cohere | API Key | Cohere API key |
| Azure OpenAI | Endpoint + Key | Azure OpenAI resource endpoint and API key |
| Ollama | Base URL | Local Ollama server URL (for self-hosted models) |

Each provider has a **Test Connection** button that validates the API key by making a minimal test call.

### Per-Role Model Routing

Configure which provider/model to use for each agent role (overrides the default):

| Role | Provider | Model |
|---|---|---|
| Developer | (dropdown) | (dropdown) |
| Full Stack Developer | (dropdown) | (dropdown) |
| … | … | … |

This enables cost optimisation: use an expensive frontier model for complex roles (developer, tester) and a cheaper model for simpler roles (corporate assistant, content writer).

### Advanced Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| Default temperature | Slider (0.0–2.0) | 0.7 | Controls response randomness |
| Default max_tokens | Number | 4096 | Maximum tokens per LLM response |
| Timeout (ms) | Number | 30000 | Per-request timeout |
| Retry on timeout | Toggle | true | Automatically retry timed-out requests |
| Max retries | Number | 2 | Maximum number of retry attempts |

---

## 4. Quality Feedback

**Route:** `/quality`
**Auth:** Auth-guarded.
**Component:** `QualitySignalsPanel`
**API sources:**
- `GET /api/quality/signals` — quality signal feed.
- `GET /api/quality/scores` — per-agent quality scores.

The Quality Feedback page surfaces the quality evaluation signals that are generated for each completed task. This feeds the RAG lesson pipeline and provides visibility into output quality trends.

### Quality Signals Feed

A chronological feed of quality evaluation events:

Each event card shows:
- Task ID and agent.
- Quality score (0.0–10.0) with a colour-coded badge:
  - 8.0–10.0: Green ("Excellent").
  - 6.0–7.9: Amber ("Acceptable").
  - 0.0–5.9: Red ("Needs Improvement").
- Evaluator feedback: the LLM evaluator's written assessment of the output.
- Evaluation dimensions: scores broken down by dimension (e.g., correctness, completeness, clarity, adherence to instructions).
- Timestamp.

### Per-Agent Quality Score Summary

A table showing rolling quality statistics per agent:

| Column | Description |
|---|---|
| Agent | Bot name and role |
| Tasks Evaluated | Count of tasks with quality scores in the period |
| Avg Score | Mean quality score (0.0–10.0) |
| Score Trend | Sparkline showing score trend over the last 14 days |
| % High Quality | Percentage of tasks scoring ≥ 8.0 |
| % Low Quality | Percentage of tasks scoring < 6.0 |

**Clicking an agent row** navigates to a filtered view of the quality feed showing only that agent's signals.

### Feedback Submission

Operators can submit manual quality feedback for any task:
- Click **Rate Task** on any task in the feed.
- Enter a manual quality score and free-text feedback.
- This feedback is ingested into the RAG lesson pipeline via `ingest*Feedback()`.

### Lesson Impact
A banner at the top of the page reminds operators: *"Quality feedback directly improves agent output. Low scores automatically generate improvement lessons for the agent's RAG context."*

---

## 5. Notifications

**Route:** `/notifications`
**Auth:** Auth-guarded.
**Component:** `NotificationsPanel`
**API sources:**
- `GET /api/notifications/deliveries` — delivery log.
- `POST /api/notifications/deliveries/:id/retry` — retry a failed delivery.
- `GET /api/notifications/channels` — configured channels.

The Notifications page manages notification delivery and provides visibility into the notification system's health.

### Delivery Log

A filterable table of all notification delivery attempts:

| Column | Description |
|---|---|
| Delivery ID | UUID |
| Template | The notification template used (e.g., `approval.pending`, `budget.warning.80pct`, `task.failed`) |
| Channel | The delivery channel (email, Slack, Teams, webhook) |
| Recipient | The target address/webhook URL (masked for security) |
| Status | `delivered` (green), `pending` (blue), `failed` (red), `skipped` (grey) |
| Attempts | Number of delivery attempts |
| Last Attempted | Timestamp |
| Error | Error message for failed deliveries |

**Filter controls:**
- Status: All / Delivered / Failed / Pending / Skipped.
- Channel: All / Email / Slack / Teams / Webhook.
- Template: Free-text search.
- Date range.

### Channel Filter

A secondary filter bar at the top lets operators view deliveries for a specific notification channel only.

### Retry Failed
Each failed delivery has a **Retry** button. Clicking it re-attempts the delivery immediately. Posts to `POST /api/notifications/deliveries/:id/retry`. If the retry succeeds, the delivery status updates to `delivered`. If it fails again, the attempt count increments and the error message updates.

**Bulk retry:** Select multiple failed deliveries and retry all at once using the "Retry Selected" button.

### Channel Configuration (read-only)
A panel at the bottom shows the currently configured notification channels as a summary — name, type, status. Full channel configuration (adding/editing channels) is done via the Connectors Hub → Outbound Webhooks tab and the workspace settings.

### Delivery Statistics
A small summary section at the top of the page:
- Total deliveries (last 24h).
- Delivery success rate (last 24h).
- Failed deliveries requiring attention.
- Average delivery latency (ms).
