# AgentFarm Vision and Positioning

## Vision
Help companies scale output without scaling headcount by using role-based AI agents — AI teammates that operate with real identities, enforce human approval for risky actions, and provide a complete audit trail for every decision.

## Positioning
AgentFarm is not just a chatbot and not just automation scripts. It is an AI workforce system with role-based agents that carry real identities, operate in company tools, and are governed by structured approval workflows.

## Target Users
1. CTOs and engineering leaders at growth-stage companies (20–500 people)
2. Engineering managers under hiring pressure
3. Operations leaders seeking process automation with compliance
4. Compliance and security teams requiring auditable AI behavior

## Core Promise
1. **Hire an AI agent** — choose a role (Developer, Tester, Content Writer, etc.), connect your tools, configure persona and approval rules, and deploy in minutes via the setup wizard
2. **Run it in real workflows** — the agent operates across Jira, GitHub, Slack, Teams, Outlook, and 14+ more connectors using the same tools a human would
3. **Keep strong human control** — risk-based routing sends medium/high-risk actions to the approval queue; kill-switch halts all risky execution in 30 seconds; tester role can only edit test files, never source
4. **Show measurable value** — cost dashboard ($0.10/task platform fee + LLM cost), per-agent billing breakdown, governance KPIs (P50/P95 approval latency, provider fallback rate, evidence completeness)

## Why AgentFarm Wins
1. **Role-based quality** — agents are scoped to their role; the Developer agent can't accidentally act like a recruiter; the Tester agent can't edit production source code
2. **Real identity** — every agent has a persona (name, email, avatar, communication style) and announces its AI nature on every outbound channel (EU AI Act / FTC compliant)
3. **Enterprise governance** — immutable audit log, compliance export (JSON/CSV), evidence bundles with retention policies, A/B testing framework
4. **Full desktop operation** — noVNC + Xvfb desktop VM lets agents operate any GUI application visually, including joining and speaking in video meetings
5. **Memory that improves** — pgvector episodic memory (per-person interaction history) + semantic knowledge base (company context RAG) make agents smarter over time

## Agent Role Catalogue (Sprint 18)

| Role | Status | Key Tools |
|------|--------|-----------|
| Developer | ✅ Full | GitHub, Jira, Slack, Azure DevOps + 12-tier actions + autonomous loop |
| Tester | ✅ Full | 18 testing connectors + Selenium, Cypress, Playwright, Appium, k6, OWASP ZAP |
| Technical Writer | ✅ Full | Documentation workflows, knowledge base publishing |
| Content Writer | ✅ Full | LLM prose, SEO, WordPress/Contentful/HubSpot CMS, editorial scheduling |
| Corporate Assistant | ✅ Full | Corporate coordination, scheduling, meeting management |
| Full Stack Developer | 🚧 Profile defined | — |
| Business Analyst | 🚧 Profile defined | — |
| PM / PO / Scrum Master | 🚧 Profile defined | — |
| Sales Rep | 🚧 Profile defined | — |
| Marketing Specialist | 🚧 Profile defined | — |
| Recruiter | 🚧 Profile defined | — |
| Customer Support Executive | 🚧 Profile defined | — |

## Current Build State (Sprint 18 — 2026-05-29)
- 18 product sprints completed
- api-gateway: 1,237+ tests · agent-runtime: 1,120+ tests
- Quality gate: 47/47 checks PASS
- Full build inventory: see [planning/build-snapshot-2026-05-16.md](../planning/build-snapshot-2026-05-16.md)
