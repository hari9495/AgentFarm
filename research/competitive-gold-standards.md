# AgentFarm Competitive Gold Standards
## Purpose
Use a clear scoring system to compare AgentFarm with competitors and protect product quality.
## Scoring Model
- Score 1: very weak
- Score 2: basic
- Score 3: usable
- Score 4: strong
- Score 5: gold standard
Rule: MVP launch and enterprise scale require score 5 for active standards.
Active standards policy:
1. MVP active standards: 1-3 (Identity, Role Fidelity, Autonomy).
2. Enterprise active standards: 1-8 (all standards).
## Gold Standard Categories
1. Identity Realism
2. Role Fidelity and Task Quality
3. Autonomy with Human Approval
4. Integration Depth and Onboarding Speed
5. Security, Privacy, and Compliance
6. Governance and Auditability
7. Reliability and SLA Operations
8. Cost and ROI Strength
## Weighted Scoring Model
Enterprise weighting (total = 100):
1. Identity Realism: 15
2. Role Fidelity and Task Quality: 20
3. Autonomy with Human Approval: 12
4. Integration Depth and Onboarding Speed: 12
5. Security, Privacy, and Compliance: 15
6. Governance and Auditability: 10
7. Reliability and SLA Operations: 9
8. Cost and ROI Strength: 7
MVP weighted model:
1. Use active standards 1-3 only.
2. Re-based weights for MVP:
- Identity Realism: 32
- Role Fidelity and Task Quality: 43
- Autonomy with Human Approval: 25
3. MVP weighted score formula:
- weighted_score_mvp = ((identity_score * 32) + (role_score * 43) + (autonomy_score * 25)) / 100
Enterprise weighted score formula:
- weighted_score_enterprise = (sum(score_i * weight_i) for i in 1..8) / 100
## Decision Thresholds (Go and No-Go)
MVP go threshold:
1. Identity Realism = 5
2. Role Fidelity and Task Quality = 5
3. Autonomy with Human Approval = 5
4. weighted_score_mvp >= 4.8
5. No active disqualifier in standards 1-3 or 5
Enterprise go threshold:
1. Score >= 5 on all standards 1-8
2. weighted_score_enterprise >= 4.7
3. No active disqualifier in any standard
No-go triggers:
1. Any unresolved critical security finding.
2. Missing audit attribution for risky actions.
3. Approval controls are bypassable in production-like tests.
4. Evidence freshness breaches on any required gate score.
## Competitor Scoring Template
Use one row per competitor and one row for AgentFarm baseline.

| Competitor | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | Weighted Score | Top Disqualifier Risk | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Example Competitor A | 3 | 3 | 2 | 4 | 2 | 3 | 3 | 3 | 2.85 | Security evidence gap | Medium |
| AgentFarm Current | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 3 | 4.55 | None | High |

Evidence citation template (required per score):
1. Source: product doc, demo artifact, customer reference, or audit report.
2. Date: YYYY-MM-DD.
3. Confidence: High, Medium, or Low.
4. Evidence type: direct proof, inferred proof, or claim only.
5. Owner: reviewer accountable for the score entry.

Confidence labels:
1. High: direct product proof dated within 90 days.
2. Medium: indirect proof or older than 90 days but within 180 days.
3. Low: claim-based, no direct artifact, or older than 180 days.

Scoring hygiene rules:
1. Any Low-confidence score above 3 requires explicit caveat in notes.
2. If evidence conflicts, keep lower score until conflict is resolved.
3. If evidence is stale, downgrade confidence first, then review score.
## Gold Standard 1: Identity Realism
Goal: Agent behaves like a real teammate while staying clearly AI-labeled.
Must include:
1. Real corporate-style email and chat identity behavior
2. Role profile consistency
3. Shift-based presence behavior
4. Full attribution and audit trail
Internal bar:
- MVP threshold: 5
- Enterprise threshold: 5 (sustained in audits)
## Gold Standard 2: Role Fidelity and Task Quality
Goal: Agent performs like a specialist, not a generic chatbot.
Must include:
1. High first-pass quality
2. Low rework rate
3. Strong role-specific output quality
4. Reliable behavior on edge cases
Internal bar:
- MVP threshold: 5
- Enterprise threshold: 5 (sustained in audits)
## Gold Standard 3: Autonomy with Human Approval
Goal: Agent works independently but always requests approval for risky actions.
Must include:
1. Clear risk levels
2. Mandatory approval flow for medium and high risk actions
3. Kill switch that works fast
4. Complete decision and approval logs
Internal bar:
- MVP threshold: 5
- Enterprise threshold: 5 (sustained in audits)
## Gold Standard 4: Integration Depth and Onboarding Speed
Goal: Agents connect to real company systems quickly, reliably, and with low setup burden.
Must include:
1. Stable integrations for Jira, Slack, GitHub, and company email.
2. Standard connector contracts with version control.
3. Fast onboarding workflow with clear admin setup steps.
4. Runtime monitoring for connector health and failures.
Scoring rubric:
1. Score 1: Demo-level integration only, manual setup is unclear.
2. Score 2: Basic connectors exist but frequent failures and high setup effort.
3. Score 3: Core connectors work in normal paths, onboarding is usable.
4. Score 4: Connectors are reliable with strong docs and predictable onboarding.
5. Score 5: Enterprise-grade connector reliability, fast onboarding, and measurable setup consistency.
Core metrics:
1. Time to first connected workflow.
2. Connector success rate.
3. Integration incident rate.
4. Onboarding completion rate.
Disqualifiers (cannot score above 2):
1. No stable contracts for core connectors.
2. No monitoring on connector health.
3. Onboarding requires deep engineering support for standard setup.
Internal bar:
- MVP threshold: 4
- Enterprise threshold: 5
## Gold Standard 5: Security, Privacy, and Compliance
Goal: Agent operations are secure by default and compliant with enterprise requirements.
Must include:
1. Least-privilege access model for connectors and control plane.
2. Data handling rules for sensitive information.
3. Security testing and issue remediation workflow.
4. Compliance controls and evidence traceability.
Scoring rubric:
1. Score 1: Minimal security controls, no formal compliance posture.
2. Score 2: Basic controls exist but major gaps remain.
3. Score 3: Core controls are in place with partial compliance evidence.
4. Score 4: Strong controls, repeatable reviews, and audit-ready evidence.
5. Score 5: Enterprise-grade security and compliance with continuous validation.
Core metrics:
1. Critical vulnerability count.
2. Mean time to remediate critical issues.
3. Policy violation rate.
4. Compliance evidence completeness.
Disqualifiers (cannot score above 2):
1. Any unresolved critical security finding.
2. No least-privilege enforcement.
3. No auditable compliance evidence.
Internal bar:
- MVP threshold: 5
- Enterprise threshold: 5 (sustained in audits)
## Gold Standard 6: Governance and Auditability
Goal: Every meaningful action is explainable, attributable, and reviewable by authorized stakeholders.
Must include:
1. Complete action and approval traceability.
2. Clear ownership for policy and decision changes.
3. Change logs for model, policy, and configuration updates.
4. Review workflows for high-impact decisions.
Scoring rubric:
1. Score 1: Sparse logging and no governance structure.
2. Score 2: Basic logs exist but inconsistent and hard to review.
3. Score 3: Good action logs with partial decision traceability.
4. Score 4: Strong governance process and consistent audit reporting.
5. Score 5: Enterprise governance with complete traceability and rapid audit response.
Core metrics:
1. Audit trace completeness.
2. Decision log freshness.
3. Governance review SLA attainment.
4. Number of unowned policy changes.
Disqualifiers (cannot score above 2):
1. No reliable actor attribution for actions.
2. No decision log for policy changes.
3. No owner assigned for governance exceptions.
Internal bar:
- MVP threshold: 4
- Enterprise threshold: 5
## Gold Standard 7: Reliability and SLA Operations
Goal: Agent workflows are dependable under normal and peak conditions with defined service expectations.
Must include:
1. Defined SLAs for critical workflows.
2. Error handling, retries, and escalation paths.
3. Incident response process with ownership.
4. Operational monitoring with alert quality controls.
Scoring rubric:
1. Score 1: Unreliable workflows with no operational discipline.
2. Score 2: Basic uptime but frequent failures and weak incident handling.
3. Score 3: Stable operation in normal conditions with acceptable recovery.
4. Score 4: Strong reliability, fast incident response, and clear SLA tracking.
5. Score 5: Enterprise operations with sustained SLA achievement and low incident impact.
Core metrics:
1. Workflow availability.
2. SLA attainment rate.
3. Mean time to detect incidents.
4. Mean time to resolve incidents.
Disqualifiers (cannot score above 2):
1. No documented SLA for critical workflows.
2. No incident response ownership.
3. Repeated high-severity outages without root-cause closure.
Internal bar:
- MVP threshold: 4
- Enterprise threshold: 5
## Gold Standard 8: Cost and ROI Strength
Goal: Agent deployment delivers measurable economic value with clear cost transparency.
Must include:
1. Unit-cost model per workflow or task type.
2. Baseline versus post-deployment productivity comparison.
3. ROI reporting at role and customer level.
4. Cost guardrails for runaway usage.
Scoring rubric:
1. Score 1: No cost model and no value proof.
2. Score 2: Basic cost tracking without clear ROI.
3. Score 3: Usable cost reporting with directional value evidence.
4. Score 4: Strong ROI measurement tied to operational outcomes.
5. Score 5: Enterprise-grade cost governance and repeatable ROI outcomes.
Core metrics:
1. Cost per completed task.
2. Savings versus manual baseline.
3. Payback period.
4. Budget variance.
Disqualifiers (cannot score above 2):
1. No role-level cost visibility.
2. No baseline for ROI comparison.
3. No budget controls for high-usage scenarios.
Internal bar:
- MVP threshold: 3
- Enterprise threshold: 5
## Evidence Rule
Every score entry must include:
1. Source
2. Date
3. Confidence level
4. Practical example
5. Owner
6. Freshness status (within 90 days for high-confidence score)

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
