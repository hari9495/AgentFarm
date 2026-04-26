# AgentFarm Master Plan
## Purpose
Build role-based AI agents for companies with clear ownership, clear release gates, and simple weekly execution.
Planning-first rule: no feature development starts until architecture baseline and decision gates are approved.
## Main Goals
1. Build AI agents that behave like real team members.
2. Keep strict safety and approval controls.
3. Launch only when gold-standard quality is proven.
## Phases
1. Validation and Architecture (Weeks 1-6)
- Validate customer need and workflow fit.
- Confirm top gold standards and evidence rules.
- Finalize MVP role scope.
- Finalize product architecture and decision records.
- Approve architecture gates before implementation.
2. MVP Build (Weeks 7-20)
- Build Developer Agent first.
- Run internal dogfooding and quality checks.
- Pass all launch gates at score 5.
3. Pilot (Weeks 21-30)
- Run with 1-2 customers.
- Track quality, safety, and business value.
- Convert feedback into improvements.
4. Scale (Weeks 31-42)
- Add QA Agent and Manager Agent.
- Keep same score-5 gates per role.
5. Enterprise (Week 43+)
- Expand compliance, reliability, and operations.
- Standardize rollout process across customers.
## Architecture Baseline (Must Finish Before Build)
1. System boundaries
- Control plane: identity, policy, approval, and configuration.
- Runtime plane: role execution engine, task orchestration, and connector actions.
- Evidence plane: audit logs, score evidence, and reporting.
2. Core architecture components
- Identity service for agent profile, account mapping, and disclosure enforcement.
- Policy engine for risk classification and action permission checks.
- Approval workflow service for medium and high risk actions.
- Connector layer for Jira, Microsoft Teams, GitHub, and company email.
- Observability stack for logs, traces, gate metrics, and incident triggers.
3. Data and audit model
- Unified action record: actor, role, system, action, timestamp, reason, risk level, approval state.
- Immutable approval log with approver identity and decision latency.
- Score evidence table tied to gold-standard category and freshness date.
4. Non-functional targets
- Reliability target for MVP critical paths: 99.5 percent.
- Approval decision latency target: under 2 minutes for human step.
- Full audit completeness on all risky actions: 100 percent.
- Security baseline: no critical findings at release gate.
## Architecture Decision Gates
1. Gate A: Architecture scope freeze
- MVP boundaries and out-of-scope items signed off by Product Lead.
2. Gate B: Safety and control signoff
- Security and Safety Lead confirms policy model, approval model, and kill switch design.
3. Gate C: Integration readiness signoff
- Engineering Lead confirms connector contracts for Jira, Microsoft Teams, GitHub, and email.
4. Gate D: Evidence readiness signoff
- Product and Security confirm scoring evidence schema, freshness policy, and reporting cadence.
Rule: development starts only after all architecture gates are approved.
## Planning Artifacts
1. Product architecture baseline: planning/product-architecture.md
2. Architecture decision log: planning/architecture-decision-log.md
3. Architecture risk register: planning/architecture-risk-register.md
4. Production-ready v1 pack: planning/v1-release-pack.md
5. Engineering execution design: planning/engineering-execution-design.md
## Non-Negotiable Release Gates
1. Identity Realism = 5
2. Role Fidelity and Task Quality = 5
3. Autonomy with Human Approval = 5
## Competitive Decision Framework
1. Weighted scoring is the default decision model in research/competitive-gold-standards.md.
2. MVP decisions use re-based active-standard weights for standards 1-3.
3. Enterprise decisions use full 1-8 weighted model.
4. Any active no-go trigger overrides weighted score and blocks release.
5. Score evidence freshness and confidence labels are mandatory for gate decisions.
## Ownership
1. Product Lead
- Owns roadmap, priorities, and gate decisions.
2. Engineering Lead
- Owns build quality and delivery.
3. Security and Safety Lead
- Owns approval policies, audit logs, and incident controls.
4. Customer Success Lead
- Owns pilot onboarding, adoption, and feedback loop.
5. Architecture Owner (assigned by Product Lead)
- Owns architecture document quality, dependency map, and decision log integrity.
6. Competitive Intelligence Owner (assigned by Product Lead)
- Owns competitor scoring quality, citation integrity, and monthly score refresh.
## Update Rules
1. If timeline slips, update this plan the same day.
2. If new risk appears, update risk log within 4 hours.
3. If customer feedback changes direction, update plan within 1 week.
4. If competitor makes major move, update research notes within 48 hours.
5. If architecture decision changes, update architecture doc and decision log the same day.
## Weekly Rhythm
1. Sunday: leadership planning
2. Monday: team kickoff
3. Tuesday to Thursday: daily standups
4. Friday: demo, metrics, and next-week plan
## Monthly Decision Review
1. Recompute MVP or enterprise weighted score with latest evidence.
2. Confirm active disqualifier status.
3. Publish go, conditional-go, or no-go recommendation with owner signoff.
4. Assign remediation owners for each score below threshold.
## Pre-Development Final Approval
1. Run v1 pack review sequence from planning/v1-release-pack.md.
2. Complete final approval checklist from planning/v1-release-pack.md.
3. Development may start only after all checklist items are complete.
