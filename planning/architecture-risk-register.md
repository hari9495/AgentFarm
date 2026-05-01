# AgentFarm Architecture Risk Register

## Purpose
Track architecture risks before development and keep mitigations owner-driven.

## Severity Scale
1. High
2. Medium
3. Low

## Status Legend
1. Open
2. Mitigated (Planning)
3. Closed

## Risk Entries
## R-001: Connector Scope Drift
1. Risk
- Jira, Microsoft Teams, GitHub, and email requirements expand during planning.
2. Severity
- High
3. Owner
- Product Lead
4. Mitigation
- Freeze connector scope through ADR-003 and enforce change control approvals.
5. Mitigation Evidence
- ADR-003 approved in architecture decision log.
- MVP refinement charter and out-of-scope rejection rules are active.
6. Due Date
- 2026-04-24
7. Status
- Closed
8. Closure Basis
- Scope freeze, ADR-003 approval, and MVP rejection rules are documented and approved.

## R-002: Approval Workflow Latency
1. Risk
- Human approvals slow execution and reduce user trust.
2. Severity
- High
3. Owner
- Security and Safety Lead
4. Mitigation
- Define approval routing SLA and escalation fallback.
5. Mitigation Evidence
- Approval latency target set to under 2 minutes in product architecture.
- Approval schema and routing tasks assigned in MVP execution task list.
6. Due Date
- 2026-04-24
7. Status
- Closed
8. Closure Basis
- Approval latency target, escalation path, and assigned execution tasks are documented and approved.

## R-003: Incomplete Audit Evidence
1. Risk
- Missing fields or inconsistent logs can invalidate score-5 gates.
2. Severity
- High
3. Owner
- Engineering Lead
4. Mitigation
- Finalize action and approval schema and run completeness checks in architecture review.
5. Mitigation Evidence
- Action, approval, and evidence field requirements are finalized in architecture baseline.
- Audit retention and freshness policy documented and approved.
6. Due Date
- 2026-04-24
7. Status
- Closed
8. Closure Basis
- Audit schema requirements, retention policy, and evidence freshness policy are finalized in approved architecture docs.

## R-004: Identity Policy Ambiguity
1. Risk
- Agent disclosure and profile rules are interpreted differently by teams.
2. Severity
- Medium
3. Owner
- Security and Safety Lead
4. Mitigation
- Publish identity policy pack and examples for all MVP channels.
5. Mitigation Evidence
- Disclosure and identity controls are defined in product architecture.
- Final channel-level examples move to implementation policy pack tasking.
6. Due Date
- 2026-04-24
7. Status
- Closed
8. Closure Basis
- Identity disclosure and control requirements are documented in approved MVP architecture baseline.

## R-005: Weak Ownership on Architecture Changes
1. Risk
- Decision updates happen without clear owner accountability.
2. Severity
- Medium
3. Owner
- Architecture Owner
4. Mitigation
- Enforce same-day updates for architecture files and ADR log.
5. Mitigation Evidence
- Same-day documentation update rule is active in master plan and operating model.
- Architecture, ADR, and release pack were synchronized in signoff cycle.
6. Due Date
- 2026-04-20
7. Status
- Closed
8. Closure Basis
- Same-day update rules, canonical docs, and signoff synchronization are complete.

## Review Rules
1. Review all open risks in Sunday planning sync.
2. Escalate any high-severity overdue risk in Monday kickoff.
3. Close risk only after mitigation evidence is documented.

## Review Outcome (Pre-Development)
1. Date
- 2026-04-19
2. Decision
- All architecture risks are closed for pre-development architecture governance.
3. Remaining condition
- Implementation and pilot phases may open new delivery risks, but no unresolved architecture-planning risks remain.

## Final Closure Record
1. Closure date
- 2026-04-19
2. Closure authority
- Product Lead, Engineering Lead, Security and Safety Lead, Architecture Owner
3. Closure scope
- Pre-development architecture and governance risks only

## R-006: LLM Provider Availability and Cost Exposure
1. Risk
- Runtime relies on external LLM providers (OpenAI, Anthropic, Google, xAI, Mistral, Together, GitHub Models). A provider outage, API key revocation, or unexpected cost spike can degrade agent decision quality or block task processing.
2. Severity
- Medium
3. Owner
- Engineering Lead / AI Lead
4. Mitigation
- Implemented multi-provider Auto fallback chain (ADR-007): runtime tries providers in priority order per model profile and continues to the next on any error.
- Provider health scoring (5-minute rolling window, composite error-rate + latency score) dynamically reorders the fallback chain at runtime — degraded providers are deprioritized automatically.
- Heuristic-only `agentfarm` provider is always available as the last-resort fallback with zero external dependency.
- Dashboard model profiles allow operators to choose a cost envelope (quality_first / speed_first / cost_balanced / custom) without manual provider ordering.
5. Mitigation Evidence
- ADR-007 approved in architecture decision log (2026-04-29).
- `createAutoResolver` in `apps/agent-runtime/src/llm-decision-adapter.ts` implements health-sorted fallback chain.
- `getProviderHealthScores()` exported for runtime observability.
- API gateway config route stores and redacts keys for all nine providers.
- 92/92 agent-runtime tests passing; 159/159 api-gateway tests passing; all typechecks clean.
6. Due Date
- 2026-05-26
7. Status
- Mitigated (Planning)
8. Closure Basis
- Open: operational monitoring of per-provider health scores in production and cost alerting rules are not yet wired to Azure Monitor. Remains open until production observability for provider health is confirmed.
