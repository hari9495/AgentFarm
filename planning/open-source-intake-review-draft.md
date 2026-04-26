# AgentFarm Open Source Intake and Third-Party Register (Approved Baseline)

## Purpose
Define how AgentFarm adopts, modifies, and governs open-source components safely and legally.

## Status
1. Baseline status: Approved for MVP governance.
2. Effective date: 2026-04-19.
3. Owner: Engineering Lead.

## Scope
1. Applies to all third-party libraries, SDKs, templates, starter kits, and copied modules.
2. Applies to backend, frontend, infrastructure, CI/CD, and data tooling.
3. Required before using any open-source component in product code.

## A. Open Source Intake Checklist
Complete this checklist before adoption.

### 1. Business and Architecture Fit
1. Problem solved is mapped to one architecture module.
2. Component does not conflict with risk and approval model.
3. Component supports required audit and evidence behavior.
4. Build-vs-buy rationale documented.

### 2. License and Legal Check
1. License identified and recorded.
2. License is approved by policy.
3. NOTICE and attribution obligations documented.
4. Redistribution and SaaS obligations understood.
5. If copyleft license appears, legal review is required.

### 3. Security Review
1. Known vulnerabilities checked.
2. Supply-chain risk checked (maintainer trust and release hygiene).
3. Secrets and unsafe defaults checked.
4. Network and data access scope reviewed.
5. Static and dependency scans pass policy.

### 4. Maintenance Health Check
1. Active maintenance within acceptable period.
2. Issues and PR activity reviewed.
3. Release cadence is stable.
4. Community and ecosystem confidence is acceptable.
5. Fork strategy defined if upstream slows down.

### 5. Integration Readiness
1. Contract boundaries defined in integration-contracts package.
2. Wrapper or adapter created to avoid direct lock-in.
3. Telemetry hooks added for observability.
4. Error handling and retries aligned with platform rules.
5. Fallback path documented if dependency fails.

### 6. Compliance and Data Handling
1. Data classification impact reviewed.
2. PII handling rules confirmed.
3. Data retention and deletion behavior verified.
4. Region and residency constraints reviewed.
5. Audit evidence compatibility validated.

### 7. Testing and Exit Criteria
1. Unit and integration tests added around adopted functionality.
2. Performance impact tested for critical paths.
3. License and security checks added in CI.
4. Rollback plan defined.
5. Owner assigned for upgrades and incident response.

## Intake Decision Outcomes
1. Approved
- Can be added to product code with owner assignment.
2. Conditional Approved
- Can be used only after listed remediation items are complete.
3. Rejected
- Cannot be used in product code.

## B. License Policy (Default)
1. Preferred licenses
- MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC.
2. Restricted licenses (legal approval required)
- MPL-2.0, LGPL.
3. Not allowed by default for backend SaaS core
- GPL, AGPL, SSPL, and unknown custom licenses.

## C. Third-Party Register Template
Use one row per dependency or adopted module.

| Component | Version | Source URL | License | Architecture Module | Owner | Security Status | Legal Status | Decision | Last Review Date | Next Review Date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Example: BullMQ | 5.x | https://github.com/taskforcesh/bullmq | MIT | worker-engine | Engineering Lead | Pass | Approved | Approved | 2026-04-18 | 2026-07-18 | Queue runtime |
| Example: NestJS | 10.x | https://github.com/nestjs/nest | MIT | runtime-api | Engineering Lead | Pass | Approved | Approved | 2026-04-18 | 2026-07-18 | Service framework |

## D. Required Evidence Per Entry
1. License snapshot or SPDX reference.
2. Security scan result reference.
3. Architecture fit note.
4. Owner assignment proof.
5. Decision record and date.

## E. Review Cadence
1. Weekly
- Review newly requested dependencies.
2. Monthly
- Re-check high-risk or internet-facing dependencies.
3. Quarterly
- Full dependency posture review and cleanup.

## F. CI/CD Policy Hooks
1. Block merge on failed vulnerability threshold.
2. Block merge on unapproved license.
3. Require dependency owner metadata.
4. Require SBOM generation for release artifacts.

## G. Fast Intake Form (For Team Use)
1. Component name:
2. Problem it solves:
3. Architecture module impacted:
4. License:
5. Security scan status:
6. Owner:
7. Decision requested: Approved, Conditional, Rejected
8. Risks and mitigations:
9. Rollback plan:
10. Reviewer signoff:

## H. Merge Plan (Completed)
This baseline is now integrated into governance workflow:
1. planning/product-architecture.md
- Open-source boundaries and security intake rules are enforced.
2. planning/v1-release-pack.md
- Canonical architecture pack references this approved intake baseline.
3. operations/weekly-operating-system.md
- Monthly dependency posture review is part of architecture governance cadence.
