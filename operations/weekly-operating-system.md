# AgentFarm Weekly Operating System

## Purpose
Keep execution clear every week with simple routines.

## Sunday: Planning Sync
1. Review current phase status.
2. Confirm next week priorities.
3. Confirm owners and dependencies.
4. Raise key risks.
5. Review architecture decisions and open ADR items.

## Monday: Team Kickoff
1. Align on weekly goals.
2. Confirm deliverables by owner.
3. Confirm blockers.
4. Confirm architecture dependencies that can block execution.

## Tuesday to Thursday: Daily Standup
1. What was completed yesterday
2. What is planned today
3. What is blocked

## Friday: Demo and Review
1. Demo progress
2. Review metrics and gate status
3. Mark status: on track, at risk, or blocked
4. Confirm next week plan
5. Review architecture drift against approved baseline

## Monthly Review
1. Review gold-standard scores
2. Review pilot and customer feedback
3. Review top risks and mitigation
4. Adjust roadmap if needed
5. Reconfirm architecture baseline and non-functional targets
6. Recompute weighted score and publish go, conditional-go, or no-go status
7. Review confidence mix (high, medium, low) across score evidence

## Architecture Governance Cadence
1. Weekly architecture review (45 minutes)
- Review open ADR decisions, integration contract changes, and risk controls.
2. Change control rule
- Any architecture change that impacts release gates must be approved by Product Lead and Security and Safety Lead.
3. Drift response
- If architecture drift is detected, create mitigation owner and due date within 24 hours.

## Operating Rules
1. If a major decision changes, update planning docs the same day.
2. If release gates change, update both planning and gold-standards docs.
3. If ownership is unclear, follow the master plan ownership section.
4. If architecture changes, update product architecture and related ADRs the same day.
5. If monthly weighted score drops below threshold, create recovery plan within 48 hours.
