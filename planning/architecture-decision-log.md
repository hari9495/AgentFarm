# AgentFarm Architecture Decision Log

## Purpose
Track architecture decisions with owner, status, and review dates before development begins.

## Status Legend
1. Planned
2. Under review
3. Approved
4. Rejected
5. Superseded

## Decision Records
## ADR-001: MVP Scope and Role Boundaries
1. Decision
- MVP supports Developer Agent only.
- QA and Manager roles move to scale phase.
2. Owner
- Product Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Prevents scope creep and protects release quality.

## ADR-002: Risk Taxonomy and Approval Thresholds
1. Decision
- Low risk actions auto-execute.
- Medium and high risk actions require human approval.
2. Owner
- Security and Safety Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Creates safe autonomy and clear operational controls.

## ADR-003: Connector Contract Model
1. Decision
- Define stable contract for Jira, Microsoft Teams, GitHub, and company email connectors.
2. Owner
- Engineering Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Reduces integration drift and onboarding delays.

## ADR-004: Audit Schema and Evidence Freshness Policy
1. Decision
- Use unified action and approval records.
- Evidence freshness target for active gates: 90 days.
2. Owner
- Product Lead and Security and Safety Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Supports trustworthy gate scoring and auditability.

## ADR-005: Kill Switch and Rollback Strategy
1. Decision
- Global kill switch must halt risky execution immediately.
- Resume requires authorized approval and incident notes.
2. Owner
- Security and Safety Lead
3. Status
- Approved
4. Decision Date
- 2026-04-17
5. Review Date
- 2026-05-03
6. Impact
- Improves incident containment and enterprise confidence.

## ADR-006: Database Portability Strategy (Prisma + Supabase Now)
1. Decision
- Use Prisma as the single data access and migration layer across services.
- Use Supabase hosted PostgreSQL for the near-term environment.
- Keep core backend paths provider-agnostic so migration to another PostgreSQL host remains low-friction.
- Avoid introducing Supabase-only backend coupling for core control-plane workflows unless explicitly approved.
2. Owner
- Platform Lead
3. Status
- Approved
4. Decision Date
- 2026-04-25
5. Review Date
- 2026-05-10
6. Impact
- Enables fast delivery with managed PostgreSQL now while preserving a clean migration path later.

## ADR-007: Multi-Provider LLM Routing with Health-Score Fallback
1. Decision
- The runtime LLM decision adapter supports nine named providers: openai, azure_openai, github_models, anthropic, google, xai (Grok), mistral, together, and agentfarm (heuristic-only).
- A tenth mode, `auto`, accepts a per-profile priority list and tries providers in order, falling back to the next on any error.
- Provider health scoring uses a 5-minute rolling window (max 20 entries per provider). Score = errorRate × 0.7 + (min(avgLatency, 10 000) / 10 000) × 0.3. Providers with lower scores are tried first; providers with no data score 0 and keep their configured order.
- The API Gateway LLM config route stores and redacts keys for all nine providers. The dashboard LLM Config panel exposes per-provider fields plus three one-click presets: Ultra Low Cost, Balanced, and Premium Quality.
2. Owner
- Engineering Lead / AI Lead
3. Status
- Approved
4. Decision Date
- 2026-04-29
5. Review Date
- 2026-05-26
6. Impact
- Eliminates single-provider lock-in at runtime; health scoring improves reliability under partial provider outages; dashboard presets reduce operator configuration burden.

## Change Rules
1. Any architecture change that affects release gates creates a new ADR entry.
2. Superseded ADRs must link to replacement ADR.
3. ADR status must be reviewed weekly in architecture governance meeting.
