# AgentFarm — Agent Capabilities Reference

**Platform:** AgentFarm Multi-Tenant AI Agent Orchestration  
**Date:** 2026-05-29  
**Scope:** 13 top-level agents + 1 Tester sub-agent across engineering, business, and operations domains

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [How to Read This Document](#how-to-read-this-document)
3. [Agent Roster at a Glance](#agent-roster-at-a-glance)
4. [Recruiter](#1-recruiter)
5. [Software Developer](#2-software-developer)
6. [Full-Stack Developer](#3-full-stack-developer)
7. [QA Tester](#4-qa-tester)
8. [Technical Writer](#5-technical-writer)
9. [Content Writer](#6-content-writer)
10. [Marketing Specialist](#7-marketing-specialist)
11. [Sales Representative](#8-sales-representative)
12. [Corporate Assistant](#9-corporate-assistant)
13. [Customer Support Executive](#10-customer-support-executive)
14. [DevOps Engineer](#11-devops-engineer)
15. [Business Analyst](#12-business-analyst)
16. [Project Manager / Scrum Master](#13-project-manager--scrum-master)
17. [Mobile Engineer (Tester Sub-Agent)](#14-mobile-engineer-tester-sub-agent)
18. [Cross-Agent Capabilities](#cross-agent-capabilities)
19. [Governance & Safety Model](#governance--safety-model)

---

## Platform Overview

AgentFarm agents are software entities that execute role-based tasks autonomously within a governed runtime. Each agent has a defined set of actions it can perform, a set of external systems it can connect to, and a policy envelope that determines when it must pause and request human approval before proceeding.

Agents operate at two levels of autonomy:

- **Autonomous (LOW risk):** The agent executes immediately without human intervention.
- **Approval-gated (MEDIUM / HIGH risk):** The agent pauses, surfaces a decision record in the operator dashboard, and waits for a human to approve, modify, or reject the proposed action before continuing.

All agents share a common set of cross-cutting capabilities described in the [Cross-Agent Capabilities](#cross-agent-capabilities) section.

---

## How to Read This Document

Each agent section follows the same structure:

| Section | What it contains |
|---|---|
| **Role summary** | What role this agent occupies in an organisation |
| **Human equivalent** | The human job title(s) and seniority level this agent is designed to replicate |
| **Where it matches a human** | Tasks the agent performs at or above the speed and consistency of a skilled human |
| **Where it falls short of a human** | Tasks that require human judgment, creativity, or authority the agent cannot substitute for |
| **Connectors** | External systems the agent can read from or write to |
| **Full action list** | Every discrete action the agent can execute, with a description and risk classification |
| **Notable features** | Advanced or non-obvious capabilities worth highlighting |

---

## Agent Roster at a Glance

### Top-Level Agents (13)

| # | Agent | Actions | Connectors | Status |
|---|---|---|---|---|
| 1 | Recruiter | 26 | 22 | Production-ready |
| 2 | Software Developer | 20 | 18 | Production-ready |
| 3 | Full-Stack Developer | 31 | 23 | Production-ready |
| 4 | QA Tester | 28 | 22 | Production-ready |
| 5 | Technical Writer | 27 | 5 | Production-ready |
| 6 | Content Writer | 20 | 8 | Production-ready |
| 7 | Marketing Specialist | 16 | 12 | Production-ready |
| 8 | Sales Representative | 26 | 9 | Production-ready |
| 9 | Corporate Assistant | 10 | 12 | Production-ready |
| 10 | Customer Support Executive | 27 | 22 | Production-ready |
| 11 | DevOps Engineer | 69+ | 18+ | Production-ready |
| 12 | Business Analyst | 16 | 13 | Production-ready |
| 13 | Project Manager / Scrum Master | 23 | 11 | Production-ready |

### Sub-Agents (1)

Sub-agents are not directly subscribable by operators. They are spawned by a parent agent to handle a specialised task domain and operate under the parent's governance envelope.

| Sub-Agent | Parent | Actions | Connectors | Status |
|---|---|---|---|---|
| Mobile Engineer | QA Tester | 15+ | 27 | Production-ready |

---

## 1. Recruiter

### Role Summary

The Recruiter agent manages the full talent acquisition lifecycle — from drafting a job description to generating an offer letter and handing off to onboarding. It integrates with job boards, ATS platforms, and calendar systems to run sourcing, screening, scheduling, and compliance tasks end to end.

### Human Equivalent

- **Title:** Talent Acquisition Specialist, Senior Recruiter, Recruitment Manager
- **Seniority:** Mid to Senior level (5–10 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Job description writing | Drafts branded, inclusive JDs with DEI language scoring and automated bias scanning |
| Job board publishing | Posts roles to LinkedIn, Indeed, Glassdoor behind a human-approval gate |
| Candidate sourcing | Searches LinkedIn and Apollo for candidates matching the role profile |
| Resume screening | Parses and scores resumes against the JD; handles PDFs, Word, and plain text |
| Outreach personalisation | Composes personalised outreach messages per candidate profile |
| Interview scheduling | Reads recruiter and candidate calendars, proposes time slots, sends invitations |
| Phone screen scripting | Generates structured phone screen scripts with scoring rubrics |
| Feedback aggregation | Collects, deduplicates, and summarises interviewer feedback |
| Pipeline management | Tracks all candidates across ATS stages; produces status reports |
| Offer letter generation | Drafts compliant employment offer letters aligned with approved budget bands |
| Salary benchmarking | Pulls live market data for role × location × seniority |
| Rejection drafting | Writes EEOC-safe rejection emails tailored to the stage of rejection |
| Offer negotiation | Evaluates counter-offers and prepares scripted verbal responses |
| Background checks | Initiates FCRA-compliant background check workflows |
| Reference checks | Sends structured reference questionnaires and transcribes debrief calls |
| Talent pool management | Maintains silver-medal candidate CRM with automated nurture sequences |
| Requisition approval | Routes multi-level headcount approvals through the governance workflow |
| Credential verification | Checks professional licences (RN, JD, CPA, PE) against domain databases |
| International hiring | Handles right-to-work, IR35, GDPR, and local labour law variations for 40+ countries |
| Campus recruiting | Runs career fair workflows, bulk screening, and intern tracking |
| Onboarding handoff | Produces Day-1 checklists and welcome sequences once an offer is accepted |

### Where It Falls Short of a Human

- Cannot build genuine interpersonal rapport with a passive candidate who is not actively looking.
- Cannot exercise discretionary judgment that departs from approved budget or headcount policy — every override requires a human decision.
- Cultural intuition ("this person would thrive here") is a heuristic the agent can flag but not resolve alone.
- Employment law interpretation in novel jurisdictions requires a human legal review.

### Connectors

LinkedIn · LinkedIn Recruiter · Indeed · Glassdoor · Apollo · Hunter · Greenhouse · Lever · Workday · Ashby · iCIMS · Gmail · Outlook · Slack · Microsoft Teams · Google Calendar · Calendly · Cal.com · Google Drive · DocuSign · Zoho Sign · HubSpot · Salesforce

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_rec_build_jd` | Draft branded job description from role brief with DEI scan | LOW |
| `workspace_rec_post_job` | Publish role to job boards | HIGH — requires approval |
| `workspace_rec_source_candidates` | Search LinkedIn / Apollo for matching profiles | LOW |
| `workspace_rec_screen_resume` | Parse and score resume against JD | LOW |
| `workspace_rec_send_outreach` | Send personalised candidate outreach | MEDIUM |
| `workspace_rec_schedule_interview` | Coordinate calendars and generate invitations | LOW |
| `workspace_rec_conduct_phone_screen` | Generate structured phone screen script | LOW |
| `workspace_rec_gather_feedback` | Aggregate and summarise interviewer feedback | LOW |
| `workspace_rec_manage_pipeline` | Build ATS pipeline status report | LOW |
| `workspace_rec_generate_offer` | Draft employment offer letter (budget-gated) | HIGH — requires approval |
| `workspace_rec_market_intelligence` | Industry salary benchmarking | LOW |
| `workspace_rec_request_human_gate` | Route high-risk action to human decision-maker | INTERNAL |
| `workspace_rec_check_bgc` | Initiate FCRA-compliant background check | HIGH — requires approval |
| `workspace_rec_compose_rejection` | Write EEOC-safe rejection email by stage | LOW |
| `workspace_rec_negotiate_offer` | Counter-offer evaluation and verbal scripts | MEDIUM |
| `workspace_rec_scan_jd_bias` | Detect non-inclusive language in JD | LOW |
| `workspace_rec_validate_credentials` | Verify professional licences (RN, JD, CPA, PE) | LOW |
| `workspace_rec_run_reference_check` | Send reference questionnaire and transcribe debrief | LOW |
| `workspace_rec_manage_talent_pool` | Silver-medal CRM and nurture sequence management | LOW |
| `workspace_rec_approve_requisition` | Route multi-level headcount approval | HIGH — requires approval |
| `workspace_rec_onboarding_handoff` | Produce Day-1 checklist and welcome sequences | LOW |
| `workspace_rec_run_assessment` | Generate take-home brief and scoring rubric | LOW |
| `workspace_rec_advise_jd_compliance` | Add regulatory JD disclosures by industry | LOW |
| `workspace_rec_international` | Adapt role for international hiring compliance | LOW |
| `workspace_rec_campus_recruiting` | Career fair workflow, bulk screening, intern tracker | LOW |
| `workspace_rec_dashboard_request` | Emit API config / approval requests to dashboard | INTERNAL |

### Notable Features

- **Approval-gated high-risk actions:** Job posting, offer generation, background checks, and requisition approval all surface a human decision card before execution. The agent cannot proceed without an explicit operator decision.
- **FCRA compliance:** Background check workflows are structured to satisfy FCRA adverse action notice requirements.
- **EEOC-safe rejections:** Rejection templates are generated to avoid language that could constitute evidence of discriminatory screening.
- **DEI language scanner:** JDs are automatically scanned and scored for gendered, ageist, or exclusionary language before posting.
- **40+ country support:** Right-to-work, IR35 off-payroll rules, GDPR data subject rights, and local probation / notice period norms are all handled for international roles.
- **Only agent with a manifest file:** `recruiter-manifest.ts` declares the agent's full capability surface for external API discovery.

---

## 2. Software Developer

### Role Summary

The Developer agent implements features, fixes bugs, reviews code, writes tests, performs security audits, and manages the full software delivery workflow from issue triage to pull request creation. It operates directly against version control repositories and can spawn sub-agents for complex long-horizon tasks.

### Human Equivalent

- **Title:** Software Engineer, Senior Software Engineer, Staff Engineer
- **Seniority:** Mid to Senior (3–8 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Feature implementation | Full feature from issue or spec to working, tested code |
| Bug fixing | Diagnoses the root cause and patches the issue |
| Code review | Produces structured PR review with inline comments and severity classification |
| Refactoring | Refactors a module while preserving observable behaviour, backed by tests |
| Test writing | Generates unit and integration tests from code or spec |
| Debugging | Runs failing tests in debug mode; supports race detection, memory sanitisation, GDB |
| PR creation | Writes PR title, description, and links issue references automatically |
| Issue handling | Triages, patches, or closes GitHub / GitLab / Linear / Jira issues |
| Branch management | Creates, lists, and deletes branches following naming conventions |
| Commit generation | Stages relevant files and writes a descriptive commit message |
| Security audit | Runs SAST tools, checks for secrets in history, evaluates CVE exposure |
| Dependency audit | Identifies outdated and vulnerable dependencies; proposes upgrades |
| Performance audit | Runs benchmarks and detects regressions against a baseline |
| Code quality | Runs linters, formatters, and dead code elimination |
| API design | Generates OpenAPI / REST / GraphQL specifications from requirements |
| Database migrations | Generates safety-checked schema migrations with rollback plans |
| Codebase onboarding | Produces a structured map of a new codebase: architecture, entry points, conventions |
| Standup reporting | Generates a daily standup report from episodic memory of recent activity |
| Incident response | Diagnoses production incidents and generates a patch plan |
| Technical specification | Produces a structured technical design document from a problem statement |

### Where It Falls Short of a Human

- Architecture decisions with significant long-term organisational implications require human senior engineer judgment.
- The agent delegates to workspace executor sub-actions for execution — if those sub-actions are not configured, it cannot write code directly without that dependency.
- Negotiating technical trade-offs with stakeholders requires human communication beyond the agent's automated text generation.
- Novel security vulnerabilities (zero-days, business-logic exploits) may not be detected without human security review.

### Connectors

GitHub · GitLab · Bitbucket · Azure DevOps · Jira · Linear · Slack · Microsoft Teams · Jenkins · CircleCI · GitHub Actions · GitLab CI · Confluence · Notion · PagerDuty · Datadog · Sentry · SonarQube · Codecov

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_dev_implement_feature` | Full feature implementation from issue or spec | MEDIUM |
| `workspace_dev_fix_bug` | Bug diagnosis and patch | LOW |
| `workspace_dev_code_review` | PR / file review with inline comments | LOW |
| `workspace_dev_refactor` | Refactor module preserving behaviour | MEDIUM |
| `workspace_dev_write_tests` | Unit / integration test generation | LOW |
| `workspace_dev_debug_session` | Interactive debug for failing tests | LOW |
| `workspace_dev_create_pr` | Auto-generate PR title and body | LOW |
| `workspace_dev_handle_issue` | Triage, fix, or close issues | LOW |
| `workspace_dev_branch_manage` | Create / list / delete branches | LOW |
| `workspace_dev_commit` | Stage and commit with auto-generated message | LOW |
| `workspace_dev_security_audit` | SAST + secrets + CVE scan | LOW |
| `workspace_dev_dependency_audit` | Outdated and vulnerable dependency check | LOW |
| `workspace_dev_performance_audit` | Benchmark and regression detection | LOW |
| `workspace_dev_code_quality` | Linter + formatter + dead code removal | LOW |
| `workspace_dev_api_design` | OpenAPI / REST / GraphQL spec generation | LOW |
| `workspace_dev_db_migration` | Safety-checked schema migration generation | HIGH — requires approval |
| `workspace_dev_onboard_codebase` | Structured codebase exploration and documentation | LOW |
| `workspace_dev_standup_report` | Daily standup from episodic memory | LOW |
| `workspace_dev_incident_response` | Production incident diagnosis and patch planning | MEDIUM |
| `workspace_dev_tech_spec` | Technical specification document generation | LOW |

### Notable Features

- **Workspace executor delegation:** Complex actions (feature implementation, bulk refactor) are delegated to `workspace_subagent_spawn` — enabling natural-language task descriptions to be decomposed and executed across multiple steps.
- **Cross-repo capability:** Can navigate monorepo boundaries, search across repos, and produce cross-repository refactors.
- **Deep debug support:** Race detection (`-race`), memory sanitisation (`ASAN`), and GDB session scripting are all supported for hard-to-reproduce bugs.
- **Pair programming mode:** Can operate in a pair-mode where it proposes each step and waits for human confirmation before writing code.
- **Proactive scanning:** Background scan mode detects security issues, stale dependencies, and code quality regressions without being explicitly asked.

---

## 3. Full-Stack Developer

### Role Summary

The Full-Stack Developer agent covers everything the Developer agent can do, plus a complete frontend layer: UI component generation, design handoff from Figma, accessibility audits, responsive design checks, state management scaffolding, and deployment previews. It is designed for engineers who own the full vertical from API to pixel.

### Human Equivalent

- **Title:** Full-Stack Engineer, Senior Full-Stack Engineer, Lead Engineer
- **Seniority:** Senior to Staff (5–10 years experience equivalent)

### Where It Matches a Human

Everything in the Developer section, plus:

| Capability | Detail |
|---|---|
| UI component generation | Generates React, Vue, Angular, Svelte, or SolidJS components from a written or visual spec |
| Figma design handoff | Extracts design tokens (colours, spacing, typography) directly from Figma files |
| Responsive design verification | Checks breakpoints across mobile, tablet, and desktop viewports |
| Accessibility audit | Runs Axe-based scans; reports WCAG violations with remediation guidance |
| SEO audit | Validates meta tags, structured data, and schema.org markup |
| Performance analysis | Bundle size analysis, Core Web Vitals measurement, Lighthouse integration |
| State management scaffolding | Generates Redux Toolkit, Zustand, or Pinia stores from data models |
| API client generation | Generates typed API clients with TypeScript interfaces from OpenAPI specs |
| Auth implementation | Scaffolds OAuth 2.0, JWT, and session-based authentication flows |
| Realtime setup | Configures WebSocket, Socket.io, or Supabase Realtime connections |
| Environment setup | Generates `.env.example` with validation and documentation |
| Full-stack feature | End-to-end feature from database schema to UI component |
| Project scaffolding | Bootstraps new Next.js, Remix, or SvelteKit projects with standard tooling |
| Preview deployment | Deploys preview builds to Vercel or Netlify for stakeholder review |
| Visual review | Critiques CSS and design decisions against design system guidelines |
| Architecture review | Generates ADRs for significant technical decisions |
| Browser debugging | Playwright-based browser automation for reproducing frontend issues |
| Performance profiling | On-page CPU and memory profiling via Playwright instrumentation |
| Project memory | Persists long-term project context across sprint boundaries |
| Design scoring | Quantifies aesthetic quality against established design heuristics |
| A/B test interpretation | Reads experiment results and produces statistical significance analysis |
| Analytics snapshots | Pulls UX analytics and session replay data for feature evaluation |

### Where It Falls Short of a Human

- Cannot exercise creative design judgment at a pixel level — design tokens must come from a human-authored design system or Figma file.
- Roadmap decisions with product strategy implications require human product leadership.
- Cross-team negotiation on scope trade-offs produces structured arguments but cannot substitute for relationship-based influence.

### Connectors

All Developer connectors plus: Figma · Storybook · Vercel · Netlify · Cloudflare Pages

### Full Action List

Includes all 20 Developer actions plus:

| Action | Description | Risk |
|---|---|---|
| `workspace_fsd_ui_component` | Generate framework component from spec | LOW |
| `workspace_fsd_design_handoff` | Extract design tokens from Figma | LOW |
| `workspace_fsd_responsive_check` | Verify breakpoints across viewports | LOW |
| `workspace_fsd_accessibility_audit` | Axe-based WCAG accessibility scan | LOW |
| `workspace_fsd_seo_audit` | Meta tags, structured data, schema.org | LOW |
| `workspace_fsd_perf_audit` | Bundle size and Core Web Vitals | LOW |
| `workspace_fsd_state_manage` | Redux / Zustand / Pinia scaffold | LOW |
| `workspace_fsd_api_integrate` | API client and TypeScript type generation | LOW |
| `workspace_fsd_auth_implement` | OAuth / JWT / session auth scaffold | MEDIUM |
| `workspace_fsd_realtime_setup` | WebSocket / Socket.io / Supabase realtime | LOW |
| `workspace_fsd_env_setup` | .env.example and environment validation | LOW |
| `workspace_fsd_fullstack_feature` | End-to-end feature implementation | HIGH — requires approval |
| `workspace_fsd_scaffold_project` | New Next.js / Remix / SvelteKit project | LOW |
| `workspace_fsd_deploy_preview` | Vercel / Netlify preview deployment | HIGH — requires approval |
| `workspace_fsd_standup_report` | Frontend health report from episodic memory | LOW |
| `workspace_fsd_visual_review` | CSS / design critique | LOW |
| `workspace_fsd_clarify_spec` | Question unclear specs | LOW |
| `workspace_fsd_security_deep_scan` | Business logic security analysis | LOW |
| `workspace_fsd_arch_review` | Architecture decision record generation | LOW |
| `workspace_fsd_browser_debug` | Playwright-based browser debugging | LOW |
| `workspace_fsd_perf_profile` | CPU / memory profiling with Playwright | LOW |
| `workspace_fsd_negotiate` | Cross-team design and scope negotiation | HIGH — requires approval |
| `workspace_fsd_project_context_sync` | Long-term project memory persistence | LOW |
| `workspace_fsd_org_context_sync` | Organisational context awareness | LOW |
| `workspace_fsd_strategic_plan` | Long-horizon roadmap generation | LOW |
| `workspace_fsd_roadmap_tick` | Increment roadmap milestone progress | LOW |
| `workspace_fsd_roadmap_status` | Roadmap status report | LOW |
| `workspace_fsd_analytics_snapshot` | UX analytics and session replay analysis | LOW |
| `workspace_fsd_ab_test_read` | A/B test result interpretation | LOW |
| `workspace_fsd_design_score` | Aesthetic / design quality scoring | LOW |
| `workspace_fsd_design_reference` | Design reference comparison | LOW |

---

## 4. QA Tester

### Role Summary

The QA Tester agent manages the full quality assurance lifecycle — from writing and running automated tests to filing bugs, publishing test results, and performing security testing. It integrates with every major test framework and test management platform.

### Human Equivalent

- **Title:** QA Engineer, SDET (Software Development Engineer in Test), QA Lead
- **Seniority:** Mid to Senior (3–7 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Test case synchronisation | Syncs test cases to TestRail or Zephyr from code or spreadsheet |
| Test result publishing | Publishes structured execution results to test management platforms |
| Bug filing | Creates well-formed bug reports in Jira, Linear, or GitHub Issues |
| Security test reporting | Aggregates DAST and SAST findings into a consolidated report |
| Selenium execution | Runs Selenium WebDriver test suites across configured browsers |
| Cypress execution | Runs Cypress end-to-end test suites and captures screenshots |
| Playwright execution | Runs Playwright cross-browser tests with trace capture |
| Appium mobile testing | Runs Appium tests against real or simulated iOS / Android devices |
| Load testing | Runs JMeter load plans and produces throughput / latency reports |
| API testing | Runs Postman collections and validates response contracts |
| Dynamic security testing | Runs OWASP ZAP / Burp Suite DAST scans against staging environments |
| Visual regression | Detects pixel-level visual regressions between baseline and current build |
| Mutation testing | Runs mutation testing to verify test suite effectiveness |
| Contract testing | Runs consumer-driven contract tests (Pact / compatible frameworks) |
| Accessibility testing | Runs Axe scans across page flows and reports WCAG violations |
| Exploratory testing | Executes structured exploratory testing sessions with session notes |
| Mobile cloud testing | Coordinates real device testing via BrowserStack or Sauce Labs |
| Test data generation | Generates and manages test data sets and fixtures |
| Standup reporting | Daily standup with meeting join and spoken progress update |

### Where It Falls Short of a Human

- Cannot exercise intuitive exploratory instinct for finding unexpected edge cases that fall outside a defined test plan.
- Cannot substitute for a human in verifying that a product "feels right" from a usability perspective.
- Security testing depth for novel attack patterns benefits from a dedicated human penetration tester.

### Connectors

Jira · Linear · GitHub · GitLab · Slack · Microsoft Teams · Email · Jenkins · CircleCI · Selenium · Playwright · Cypress · Appium · JMeter · Postman · SoapUI · TestRail · Zephyr · BurpSuite · OWASP ZAP · Google Meet · Microsoft Teams · Zoom

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_standup_report` | Daily standup with meeting join and speak | LOW |
| `workspace_test_case_sync` | Sync tests to TestRail / Zephyr | LOW |
| `workspace_test_run_publish` | Publish test execution results | LOW |
| `workspace_create_bug` | File bug in Jira / Linear / GitHub | LOW |
| `workspace_security_test_report` | Aggregate security findings | LOW |
| `workspace_selenium_test_run` | Selenium WebDriver test execution | LOW |
| `workspace_cypress_test_run` | Cypress end-to-end test execution | LOW |
| `workspace_appium_test_run` | Appium mobile app testing | LOW |
| `workspace_playwright_test_run` | Playwright cross-browser testing | LOW |
| `workspace_load_test_run` | JMeter load and performance testing | MEDIUM |
| `workspace_api_test_run` | Postman / REST API testing | LOW |
| `workspace_dast_scan` | OWASP ZAP / Burp Suite DAST scan | MEDIUM |
| `workspace_visual_regression` | Pixel-level visual regression detection | LOW |
| `workspace_mutation_test` | Mutation testing for test quality | LOW |
| `workspace_contract_test` | Consumer-driven contract testing | LOW |
| `workspace_axe_scan` | Axe accessibility scan | LOW |
| `workspace_exploratory_session` | Structured exploratory testing | LOW |
| `workspace_mobile_test` | Real device cloud testing | MEDIUM |
| `workspace_generate_test_data` | Test data generation and management | LOW |

### Notable Features

- **Sub-agent spawning:** Can delegate mobile-specific test execution to a Mobile Engineer agent.
- **Meeting integration:** Can join a standup, unmute, and deliver a spoken progress update.
- **Security-native:** DAST scanning and security report aggregation are first-class actions, not add-ons.
- **Quality of quality:** Mutation testing verifies that the test suite itself is effective at catching defects.

---

## 5. Technical Writer

### Role Summary

The Technical Writer agent produces, maintains, and audits technical documentation. It covers API references, tutorials, user manuals, release notes, whitepapers, onboarding guides, and documentation site structure. It can crawl a live product to discover undocumented features and verify that documented steps actually work.

### Human Equivalent

- **Title:** Technical Writer, Senior Technical Writer, Documentation Engineer
- **Seniority:** Mid to Senior (3–8 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| API documentation | Generates complete API references from OpenAPI specs or JSDoc / docstrings |
| Release notes | Generates structured release notes from git log and PR titles |
| Style checking | Validates grammar, readability, and style guide compliance |
| SME interviewing | Structures and conducts subject matter expert interviews |
| Sprint documentation | Documents sprint outcomes, decisions, and technical context |
| User manual authoring | Writes task-oriented user manuals for end-user audiences |
| FAQ generation | Synthesises FAQs from support ticket clusters |
| Tutorial writing | Produces numbered step-by-step tutorials with code examples |
| Onboarding documentation | Writes developer or user onboarding guides |
| Whitepaper authoring | Writes technical whitepapers with structured argument and evidence |
| Endpoint verification | Calls documented API endpoints to verify they behave as documented |
| Audience rewriting | Rewrites the same content at beginner, intermediate, or expert level |
| Feedback analysis | Synthesises reader feedback into documentation improvement recommendations |
| Navigation audit | Audits documentation site navigation structure against best practices |
| Localisation preparation | Prepares content for translation by flagging untranslatable constructs |
| Documentation audit | Produces a completeness and accuracy audit of the full doc set |
| Product crawl | Crawls a live product UI to discover features that have no documentation |
| Screenshot documentation | Captures and annotates product screenshots for visual documentation |
| Gap scanning | Identifies documentation gaps by comparing feature list to existing docs |
| Step verification | Runs documented tutorial steps against the actual product and reports failures |
| Authenticated interaction | Logs into a product with credentials to document authenticated workflows |
| Review cycle | Manages the documentation review cycle with approvers |
| Documentation indexing | Builds a structured mental model of the entire documentation set |
| Strategic planning | Generates a long-range documentation roadmap aligned with the product roadmap |
| Doc diffing | Highlights what documentation needs updating after a code change |

### Where It Falls Short of a Human

- Deep technical authorship of complex architectural concepts benefits from a writer with engineering background and direct system access.
- Writing style voice and brand voice for high-profile external communications may require human editorial approval.
- Deciding which features are important enough to document requires product judgment a human writer typically has from team context.

### Connectors

GitHub · GitLab · Confluence · Google Drive · Slack

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_tw_doc_diff` | Highlight documentation changes needed after a code change | LOW |
| `workspace_tw_api_doc_openapi` | Generate API docs from OpenAPI spec | LOW |
| `workspace_tw_api_doc_code` | Extract API docs from JSDoc / docstrings | LOW |
| `workspace_tw_release_notes` | Generate release notes from git log | LOW |
| `workspace_tw_style_check` | Grammar and style validation | LOW |
| `workspace_tw_standup_report` | Documentation progress standup | LOW |
| `workspace_tw_sme_interview` | Structure and conduct SME interviews | LOW |
| `workspace_tw_sprint_doc` | Sprint summary documentation | LOW |
| `workspace_tw_manual` | User manual authoring | LOW |
| `workspace_tw_faq` | FAQ generation from support tickets | LOW |
| `workspace_tw_tutorial` | Step-by-step tutorial generation | LOW |
| `workspace_tw_onboarding` | Onboarding documentation | LOW |
| `workspace_tw_whitepaper` | Technical whitepaper authoring | LOW |
| `workspace_tw_endpoint_verify` | Verify API endpoint documentation accuracy | LOW |
| `workspace_tw_audience_rewrite` | Rewrite for different audience levels | LOW |
| `workspace_tw_feedback_analysis` | Analyse reader feedback | LOW |
| `workspace_tw_nav_audit` | Audit documentation site navigation | LOW |
| `workspace_tw_localization` | Prepare docs for localisation | LOW |
| `workspace_tw_doc_audit` | Full documentation completeness audit | LOW |
| `workspace_tw_product_crawl` | Crawl product UI for undocumented features | LOW |
| `workspace_tw_screenshot_doc` | Generate docs with product screenshots | LOW |
| `workspace_tw_doc_gap_scan` | Identify documentation gaps | LOW |
| `workspace_tw_verify_doc_steps` | Verify tutorial steps work in the live product | LOW |
| `workspace_tw_interact_product` | Authenticated product interaction for docs | LOW |
| `workspace_tw_pr_review_respond` | Manage documentation review cycle | LOW |
| `workspace_tw_doc_index` | Build mental model of the full doc set | LOW |
| `workspace_tw_roadmap_context` | Long-range strategic documentation planning | LOW |

---

## 6. Content Writer

### Role Summary

The Content Writer agent handles blog posts, articles, CMS publishing, SEO optimisation, tone adaptation, and content analytics. It operates as a full editorial production pipeline — from research and drafting through fact-checking, plagiarism detection, and final CMS publication.

### Human Equivalent

- **Title:** Content Writer, Copywriter, Content Strategist, Blog Editor
- **Seniority:** Mid-level (2–6 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Research and outlining | Researches a topic and produces a structured outline before drafting |
| Prose drafting | Writes a complete article or blog post from a brief |
| SEO optimisation | Integrates keywords, optimises meta descriptions, and adjusts for search intent |
| CMS publishing | Publishes directly to WordPress, Contentful, or HubSpot CMS |
| Draft promotion | Promotes a draft to published status on approval |
| Scheduled publication | Schedules content to publish at a specified future date and time |
| Tone adaptation | Rewrites content for formal, conversational, technical, or persuasive registers |
| Image sourcing | Finds and licences appropriate images for content |
| Social scheduling | Schedules social media posts to promote published content |
| Fact-checking | Verifies factual claims against source material |
| Revision applying | Applies editorial feedback to a draft |
| Brand voice learning | Learns brand voice from example content and applies it to new drafts |
| Plagiarism detection | Runs plagiarism checks using Copyscape or equivalent |
| Self-review | Reviews its own output before submission to reduce back-and-forth |
| Localisation | Adapts content for regional language variants and cultural context |
| Content analytics | Pulls performance data from Google Analytics or Mixpanel |
| Editorial routing | Routes content to the right editor for a defined review step |
| Workflow execution | Runs a full end-to-end editorial workflow from brief to publication |

### Where It Falls Short of a Human

- Long-form investigative or narrative journalism requires human research depth and source relationships.
- Brand-defining content (mission statements, investor letters) requires human creative direction.
- Novel content formats or creative experiments benefit from human editorial judgment.

### Connectors

Google Drive · Slack · Microsoft Teams · Gmail · WordPress · Contentful · HubSpot CMS · Google Calendar · Google Analytics · DataForSEO · Copyscape · DeepL · Mixpanel

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_cw_research_topic` | Background research and outline generation | LOW |
| `workspace_cw_write_prose` | Draft content from brief | LOW |
| `workspace_cw_seo_optimize` | SEO optimisation and keyword integration | LOW |
| `workspace_cw_publish_cms` | Publish to CMS | MEDIUM |
| `workspace_cw_promote_draft` | Promote draft to published | MEDIUM |
| `workspace_cw_scheduled_publish` | Schedule future publication | LOW |
| `workspace_cw_adapt_tone` | Rewrite for different tones | LOW |
| `workspace_cw_source_images` | Find and licence images | LOW |
| `workspace_cw_schedule_content` | Schedule social media promotion | LOW |
| `workspace_cw_fact_check` | Verify factual claims | LOW |
| `workspace_cw_revision_apply` | Apply editorial feedback | LOW |
| `workspace_cw_brand_voice_learn` | Learn and apply brand voice | LOW |
| `workspace_cw_verify_facts` | Secondary fact verification pass | LOW |
| `workspace_cw_review_prose` | Self-review before publication | LOW |
| `workspace_cw_detect_plagiarism` | Plagiarism detection | LOW |
| `workspace_cw_clarify_brief` | Ask clarifying questions about the brief | LOW |
| `workspace_cw_localize_content` | Adapt content for regions | LOW |
| `workspace_cw_analytics_report` | Content performance analytics | LOW |
| `workspace_cw_send_for_review` | Route to editor | LOW |
| `workspace_cw_run_workflow` | Execute full editorial workflow | LOW |

---

## 7. Marketing Specialist

### Role Summary

The Marketing Specialist agent manages campaign planning, PPC optimisation, audience segmentation, competitor analysis, email sequence creation, social scheduling, and KPI reporting. It works across paid, owned, and earned channels.

### Human Equivalent

- **Title:** Marketing Manager, Performance Marketer, Growth Marketer, Campaign Manager
- **Seniority:** Mid to Senior (3–8 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Campaign strategy | Produces campaign strategy documents with channel mix, timeline, and budget allocation |
| Campaign monitoring | Real-time monitoring of active campaigns with alerting on anomalies |
| PPC optimisation | Bid strategy recommendations, A/B test design, and keyword performance tuning |
| Audience segmentation | Segmentation strategy from first-party and third-party data |
| Competitor analysis | Competitive benchmarking against tracked competitor set |
| Keyword research | SEO keyword research with volume, difficulty, and opportunity scoring |
| Email sequence writing | Multi-touch nurture sequences for defined audience segments |
| Social scheduling | Content calendar creation and scheduling across channels |
| KPI reporting | Structured KPI dashboards from GA4, Google Ads, Meta, LinkedIn |
| A/B test analysis | Statistical significance analysis of experiment results |
| Market research | Market sizing, opportunity mapping, and TAM/SAM/SOM estimation |
| Conversion optimisation | Funnel analysis and conversion rate optimisation recommendations |
| Asset coordination | Creative asset briefing, tracking, and approval coordination |
| Cross-team alignment | Campaign alignment brief shared with Product, Sales, and Content |
| Workflow orchestration | Full campaign execution workflow from brief to live |
| Human escalation | Escalates high-spend or high-risk decisions to operator for approval |

### Where It Falls Short of a Human

- Creative direction and brand positioning requires human creative leadership.
- High-stakes budget commitments require human approval (built into the escalation flow).
- Influencer relationship management and partnership negotiations require human involvement.

### Connectors

Google Analytics · Google Ads · Meta Ads · LinkedIn Ads · HubSpot · Mailchimp · Semrush · Hootsuite · Google Drive · Slack · Microsoft Teams · Gmail

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_ms_plan_campaign` | Campaign strategy and timeline | LOW |
| `workspace_ms_monitor_campaign` | Real-time campaign monitoring | LOW |
| `workspace_ms_optimize_ppc` | PPC bid optimisation and A/B testing | MEDIUM |
| `workspace_ms_segment_audience` | Audience segmentation strategy | LOW |
| `workspace_ms_analyze_competitor` | Competitor analysis and benchmarking | LOW |
| `workspace_ms_keyword_research` | SEO keyword research | LOW |
| `workspace_ms_build_email_sequence` | Email nurture sequence generation | LOW |
| `workspace_ms_schedule_social` | Social media posting schedule | LOW |
| `workspace_ms_generate_kpi_report` | KPI reporting and analytics | LOW |
| `workspace_ms_analyze_ab_test` | A/B test statistical analysis | LOW |
| `workspace_ms_market_research` | Market sizing and opportunity analysis | LOW |
| `workspace_ms_optimize_conversion` | Funnel optimisation recommendations | LOW |
| `workspace_ms_coordinate_assets` | Creative asset coordination | LOW |
| `workspace_ms_align_cross_team` | Cross-team campaign alignment | LOW |
| `workspace_ms_run_campaign_workflow` | Full campaign execution workflow | MEDIUM |
| `workspace_ms_request_human_gate` | Escalate high-spend decisions | HIGH — requires approval |

---

## 8. Sales Representative

### Role Summary

The Sales Representative agent manages the full B2B sales pipeline — from prospect research and outreach through demo delivery, negotiation, and contract execution. It also handles post-close activities including upsell identification, NPS surveys, and quarterly business reviews.

### Human Equivalent

- **Title:** Account Executive, Business Development Representative, Sales Manager
- **Seniority:** Mid to Senior (3–8 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Prospect research | Deep prospect profile including company context, technographics, and trigger events |
| ICP scoring | Scores leads against defined Ideal Customer Profile criteria |
| Personalised outreach | Drafts hyper-personalised outreach emails using LLM and Apollo data |
| Outreach execution | Sends outreach via email or LinkedIn with tracking |
| Sequence creation | Multi-touch cadence design across email, LinkedIn, and phone |
| Reply classification | Classifies reply sentiment (positive / neutral / objection / unsubscribe) |
| Pre-meeting research | Produces a briefing document before every discovery or demo call |
| Meeting booking | Books meetings and sends calendar invitations |
| Contract transmission | Sends contracts and manages eSignature workflow |
| Deal closure | Records deal won or lost with outcome data in CRM |
| Referral management | Logs referral sources and requests referrals from satisfied customers |
| LinkedIn outreach | Native LinkedIn connection and message workflow |
| Cold calling | Generates cold call scripts with objection responses and call logging |
| Market research | Market size, ICP definition, and competitor positioning |
| Demo scripting | Generates product demo scripts tailored to the prospect's use case |
| Demo delivery | Presents a demo walkthrough with speaker notes |
| Sales deck generation | Produces a tailored sales slide deck |
| Demo follow-up | Sends post-demo follow-up with next steps |
| Negotiation support | Evaluates pricing scenarios and generates negotiation scripts |
| Proposal writing | Produces custom proposal documents aligned to prospect requirements |
| Upsell identification | Identifies expansion opportunities in existing customer base |
| NPS distribution | Sends NPS surveys to customers at defined milestones |
| QBR preparation | Prepares Quarterly Business Review materials |
| Contract generation | Drafts contract content from deal parameters |
| Objection handling | Generates objection-specific rebuttal scripts |

### Where It Falls Short of a Human

- Cannot build genuine human trust and rapport — the final close relationship is human.
- Complex deal negotiations with multiple stakeholders benefit from human presence.
- Strategic account management for key accounts requires human relationship investment.

### Connectors

HubSpot · Salesforce · Apollo · Hunter · LinkedIn · Gmail · Microsoft Teams · Slack · Jira · Linear · Zoom · Google Meet · Google Calendar · Outlook Calendar · SendGrid · Mailgun · SMTP · Twilio

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_prospect_research` | Lead research and profiling | LOW |
| `workspace_icp_score` | Ideal Customer Profile scoring | LOW |
| `workspace_email_personalize` | Personalised outreach email generation | LOW |
| `workspace_outreach_send` | Send outreach via email or LinkedIn | MEDIUM |
| `workspace_sequence_create` | Multi-touch sequence planning | LOW |
| `workspace_reply_classify` | Reply sentiment and intent classification | LOW |
| `workspace_pre_meeting_research` | Pre-call research and briefing | LOW |
| `workspace_booking_invite` | Meeting booking and invitation | LOW |
| `workspace_contract_send` | Contract transmission and eSignature | MEDIUM |
| `workspace_deal_close` | Record deal won / lost | LOW |
| `workspace_referral_log` | Log referral source | LOW |
| `workspace_referral_request` | Request referrals from customers | LOW |
| `workspace_linkedin_outreach` | LinkedIn-native outreach | MEDIUM |
| `workspace_cold_call` | Cold calling script and logging | LOW |
| `workspace_market_research` | Market sizing and competitor research | LOW |
| `workspace_demo_script_generate` | Product demo script generation | LOW |
| `workspace_demo_present` | Present demo to prospect | LOW |
| `workspace_slide_deck_generate` | Sales slide deck generation | LOW |
| `workspace_demo_followup` | Post-demo follow-up | LOW |
| `workspace_negotiation_offer` | Offer negotiation support | MEDIUM |
| `workspace_proposal_generate` | Custom proposal generation | LOW |
| `workspace_upsell` | Upsell opportunity identification | LOW |
| `workspace_nps_send` | NPS survey distribution | LOW |
| `workspace_qbr_prepare` | Quarterly Business Review preparation | LOW |
| `workspace_contract_generate` | Contract content generation | LOW |
| `workspace_objection_rebuttal` | Objection handling scripts | LOW |

---

## 9. Corporate Assistant

### Role Summary

The Corporate Assistant agent manages executive administrative work — email drafting and sending, calendar scheduling, document creation, message routing, and human escalation. It acts as a virtual executive assistant with full access to calendar and communication tools.

### Human Equivalent

- **Title:** Executive Assistant, Administrative Coordinator, Office Manager
- **Seniority:** Mid-level (2–5 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Email drafting | Drafts professional emails from a brief with appropriate tone and disclosure statements |
| Email sending | Sends email via Gmail, Outlook, or SMTP (external sends are approval-gated) |
| Email classification | Classifies and prioritises incoming email by urgency and type |
| Calendar availability | Checks availability across Google or Outlook calendar |
| Meeting scheduling | Schedules meetings with appropriate invitations and agendas |
| Meeting cancellation | Cancels or reschedules meetings with apology notes |
| Document creation | Creates Google Docs from a template or brief |
| Document updating | Updates existing documents with new information |
| Escalation | Routes unresolved issues to the appropriate human decision-maker |
| Message sending | Sends Slack or Teams messages on behalf of the executive |

### Where It Falls Short of a Human

- Cannot exercise the discretion of an experienced EA who knows the executive's preferences, personality, and political context from years of working together.
- All outbound communications to external parties are approval-gated by design.
- Cannot attend physical meetings or manage physical logistics.

### Connectors

Gmail · Outlook · SMTP · Google Calendar · Outlook Calendar · Google Drive · Confluence · Slack · Microsoft Teams · Google Meet · Zoom

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_ca_email_compose` | Draft email | LOW |
| `workspace_ca_email_send` | Send email | HIGH if external — requires approval |
| `workspace_ca_email_classify` | Classify and prioritise email | LOW |
| `workspace_ca_calendar_check` | Check calendar availability | LOW |
| `workspace_ca_calendar_schedule` | Schedule meeting | LOW |
| `workspace_ca_calendar_cancel` | Cancel or reschedule meeting | MEDIUM |
| `workspace_ca_document_create` | Create document in Google Docs | LOW |
| `workspace_ca_document_update` | Update existing document | LOW |
| `workspace_ca_escalate` | Escalate issue to human | LOW |
| `workspace_ca_message_send` | Send Slack or Teams message | MEDIUM |

### Notable Features

- **Disclosure statements:** All outbound emails automatically append a disclosure statement identifying the message as AI-generated.
- **Approval on external sends:** Any email to an address outside the organisation's domain requires human confirmation before sending.

---

## 10. Customer Support Executive

### Role Summary

The Customer Support Executive agent handles omnichannel customer support — tickets, live chat, voice calls, order modifications, refunds, CRM updates, and SLA monitoring. It operates across Zendesk, Intercom, Freshdesk, and ServiceNow, and can handle voice calls with speech-to-text and text-to-speech.

### Human Equivalent

- **Title:** Customer Support Specialist, Support Team Lead, Help Desk Analyst
- **Seniority:** Mid-level (2–6 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Ticket lifecycle | Opens, updates, closes, merges, and assigns support tickets |
| Reply drafting | Drafts contextually appropriate customer replies with empathy cues |
| Reply sending | Sends replies across email, Slack, Teams, Discord, or live chat |
| Follow-up scheduling | Schedules follow-up messages for open cases |
| Outbound call logging | Logs outbound support calls with outcome notes |
| Knowledge base search | Searches the knowledge base to find answers before composing a reply |
| KB article creation | Creates new knowledge base articles from resolved case patterns |
| Issue diagnosis | Diagnoses customer issues by querying order / account / billing systems |
| Escalation | Escalates to a senior support agent with full case context |
| De-escalation | Handles angry or distressed customers with de-escalation scripts |
| Refund processing | Processes refunds via Stripe, Braintree, or Shopify |
| Order modification | Modifies customer orders via e-commerce platform APIs |
| CSAT surveys | Sends customer satisfaction surveys after case closure |
| NPS surveys | Sends NPS surveys at defined lifecycle milestones |
| CRM updates | Updates customer record in CRM with case outcome |
| Case documentation | Documents case resolution for team knowledge sharing |
| KPI reporting | Produces support KPI dashboards (CSAT, FRT, resolution time) |
| Trend analysis | Identifies recurring issue patterns from ticket volume data |
| Standup reporting | Daily support team standup report |
| Live chat handling | Real-time live chat session management |
| SLA monitoring | Monitors ticket SLA compliance and alerts on breaches |
| Voice call handling | Handles voice calls with STT / TTS via Sarvam AI or Deepgram |
| Call transcription | Transcribes voice call recordings for case records |

### Where It Falls Short of a Human

- Highly emotionally complex situations (bereavement, serious complaints) benefit from human empathy and judgment beyond scripted de-escalation.
- Policy exceptions that fall outside defined rules require human approval.
- Relationship-based enterprise support for strategic accounts benefits from a named human CSM.

### Connectors

Zendesk · Intercom · Freshdesk · Freshservice · ServiceNow · HappyFox · Salesforce · HubSpot · Zoho CRM · Microsoft Dynamics · Gmail · Outlook · Exchange · Slack · Microsoft Teams · Discord · Google Chat · Stripe · Braintree · Shopify · WooCommerce · Twilio · Vonage · Amazon Connect · Sarvam AI · Deepgram

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_cse_ticket_open` | Create support ticket | LOW |
| `workspace_cse_ticket_update` | Update ticket status and notes | LOW |
| `workspace_cse_ticket_close` | Close resolved ticket | LOW |
| `workspace_cse_ticket_merge` | Merge duplicate tickets | LOW |
| `workspace_cse_ticket_assign` | Assign to support agent | LOW |
| `workspace_cse_reply_compose` | Draft customer reply | LOW |
| `workspace_cse_reply_send` | Send customer reply | MEDIUM |
| `workspace_cse_reply_followup` | Schedule follow-up | LOW |
| `workspace_cse_outbound_call_log` | Log outbound call | LOW |
| `workspace_cse_kb_search` | Search knowledge base | LOW |
| `workspace_cse_kb_create_article` | Create KB article | LOW |
| `workspace_cse_issue_diagnose` | Diagnose customer issue | LOW |
| `workspace_cse_escalate` | Escalate to senior support | LOW |
| `workspace_cse_deescalate` | De-escalate difficult customer | LOW |
| `workspace_cse_refund_process` | Process refund | HIGH — requires approval |
| `workspace_cse_order_modify` | Modify customer order | HIGH — requires approval |
| `workspace_cse_csat_send` | Send CSAT survey | LOW |
| `workspace_cse_nps_send` | Send NPS survey | LOW |
| `workspace_cse_crm_update` | Update CRM with case info | LOW |
| `workspace_cse_case_document` | Document case resolution | LOW |
| `workspace_cse_kpi_report` | Support KPI reporting | LOW |
| `workspace_cse_trend_analysis` | Ticket trend analysis | LOW |
| `workspace_cse_standup_report` | Daily support standup | LOW |
| `workspace_cse_live_chat_handle` | Live chat session management | LOW |
| `workspace_cse_sla_check` | SLA compliance monitoring | LOW |
| `workspace_cse_voice_call_handle` | Voice call with STT / TTS | MEDIUM |
| `workspace_cse_voice_transcribe` | Transcribe voice call recording | LOW |

### Notable Features

- **Voice-capable:** Full voice call handling via Sarvam AI (STT + TTS), with call transcription for audit purposes.
- **Omnichannel by design:** A single agent instance can manage email, live chat, Slack, Teams, Discord, and voice in parallel.
- **Financial operations:** Refund and order modification actions are approval-gated to prevent unauthorised financial operations.

---

## 11. DevOps Engineer

### Role Summary

The DevOps Engineer agent is the most action-rich agent on the platform (69+ actions). It covers the full infrastructure lifecycle: Terraform IaC, Kubernetes cluster management, Docker image builds, CI/CD pipeline management, cloud CLI operations (AWS, Azure, GCP), observability configuration, security compliance scanning, cost optimisation, and incident management. It also includes advanced capabilities like chaos engineering, MLOps, and multi-cluster fleet management.

### Human Equivalent

- **Title:** DevOps Engineer, Site Reliability Engineer, Platform Engineer, Cloud Architect
- **Seniority:** Senior to Staff (6–12 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Terraform planning | Runs `terraform plan` and surfaces change diffs for review |
| Terraform apply | Applies infrastructure changes (HIGH-RISK, approval-gated) |
| Terraform validation | Validates HCL syntax before plan execution |
| Terraform code generation | Generates Terraform modules for common infrastructure patterns |
| Kubernetes deployment | Deploys workloads to K8s clusters (HIGH-RISK, approval-gated) |
| Kubernetes rollback | Rolls back a failed K8s deployment |
| Kubernetes status | Queries cluster, deployment, and pod status |
| Pod log retrieval | Retrieves pod logs with filtering |
| K8s manifest generation | Generates Deployment, Service, ConfigMap, HPA, and other manifests |
| Docker build | Builds Docker images with multi-stage Dockerfiles |
| Docker push | Pushes images to Docker Hub, ECR, GCR, ACR, or GHCR |
| Pipeline triggering | Triggers CI/CD pipelines (approval-gated) |
| Pipeline status | Monitors pipeline execution status |
| Incident triage | Runs a structured incident triage workflow with alert correlation |
| AWS CLI | Executes AWS CLI commands for EC2, S3, IAM, EKS, RDS, and more |
| Azure CLI | Executes Azure CLI commands for AKS, ACR, App Service, and more |
| GCP gcloud | Executes gcloud commands for GKE, Cloud Run, GCS, and more |
| Helm install | Installs Helm charts (HIGH-RISK, approval-gated) |
| Helm rollback | Rolls back a Helm release |
| DORA metrics | Generates deployment frequency, change failure rate, MTTR, and lead time reports |
| Post-deploy verification | Verifies application health after deployment |
| Environment promotion | Promotes a build through dev → staging → production |
| Release notes | Generates structured release notes from deployment metadata |
| Container security scanning | Scans container images for CVEs |
| Pipeline generation | Generates CI/CD pipeline definitions for GitHub Actions, GitLab CI, Jenkins |
| Cloud cost estimation | Estimates monthly cloud costs from IaC configuration |
| IaC drift detection | Detects configuration drift between IaC state and actual infrastructure |
| Secret rotation | Rotates secrets in Vault or AWS Secrets Manager (HIGH-RISK) |
| Certificate renewal | Renews TLS certificates (HIGH-RISK) |
| Terraform state management | Manages Terraform state imports, moves, and removals |
| K8s RBAC configuration | Configures Kubernetes Role-Based Access Control |
| Grafana dashboards | Creates and updates Grafana monitoring dashboards |
| Alert rule configuration | Configures alerting rules in Prometheus, Datadog, or CloudWatch |
| Blue-green deployment | Executes blue-green deployment strategy (HIGH-RISK) |
| Canary deployment | Executes canary rollout strategy (HIGH-RISK) |
| ArgoCD GitOps sync | Triggers ArgoCD sync (HIGH-RISK) |
| K8s autoscaling | Configures HPA and VPA for workloads |
| Pod exec | Executes shell commands in a running pod |
| DNS management | Manages DNS records (HIGH-RISK) |
| Load balancer configuration | Configures load balancer rules (HIGH-RISK) |
| Service mesh | Configures Istio or Linkerd service mesh policies |
| SLO management | Configures SLOs and error budget policies |
| Compliance scanning | Runs CIS benchmark scans against cluster configuration |
| Container registry hygiene | Prunes stale images from container registries |
| Load testing | Runs load tests against production or staging endpoints |
| Live metrics querying | Queries live metrics from Prometheus or Datadog |
| Database administration | Manages RDS, Cloud SQL, or self-hosted database operations |
| FinOps | Cloud cost optimisation analysis and rightsizing recommendations |
| Multi-cluster fleet management | Manages multiple K8s clusters as a fleet |
| Windows server administration | Manages Windows Server infrastructure |
| Chaos engineering | Executes chaos experiments with Chaos Monkey or Litmus |
| MLOps pipeline management | Manages ML training pipelines in Kubeflow or SageMaker |
| Incident containment | Executes incident containment actions (traffic shifting, scaling) |
| Interactive debug session | Runs an interactive infrastructure debug session |
| Runbook execution | Executes defined runbooks automatically |
| Network diagnostics | Runs network connectivity and latency diagnostics |
| Port forwarding / SSH tunnels | Opens port-forward or SSH tunnel to remote service |
| Prometheus management | Manages Prometheus scrape configs and rule files |
| Vault dynamic secrets | Requests dynamic credentials from Vault |
| Argo Workflows | Executes Argo Workflows for batch and pipeline jobs |
| Backstage catalog | Manages Backstage software catalog entries |
| Slack incident channels | Creates and manages Slack incident channels with runbook links |
| Scheduled monitoring | Sets up scheduled health checks for services |
| Incident context filtering | Filters and correlates alert noise during incidents |
| AWS org bootstrap | Bootstraps a new AWS organisation with baseline guardrails |
| GitHub org bootstrap | Bootstraps a GitHub organisation with standard team structure |
| K8s cluster bootstrap | Bootstraps a new Kubernetes cluster with standard tooling |
| Standup reporting | Infrastructure standup from episodic memory |
| Human handoff | Escalates to a human with full incident dashboard context |

### Where It Falls Short of a Human

- Novel cloud provider quirks or undocumented API behaviours may require a human engineer with platform-specific expertise.
- Architectural decisions about major infrastructure redesigns benefit from human principal engineer judgment.
- All destructive or irreversible actions (terraform apply, K8s deploy, DNS changes, secret rotation) require explicit human approval before execution.

### Connectors

GitHub · GitLab · Bitbucket · Azure DevOps · Jenkins · CircleCI · GitHub Actions · GitLab CI · Azure Pipelines · Tekton · ArgoCD · Docker Hub · ECR · GCR · ACR · GHCR · AWS · Azure · GCP · Terraform Cloud · Rancher · Datadog · Grafana · Prometheus · Sentry · New Relic · CloudWatch · Vault · AWS Secrets Manager · Confluence · Notion · Slack · PagerDuty

### Selected High-Risk Actions Requiring Approval

`workspace_devops_tf_apply` · `workspace_devops_k8s_deploy` · `workspace_devops_k8s_rollback` · `workspace_devops_pipeline_trigger` · `workspace_devops_helm_install` · `workspace_devops_helm_rollback` · `workspace_devops_secret_rotate` · `workspace_devops_cert_renew` · `workspace_devops_blue_green` · `workspace_devops_canary` · `workspace_devops_argocd` · `workspace_devops_dns` · `workspace_devops_lb`

---

## 12. Business Analyst

### Role Summary

The Business Analyst agent captures requirements, drafts business requirements documents, produces process maps, performs gap and impact analysis, evaluates solution options, and manages the full requirements lifecycle including stakeholder communication and UAT test plan generation.

### Human Equivalent

- **Title:** Business Analyst, Senior Business Analyst, Solutions Analyst
- **Seniority:** Mid to Senior (3–8 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| BRD drafting | Drafts full Business Requirements Documents with completeness scoring |
| User story drafting | Writes structured user stories with acceptance criteria |
| BRD finalisation | Incorporates stakeholder feedback to produce a finalised BRD |
| Acceptance criteria finalisation | Finalises AC based on stakeholder input and business rules |
| Process mapping | Produces swimlane process flow diagrams |
| Gap analysis | Compares current state to future state and documents gaps |
| Impact analysis | Assesses change impact across systems, teams, and processes |
| Solution evaluation | Scores and ranks solution options against defined criteria |
| Stakeholder communication | Drafts stakeholder update communications with tone adaptation |
| UAT checklist | Generates UAT test plans from requirements |
| Requirements elicitation | Structures and conducts SME interviews to capture requirements |
| Proactive AC checking | Scans the knowledge base for incomplete or ambiguous acceptance criteria |
| Proactive epic checking | Scans epics for completeness against the Definition of Ready |
| Conflict detection | Detects conflicting requirements across the requirements set |
| Requirements traceability matrix | Generates an RTM linking requirements to test cases and business rules |
| External sharing | Shares specifications with external stakeholders |

### Where It Falls Short of a Human

- Ambiguous or politically sensitive stakeholder situations benefit from human BA relationship management.
- Strategic business decisions (build vs. buy, scope trade-offs) require human accountable decision-making.
- Novel regulatory domains benefit from specialist human expertise for compliance requirements.

### Connectors

Confluence · Google Drive · Slack · Jira · Linear

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_ba_draft_brd` | Draft Business Requirements Document | LOW |
| `workspace_ba_draft_user_story` | Draft user story | LOW |
| `workspace_ba_finalize_brd` | Finalise BRD with stakeholder input | LOW |
| `workspace_ba_finalize_acceptance_criteria` | Finalise acceptance criteria | LOW |
| `workspace_ba_process_map` | Process flow / swimlane diagram | LOW |
| `workspace_ba_gap_analysis` | Current vs. future state analysis | LOW |
| `workspace_ba_impact_analysis` | Change impact assessment | LOW |
| `workspace_ba_solution_eval` | Solution option evaluation | LOW |
| `workspace_ba_stakeholder_update` | Stakeholder communication | LOW |
| `workspace_ba_uat_checklist` | UAT test plan generation | LOW |
| `workspace_ba_elicit_requirements` | SME interview and requirements capture | LOW |
| `workspace_ba_proactive_ac_check` | Proactive acceptance criteria scan | LOW |
| `workspace_ba_proactive_epic_check` | Proactive epic completeness check | LOW |
| `workspace_ba_proactive_conflict_scan` | Detect requirement conflicts | LOW |
| `workspace_ba_rtm_generate` | Requirements traceability matrix | LOW |
| `share_spec_external` | Share specification with stakeholders | MEDIUM |

### Notable Features

- **RAG-enabled:** Uses prior BRDs, compliance checklists, and BA lessons as retrieval context for every document it generates.
- **Completeness scoring:** BRD-family documents are scored for completeness before being delivered.
- **Tone adaptation:** Stakeholder communications are rewritten to match the persona of the recipient (technical, executive, operational).
- **Proactive monitoring:** Continuously scans the knowledge base for incomplete acceptance criteria, epic gaps, and requirement conflicts without being explicitly asked.
- **Episodic memory:** Captures and learns from patterns and lessons discovered during previous BA engagements.

---

## 13. Project Manager / Scrum Master

### Role Summary

The Project Manager agent covers both the project governance (what, when, budget, risk) and Scrum Master (how, ceremonies, impediments) personas. It can produce project charters, risk registers, status reports, sprint plans, velocity reports, and retrospectives — and can directly hand off tasks to Developer and Tester agents.

### Human Equivalent

- **Title:** Project Manager, Scrum Master, Agile Coach, Delivery Manager
- **Seniority:** Mid to Senior (4–9 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| Project charter | Scope, budget, timeline, stakeholder register, and governance structure |
| Status reporting | Structured stakeholder status reports with RAG status indicators |
| Risk register | Creates and updates a risk register with likelihood, impact, and mitigation |
| Dependency mapping | Cross-team dependency identification and visualisation |
| Change requests | Formal change request documentation with approval routing |
| Milestone planning | Milestone plan with critical path identification |
| Budget forecasting | Resource and budget forecast with variance tracking |
| Sprint planning | Sprint goal, sprint plan, and capacity allocation from the backlog |
| Backlog grooming | Backlog refinement with Definition of Ready compliance checking |
| Velocity reporting | Velocity trending and delivery date forecasting |
| Standup summaries | Daily standup report from episodic memory |
| Retrospectives | Sprint retrospective with structured action items |
| Impediment logging | Blocker identification, logging, and escalation |
| Ceremony facilitation | Facilitation guide for sprint planning, review, retro, and refinement |
| Proactive blocker scan | Scans the knowledge base for unresolved blockers |
| Scope drift detection | Detects scope creep and alerts the team |
| Standup scheduling | Sets up recurring standup schedule with automated reminders |
| Developer handoff | Hands off a task to the Developer agent with full context |
| Tester handoff | Hands off a task to the Tester agent with full context |
| Handoff status | Checks the status of a delegated task |
| Delivery forecasting | Monte Carlo or burn-down based delivery date forecast |
| Sprint health check | Comprehensive sprint health analysis |
| Board sync | Pulls live board status from Jira / Linear / Asana |

### Where It Falls Short of a Human

- Cannot substitute for a Scrum Master in facilitating a complex team dysfunctional situation — human coaching judgment is essential.
- Strategic portfolio decisions (what to build next quarter) require human product leadership.
- Executive stakeholder management at C-suite level benefits from human PM relationship skills.

### Connectors

Jira · Linear · Asana · Trello · ClickUp · Confluence · Notion · Slack · Microsoft Teams · Outlook · Gmail · GitHub · GitLab · Google Calendar · Outlook Calendar · Google Meet · Zoom

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_pm_project_charter` | Project charter generation | HIGH — requires approval |
| `workspace_pm_status_report` | Stakeholder status report | LOW |
| `workspace_pm_risk_register` | Risk register creation / update | LOW |
| `workspace_pm_dependency_map` | Cross-team dependency mapping | LOW |
| `workspace_pm_change_request` | Formal change request and approval | HIGH — requires approval |
| `workspace_pm_milestone_plan` | Milestone planning and timeline | LOW |
| `workspace_pm_budget_forecast` | Budget and resource forecast | HIGH — requires approval |
| `workspace_pm_sprint_plan` | Sprint planning from backlog | LOW |
| `workspace_pm_backlog_groom` | Backlog refinement and DoR compliance | LOW |
| `workspace_pm_velocity_report` | Velocity trending and forecasting | LOW |
| `workspace_pm_standup_summary` | Daily standup report | LOW |
| `workspace_pm_retrospective` | Sprint retrospective and action items | LOW |
| `workspace_pm_impediment_log` | Blocker logging and escalation | LOW |
| `workspace_pm_ceremony_agenda` | Ceremony facilitation guide | LOW |
| `workspace_pm_proactive_blocker_scan` | Proactive blocker detection | LOW |
| `workspace_pm_proactive_scope_drift` | Scope creep detection | LOW |
| `workspace_pm_schedule_standup` | Recurring standup setup | LOW |
| `workspace_pm_handoff_to_developer` | Hand off task to Developer agent | LOW |
| `workspace_pm_handoff_to_tester` | Hand off task to Tester agent | LOW |
| `workspace_pm_check_handoff_status` | Check handoff progress | LOW |
| `workspace_pm_delivery_forecast` | Delivery date forecast | LOW |
| `workspace_pm_sprint_health_check` | Sprint health analysis | LOW |
| `workspace_pm_board_sync` | Live board status sync | LOW |

### Notable Features

- **Cross-agent orchestration:** The PM agent is the only agent that can directly delegate work to other agents (Developer, Tester) and monitor the status of those delegations — functioning as a lightweight multi-agent coordinator.
- **Proactive monitoring:** Continuously scans for unresolved blockers and scope drift without being explicitly asked.
- **Forecasting:** Delivery date forecasting uses velocity history and probability modelling, not just naive extrapolation.

---

## 14. Mobile Engineer (Tester Sub-Agent)

> **This is a sub-agent, not a top-level agent.** The Mobile Engineer is spawned exclusively by the QA Tester when a task requires native iOS or Android work. It is not directly subscribable by operators and cannot be assigned tasks independently. It operates under the Tester's governance envelope and inherits the Tester's approval chain.

### Role Summary

The Mobile Engineer sub-agent covers native iOS (Swift / SwiftUI) and Android (Kotlin / Jetpack Compose) development and testing, including UI component generation, app building, test execution, push notification integration, deep linking, auth scaffolding, performance profiling, accessibility auditing, and App Store / Google Play submission. The QA Tester spawns it via `workspace_subagent_spawn` when a mobile-specific test execution or mobile build task is part of a broader testing workflow.

### Human Equivalent

- **Title:** iOS Engineer, Android Engineer, Mobile Developer, Senior Mobile Engineer
- **Seniority:** Mid to Senior (3–8 years experience equivalent)

### Where It Matches a Human

| Capability | Detail |
|---|---|
| iOS UI components | Generates SwiftUI or UIKit components from a written spec |
| iOS app builds | Builds and signs iOS apps using Fastlane / Xcode toolchain |
| iOS testing | Runs XCTest unit and UI test suites |
| Android UI components | Generates Jetpack Compose or XML layout components |
| Android app builds | Builds and signs Android APKs and AABs using Gradle |
| Android testing | Runs JUnit / Espresso / Robolectric test suites |
| Network client generation | Generates Retrofit (Android) and Alamofire (iOS) network clients with typed models |
| Push notifications | Integrates FCM (Android) and APNs (iOS) push notification flows |
| Deep linking | Implements deep linking and universal links / App Links |
| Mobile auth | Scaffolds OAuth 2.0 and JWT auth for iOS and Android |
| Performance profiling | On-device CPU and memory profiling with Instruments / Android Profiler |
| Accessibility audit | TalkBack (Android) and VoiceOver (iOS) accessibility testing |
| App Store submission | Submits to App Store Connect (HIGH-RISK, approval-gated) |
| Play Store submission | Submits to Google Play Console (HIGH-RISK, approval-gated) |
| Project scaffolding | Bootstraps new iOS or Android projects with standard tooling |
| Standup reporting | Mobile development standup from episodic memory |

### Where It Falls Short of a Human

- App Store review appeals and policy interpretations benefit from human experience with Apple's review process.
- Decisions about cross-platform vs. native architecture require human product and engineering leadership.
- Cannot substitute for a human mobile engineer in hands-on device debugging with physical hardware connected.

### Connectors

GitHub · GitLab · Bitbucket · Azure DevOps · Jira · Linear · Slack · Microsoft Teams · GitHub Actions · GitLab CI · Bitrise · Codemagic · Fastlane · App Store Connect · Google Play Console · Firebase · App Center · TestFlight · BrowserStack · Sauce Labs · Sentry · Datadog · PagerDuty · OneSignal · Braze · Confluence · Notion

### Full Action List

| Action | Description | Risk |
|---|---|---|
| `workspace_mob_ios_component` | iOS UI component (SwiftUI / UIKit) | LOW |
| `workspace_mob_ios_build` | iOS app build and signing | LOW |
| `workspace_mob_ios_test` | iOS unit and UI testing | LOW |
| `workspace_mob_android_component` | Android UI component (Compose / XML) | LOW |
| `workspace_mob_android_build` | Android app build and signing | LOW |
| `workspace_mob_android_test` | Android unit and UI testing | LOW |
| `workspace_mob_api_client` | Network client generation (Retrofit / Alamofire) | LOW |
| `workspace_mob_push_notify` | Push notification integration (FCM / APNs) | LOW |
| `workspace_mob_deep_link` | Deep linking and universal links | LOW |
| `workspace_mob_auth_implement` | OAuth / JWT auth scaffold for mobile | MEDIUM |
| `workspace_mob_perf_profile` | On-device CPU / memory profiling | LOW |
| `workspace_mob_a11y_audit` | TalkBack / VoiceOver accessibility audit | LOW |
| `workspace_mob_store_upload` | App Store / Play Store submission | HIGH — requires approval |
| `workspace_mob_scaffold_project` | New iOS / Android project scaffold | LOW |
| `workspace_mob_standup_report` | Mobile development standup | LOW |

---

## Cross-Agent Capabilities

Every agent in AgentFarm shares the following cross-cutting capabilities in addition to its domain-specific actions.

### Episodic Memory

All agents can read from and write to a persistent episodic memory store. This allows them to:

- Recall what they worked on in previous sessions
- Reference prior decisions, constraints, and context
- Generate accurate standup reports from activity history
- Avoid repeating mistakes that were corrected in prior sessions

### Meeting Participation

All agents can join live meetings (Google Meet, Microsoft Teams, Zoom) and participate as a speaker. This includes:

- Joining a scheduled meeting
- Delivering a spoken update (via TTS)
- Conducting live interviews with subject matter experts

### Human Escalation

Every agent has a structured escalation path. When an action is classified as HIGH-RISK, or when the agent encounters a situation outside its decision authority, it:

1. Pauses execution
2. Surfaces a decision card in the operator dashboard
3. Waits for a human to approve, modify, or reject before proceeding
4. Records the decision for the audit trail

### Audit Trail

Every action taken by every agent is recorded in an append-only audit log with:

- Timestamp
- Agent identity and tenant
- Action type and parameters
- Outcome
- Human approval record (where applicable)

### Standup Reporting

All agents can generate a daily standup report. The format is consistent across all agents:

- **Yesterday:** What was completed in the previous session
- **Today:** What is planned
- **Blockers:** Any impediments requiring human attention

---

## Governance & Safety Model

### Risk Classification

| Level | Description | Execution |
|---|---|---|
| LOW | Read operations, draft generation, analysis, internal reports | Autonomous — no approval required |
| MEDIUM | External communications, deployments to non-production, data modifications | Notified — operator is informed but execution proceeds |
| HIGH | Financial transactions, production deployments, external publishes, irreversible actions | Approval-gated — requires explicit operator decision |

### High-Risk Action Examples by Agent

| Agent | Example HIGH-RISK Actions |
|---|---|
| Recruiter | Offer generation, job board posting, background checks, requisition approval |
| Developer | Database migrations, production deployments |
| Full-Stack Developer | Full-stack feature, preview deployments, cross-team negotiations |
| Customer Support | Refund processing, order modification |
| DevOps | Terraform apply, K8s deploy, DNS changes, secret rotation, blue-green, canary |
| Corporate Assistant | External email sending |
| Project Manager | Project charter, budget forecast, change requests |
| Mobile Engineer | App Store / Play Store submission |
| Sales Rep | Contract transmission, outreach sending |

### Kill Switch

The platform includes a 30-second kill-switch control window. Operators can halt all in-flight agent actions across all tenants within 30 seconds of a governance event being raised.

### Circuit Breakers

Per-agent and per-tenant circuit breakers automatically pause execution if error rates or anomalous action patterns exceed configured thresholds.

---

*This document is auto-generated from the AgentFarm agent runtime codebase. For source of truth, see `apps/agent-runtime/src/agents/` and `packages/connector-contracts/`.*
