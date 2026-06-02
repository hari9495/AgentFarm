# Analytics — Detailed Reference

> **Section:** Analytics (sidebar)
> **Auth:** All pages require a valid `agentfarm_internal_session` cookie.

---

## Table of Contents

1. [Analytics Overview](#1-analytics-overview)
   - [Date Range Selector](#date-range-selector)
   - [Agent Performance Metrics](#agent-performance-metrics)
   - [Provider Breakdown Table](#provider-breakdown-table)
   - [Weekly Trend Chart](#weekly-trend-chart)
   - [LLM Cost Summary](#llm-cost-summary)
2. [Cost Dashboard](#2-cost-dashboard)
3. [Historical Metrics](#3-historical-metrics)
4. [Quality ROI](#4-quality-roi)

---

## 1. Analytics Overview

**Route:** `/analytics`
**Auth:** Redirects to `/login?next=/analytics` if unauthenticated.
**API source:** `GET /api/analytics` with query params `startDate`, `endDate`, `workspaceId`.

The Analytics Overview is the primary intelligence dashboard for understanding how agents are performing across time, which LLM providers are being used, and what the operational costs are.

---

### Date Range Selector

Located at the top of the page, the date range selector applies globally to every panel on this page.

| Control | Description |
|---|---|
| Preset buttons | Last 7 days / Last 14 days / Last 30 days / Last 90 days (one click) |
| Custom range | From / To date pickers (calendar popup) |
| Apply button | Refreshes all panels with the new range |

Date range is preserved in `localStorage` under `agentfarm:analytics:dateRange` across page reloads and navigation.

---

### Agent Performance Metrics

A row of **KPI tiles** summarising performance across all agents in the selected period:

| Tile | Description | Notes |
|---|---|---|
| Total Tasks | Count of all tasks executed | Includes all outcomes |
| Success Rate | `successCount / totalCount × 100` | Percentage, rounded to 1 decimal |
| Avg Task Latency | Mean wall-clock duration from queue entry to completion | Shown in seconds |
| Avg Quality Score | Mean LLM-evaluated quality score across completed tasks | 0.0–10.0 scale |
| Total Tokens Used | Sum of all LLM tokens consumed (input + output) | Formatted with SI suffix (e.g., 4.2M) |
| Total Cost (USD) | Sum of LLM API costs for the period | Formatted to 2 decimal places |

Each tile shows:
- The current period value.
- A percentage change badge vs the previous equivalent period (green ▲ for improvement, red ▼ for regression, grey — for no change).
- A sparkline (7-day mini trend chart embedded in the tile footer).

**What "quality score" means:** At task completion the runtime makes a separate LLM call using a quality-evaluation prompt. The evaluator reviews the task output against the task description and returns a structured score. The score is stored on the task record and averaged here.

---

### Provider Breakdown Table

A sortable table showing per-provider performance metrics, enabling comparison of LLM providers on cost, speed, and quality.

| Column | Description |
|---|---|
| Provider | Provider name with logo badge (Anthropic, OpenAI, Gemini, Mistral, Groq, Cohere) |
| Invocations | Total number of LLM API calls made to this provider |
| Success Rate | Fraction of calls that returned a valid response |
| Avg Latency (ms) | Mean time from request to first token (TTFT) |
| Total Tokens | Input + output tokens combined |
| Avg Cost per 1K Tokens (USD) | Effective cost rate for this provider in this period |
| Total Cost (USD) | Total spend on this provider in the period |

**Sort:** Click any column header to sort ascending/descending. Default sort is Total Cost descending.

**Export:** A "Download CSV" button exports the table data as a comma-separated file.

---

### Weekly Trend Chart

A **multi-series bar chart** showing week-by-week trends across the selected date range.

**Series (each a different colour):**
- Total tasks executed (blue bars).
- Successful tasks (green bars, stacked or grouped).
- Failed tasks (red bars, stacked or grouped).

**Chart controls:**
- Toggle each series on/off by clicking its legend label.
- Hover a bar to see the exact value in a tooltip.
- Grouped vs stacked mode toggle.

The chart uses the workspace's local timezone for week boundaries.

---

### LLM Cost Summary

A dedicated cost analysis panel below the trend chart.

#### Cost KPI Row

| KPI | Description |
|---|---|
| Total Tokens (period) | Sum of all tokens consumed across all providers |
| Total Cost (period) | Sum of all provider API charges |
| Total Invocations | Count of all LLM API calls |
| Success Rate | Fraction of calls that received a valid response |

#### Per-Provider Cost Breakdown

A pie chart showing the cost distribution across providers, with:
- Percentage label per segment.
- Tooltip on hover showing provider name, cost, and invocation count.
- Legend below the chart.

#### Weekly Cost Trend (Buckets)

A stacked bar chart showing cost per week, coloured by provider:
- Each week is one bar.
- Each provider has its own colour slice within the bar.
- Hovering a slice shows that provider's cost for that week.

#### Inline Audit Log
An `AuditLogPanel` is embedded below the cost panels, scoped to analytics-related events (cost threshold alerts, billing limit warnings). This allows operators to see cost-related governance events in the same view without navigating to the Audit & Compliance section.

---

## 2. Cost Dashboard

**Route:** `/cost-dashboard`
**Auth:** Redirects to `/login?next=/cost-dashboard` if unauthenticated.
**Component:** `CostDashboardPanel`
**API source:** `GET /api/analytics/cost?startDate=&endDate=&workspaceId=`

The Cost Dashboard provides a focused cost-analysis view with breakdowns by skill, by provider, and over time.

### Summary Cards

Four KPI cards at the top:

| Card | Value | Description |
|---|---|---|
| Total Token Usage | Token count (formatted) | Cumulative tokens in the period |
| Total Invocations | Count | Number of LLM API calls |
| Overall Success Rate | Percentage | Successful calls / total calls |
| Estimated Cost (USD) | Dollar amount | Sum of API charges for the period |

Each card includes a 7-day mini sparkline.

### Cost by Skill

A ranked bar chart showing cost contribution per skill (where a "skill" is a named agent capability that makes LLM calls):

- Skill name on the Y-axis.
- Cost on the X-axis.
- Sorted highest to lowest.
- Hovering a bar shows: skill name, total cost, invocation count, avg cost per invocation.

Use this to identify which capabilities are the most expensive, enabling targeted optimisation.

### Cost by Provider

A horizontal bar chart identical in structure to "Cost by Skill" but broken down by LLM provider.

### Weekly Cost Trend

A line chart showing total cost per week across the selected period:
- One line per provider (if the "split by provider" toggle is on).
- Single line for total cost (if split is off).
- Hover tooltip shows exact cost for that week.
- Y-axis: USD cost. X-axis: week ending date.

---

## 3. Historical Metrics

**Route:** `/historical-metrics`
**Auth:** Auth-guarded.
**API source:** `GET /api/analytics/history?weeks=90&workspaceId=`

The Historical Metrics page provides a **90-day retrospective view** using weekly data buckets. Unlike the Analytics Overview (which has a flexible date range), Historical Metrics is fixed at 90 days / 13 weeks to provide a stable long-term perspective.

### Summary Metrics Row

Four KPI tiles computed across the full 90-day window:

| Tile | Description |
|---|---|
| Total Tasks | Total tasks executed in the 90-day period |
| Total Successes | Tasks that completed successfully |
| Total Cost (USD) | Cumulative API cost for the period |
| Avg Weekly Quality Score | Mean of the per-week average quality scores |

### 90-Day Weekly Bar Chart

A **grouped bar chart** with one group per week (13 groups total):

| Series | Colour | Metric |
|---|---|---|
| Task count | Blue | Total tasks executed that week |
| Success count | Green | Tasks that succeeded that week |
| Cost (USD) | Amber | Total API cost that week |

Each group of three bars represents one week. Hover any bar for the exact value.

**X-axis:** Week ending date (ISO format).
**Y-axis (left):** Task count scale.
**Y-axis (right):** Cost scale (the cost series uses a secondary axis to avoid scale conflicts with task counts).

### Date Range Controls

Even though the view defaults to 90 days, the date range can be adjusted with From/To pickers. Changing the date range re-fetches from the API and re-renders the chart with up to the queried number of weeks.

---

## 4. Quality ROI

**Route:** `/quality-roi`
**Auth:** Auth-guarded.
**API source:** `GET /api/analytics/quality-roi?workspaceId=`

The Quality ROI page answers the question: **"Are we getting good output per dollar spent?"** It measures the ratio of high-quality successful tasks to cost per week.

### ROI Score Formula

$$\text{ROI Score} = \frac{\text{Successful Tasks}}{\text{Cost (USD)}}$$

A higher ROI score means more successful work is being delivered per unit of cost. The score is computed per week and displayed in both a trend chart and a table.

### Colour Coding

| Threshold | Colour | Interpretation |
|---|---|---|
| ROI Score ≥ 10 | Green | Excellent — high throughput at low cost |
| ROI Score 3–9 | Amber | Moderate — acceptable but review for optimisation opportunities |
| ROI Score < 3 | Red | Poor — investigate task failure rates and LLM costs |
| Insufficient data | Grey | Fewer than 5 tasks in that week — score not statistically meaningful |

### ROI Trend Chart

A line chart showing the ROI score per week across the selected period:
- Green / amber / red background bands corresponding to the threshold colours.
- Hover tooltip: that week's ROI score, task count, success count, and total cost.
- A horizontal dashed target line at ROI = 10 (configurable in workspace settings).

### Per-Week Table

A table with one row per week showing all the components of the ROI calculation:

| Column | Description |
|---|---|
| Week Ending | ISO date of the last day of the week |
| Total Tasks | Tasks executed that week |
| Successful Tasks | Tasks that completed successfully |
| Total Cost (USD) | API cost for the week |
| ROI Score | Computed score, colour-coded per the thresholds above |
| Trend | ▲ / ▼ vs the previous week |

**Export:** Download as CSV for offline analysis.

### Per-Agent Breakdown (expandable)

Below the weekly table, an expandable section shows the same ROI breakdown segmented by agent:
- Each agent has its own colour-coded ROI score for the selected period.
- Agents below the amber threshold are highlighted to draw attention.
- Clicking an agent's row navigates to the Analytics Overview pre-filtered to that bot.
