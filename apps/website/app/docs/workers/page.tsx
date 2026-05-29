import type { Metadata } from "next";
import Link from "next/link";
import { H1, H2, Lead, P, Code, Callout, InlineCode, PageNav, Tag, TypeTable, Divider, ParamTable, Response, Endpoint } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Worker Roles — AgentFarms Docs",
    description: "All 12 AgentFarms AI worker roles — skills, use cases, integrations, and pricing. Backend Developer, QA Engineer, Sales Rep, and more.",
    alternates: { canonical: "https://agentfarms.in/docs/workers" },
};

const workers = [
    {
        id: "backend-developer",
        name: "AI Backend Developer",
        slug: "ai-backend-developer",
        plan: "Starter+",
        price: "$99/mo",
        department: "Engineering",
        tagline: "REST APIs, business logic, database migrations",
        description: "Implements features end-to-end, writes API endpoints, manages database schemas, and reviews backend PRs with deep codebase context.",
        skills: ["Node.js", "Python", "PostgreSQL", "REST", "GraphQL"],
        integrations: ["GitHub", "GitLab", "Jira", "Linear", "Slack", "PostgreSQL", "MySQL"],
        useCases: [
            "Implement new CRUD endpoints from a Jira ticket",
            "Write and run zero-downtime database migrations",
            "Review backend PRs for security and performance issues",
            "Refactor legacy service code with full test coverage",
        ],
    },
    {
        id: "full-stack-developer",
        name: "AI Full-Stack Developer",
        slug: "ai-full-stack-developer",
        plan: "Starter+",
        price: "$99/mo",
        department: "Engineering",
        tagline: "End-to-end feature delivery across frontend and backend",
        description: "Implements complete features — React component, Next.js API route, Prisma migration, and tests — in a single coherent PR.",
        skills: ["Next.js", "React", "Node.js", "TypeScript", "Prisma"],
        integrations: ["GitHub", "Vercel", "Linear", "Jira", "PostgreSQL", "Slack"],
        useCases: [
            "Implement a user settings page with API and database layer",
            "Build a notifications system end-to-end",
            "Migrate a legacy page to a modern stack",
            "Write integration tests across frontend and backend",
        ],
    },
    {
        id: "qa-engineer",
        name: "AI QA Engineer",
        slug: "ai-qa-engineer",
        plan: "Starter+",
        price: "$99/mo",
        department: "Quality & Testing",
        tagline: "Unit, integration, and E2E test coverage",
        description: "Writes comprehensive test suites, runs regression checks on every PR, and blocks merges that introduce uncovered regressions.",
        skills: ["Jest", "Playwright", "Cypress", "Testing Library", "Vitest"],
        integrations: ["GitHub Actions", "CircleCI", "Jest", "Playwright", "Cypress", "Codecov"],
        useCases: [
            "Raise unit test coverage from 40% to 80% in one sprint",
            "Write E2E flows for critical checkout and auth paths",
            "Block PRs that introduce regressions automatically",
            "Generate weekly coverage trend reports",
        ],
    },
    {
        id: "technical-writer",
        name: "AI Technical Writer",
        slug: "ai-technical-writer",
        plan: "Starter+",
        price: "$49/mo",
        department: "Documentation",
        tagline: "API docs, READMEs, changelogs — always in sync",
        description: "Auto-generates API documentation from code, writes README files, maintains changelogs from git commits, and keeps docs perpetually up to date.",
        skills: ["Markdown", "OpenAPI", "Docusaurus", "JSDoc", "Mintlify"],
        integrations: ["GitHub", "Mintlify", "Docusaurus", "Swagger", "Notion", "Confluence"],
        useCases: [
            "Generate OpenAPI spec from Express/Fastify route handlers",
            "Write a full README from scratch for a new service",
            "Auto-maintain CHANGELOG.md from commit history",
            "Keep Docusaurus documentation in sync with code changes",
        ],
    },
    {
        id: "business-analyst",
        name: "AI Business Analyst",
        slug: "ai-business-analyst",
        plan: "Starter+",
        price: "$99/mo",
        department: "Product",
        tagline: "Requirements, process flows, and gap analysis",
        description: "Elicits and documents business requirements, maps as-is vs to-be processes, and produces gap analyses that align technology with business goals.",
        skills: ["Requirements Analysis", "BPMN", "User Stories", "Gap Analysis", "SQL"],
        integrations: ["Jira", "Confluence", "Miro", "Notion", "Slack", "Excel"],
        useCases: [
            "Document as-is and to-be checkout process flows",
            "Produce a requirements traceability matrix",
            "Run a gap analysis against a new regulation or compliance requirement",
            "Write acceptance criteria for 20 user stories in a sprint",
        ],
    },
    {
        id: "technical-recruiter",
        name: "AI Technical Recruiter",
        slug: "ai-technical-recruiter",
        plan: "Starter+",
        price: "$49/mo",
        department: "HR & Talent",
        tagline: "Job specs, candidate sourcing, and interview scheduling",
        description: "Writes job descriptions, sources candidates from LinkedIn and GitHub, screens applications with structured rubrics, and coordinates interview scheduling.",
        skills: ["LinkedIn Sourcing", "ATS", "Job Description Writing", "Screening", "Scheduling"],
        integrations: ["LinkedIn", "Greenhouse", "Lever", "Workday", "Slack", "Google Calendar"],
        useCases: [
            "Write optimized job descriptions for 5 open roles",
            "Source 20 qualified senior engineers per week",
            "Screen 100 applications against a structured scoring rubric",
            "Automate interview scheduling across time zones",
        ],
    },
    {
        id: "content-writer",
        name: "AI Content Writer",
        slug: "ai-content-writer",
        plan: "Starter+",
        price: "$49/mo",
        department: "Marketing",
        tagline: "Blog posts, case studies, and landing page copy",
        description: "Researches, writes, and edits blog posts, case studies, product landing pages, and social copy that drives organic traffic and leads.",
        skills: ["Copywriting", "SEO Writing", "Content Strategy", "Case Studies", "Markdown"],
        integrations: ["Notion", "HubSpot", "WordPress", "Webflow", "Slack", "Google Docs"],
        useCases: [
            "Write 4 SEO-optimized blog posts per month",
            "Turn customer data into compelling case studies",
            "Refresh stale landing pages with updated messaging",
            "Draft 30 days of social copy in one session",
        ],
    },
    {
        id: "sales-rep",
        name: "AI Sales Rep",
        slug: "ai-sales-rep",
        plan: "Starter+",
        price: "$49/mo",
        department: "Sales",
        tagline: "Lead qualification, CRM hygiene, and outbound sequences",
        description: "Qualifies inbound leads against your ICP, drafts personalized outbound sequences, updates CRM records after every interaction, and prepares competitive briefs.",
        skills: ["Lead Qualification", "CRM Management", "Cold Outreach", "Proposal Writing", "Competitive Analysis"],
        integrations: ["Salesforce", "HubSpot", "LinkedIn", "Outreach", "Slack", "Gmail"],
        useCases: [
            "Qualify inbound leads against ICP criteria automatically",
            "Draft personalized outbound email sequences per segment",
            "Update CRM records after every call or email touchpoint",
            "Produce competitive analysis briefs before discovery calls",
        ],
    },
    {
        id: "marketing-specialist",
        name: "AI Marketing Specialist",
        slug: "ai-marketing-specialist",
        plan: "Starter+",
        price: "$49/mo",
        department: "Marketing",
        tagline: "Campaign strategy, ad copy, and analytics reports",
        description: "Designs and executes multi-channel marketing campaigns, writes Google and LinkedIn ad copy, runs A/B tests, and delivers weekly analytics reports.",
        skills: ["Campaign Strategy", "SEO", "Ad Copywriting", "Google Analytics", "A/B Testing"],
        integrations: ["Google Ads", "HubSpot", "Google Analytics", "Semrush", "Slack", "Notion"],
        useCases: [
            "Build a multi-channel campaign brief and content calendar",
            "Write Google Ads and LinkedIn ad copy for 5 segments",
            "Analyze A/B test results and recommend the winner",
            "Deliver weekly marketing performance reports automatically",
        ],
    },
    {
        id: "corporate-assistant",
        name: "AI Corporate Assistant",
        slug: "ai-corporate-assistant",
        plan: "Starter+",
        price: "$49/mo",
        department: "Operations",
        tagline: "Email drafting, meeting summaries, and scheduling",
        description: "Drafts professional emails, summarizes meeting recordings, manages calendar scheduling across time zones, and coordinates travel logistics.",
        skills: ["Email Drafting", "Calendar Management", "Meeting Summaries", "Document Formatting", "Travel Coordination"],
        integrations: ["Google Workspace", "Microsoft 365", "Slack", "Zoom", "Notion", "Calendly"],
        useCases: [
            "Draft and send professional emails in your voice",
            "Summarize meeting recordings into action items and decisions",
            "Schedule meetings across multiple time zones automatically",
            "Format and prepare board-ready documents and reports",
        ],
    },
    {
        id: "customer-support-agent",
        name: "AI Customer Support Agent",
        slug: "ai-customer-support-agent",
        plan: "Starter+",
        price: "$49/mo",
        department: "Customer Success",
        tagline: "Tier-1 support, ticket triage, and escalation routing",
        description: "Handles inbound support tickets at scale, auto-resolves Tier-1 questions from your knowledge base, and routes complex issues to the right human.",
        skills: ["Zendesk", "Intercom", "Help Centre Writing", "Ticket Triage", "CSAT"],
        integrations: ["Zendesk", "Intercom", "Freshdesk", "Slack", "Notion", "HubSpot"],
        useCases: [
            "Auto-resolve 60% of Tier-1 tickets instantly",
            "Route tickets to the correct team with 95%+ accuracy",
            "Keep help centre documentation updated from resolved tickets",
            "Generate weekly CSAT trend and volume reports",
        ],
    },
    {
        id: "project-manager",
        name: "AI Project Manager",
        slug: "ai-project-manager",
        plan: "Starter+",
        price: "$99/mo",
        department: "Operations",
        tagline: "Sprint planning, status reports, and risk tracking",
        description: "Facilitates sprint ceremonies, generates status reports from Jira data, tracks risks and blockers proactively, and keeps delivery timelines predictable.",
        skills: ["Jira", "Agile/Scrum", "Risk Management", "Status Reporting", "Confluence"],
        integrations: ["Jira", "Linear", "Confluence", "Notion", "Slack", "Google Workspace"],
        useCases: [
            "Generate weekly project status reports from Jira automatically",
            "Run sprint planning prep, story estimation, and backlog grooming",
            "Track risks and blockers in a live risk register",
            "Produce retrospective summaries with actionable insights",
        ],
    },
];

export default function WorkersPage() {
    return (
        <article>
            <Tag>Workers</Tag>
            <H1>Worker Roles</H1>
            <Lead>
                AgentFarms includes 12 specialist worker roles across engineering, sales,
                marketing, operations, and customer success. Each role has a defined scope,
                toolset, and approval model.
            </Lead>

            {/* Deploy a worker */}
            <H2 id="deploy">Deploying a worker</H2>
            <Code lang="http">{`POST https://api.agentfarms.in/v1/workers
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "name": "Rex",
  "role": "backend-developer",
  "repo_ids": ["repo_abc123"],
  "approval_threshold": "medium"
}

# Available role values:
# backend-developer | full-stack-developer | qa-engineer
# technical-writer  | business-analyst     | technical-recruiter
# content-writer    | sales-rep            | marketing-specialist
# corporate-assistant | customer-support-agent | project-manager`}</Code>

            <Callout type="note">
                Worker provisioning takes 30–60 seconds. Poll <InlineCode>GET /v1/workers/:id</InlineCode> until status is <InlineCode>active</InlineCode>.
            </Callout>

            <Divider />

            {/* Worker catalog */}
            <H2 id="catalog">Worker catalog</H2>
            <P>Click any worker to jump to its detail section.</P>
            <div className="my-4 grid sm:grid-cols-2 gap-2">
                {workers.map((w) => (
                    <a
                        key={w.id}
                        href={`#${w.id}`}
                        className="flex items-center justify-between px-4 py-3 rounded-[11px] text-[14px] transition-colors hover:bg-[rgba(0,102,204,0.04)]"
                        style={{ border: "1px solid #d2d2d7" }}
                    >
                        <span className="font-medium text-[#1d1d1f]">{w.name.replace("AI ", "")}</span>
                        <span className="text-[12px] text-[#6e6e73]">{w.price}</span>
                    </a>
                ))}
            </div>

            <Divider />

            {/* Individual worker cards */}
            {workers.map((w) => (
                <div key={w.id}>
                    <H2 id={w.id}>{w.name}</H2>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(0,102,204,0.08)", color: "#0066cc" }}>
                            {w.department}
                        </span>
                        <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(52,199,89,0.08)", color: "#1a7a4a" }}>
                            {w.plan}
                        </span>
                        <span className="text-[12px] text-[#6e6e73]">{w.price}</span>
                    </div>
                    <P>{w.description}</P>

                    <div className="grid sm:grid-cols-3 gap-4 my-4 text-[13px]">
                        <div>
                            <p className="font-semibold text-[#1d1d1f] mb-2">Skills</p>
                            <ul className="space-y-1">
                                {w.skills.map((s) => (
                                    <li key={s} className="flex items-center gap-1.5 text-[#6e6e73]">
                                        <span className="w-1 h-1 rounded-full bg-[#0066cc] shrink-0" />
                                        {s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold text-[#1d1d1f] mb-2">Integrations</p>
                            <ul className="space-y-1">
                                {w.integrations.map((i) => (
                                    <li key={i} className="flex items-center gap-1.5 text-[#6e6e73]">
                                        <span className="w-1 h-1 rounded-full bg-[#6e6e73] shrink-0" />
                                        {i}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold text-[#1d1d1f] mb-2">Common use cases</p>
                            <ul className="space-y-1">
                                {w.useCases.map((u) => (
                                    <li key={u} className="text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                                        {u}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <Code lang="http">{`# Deploy a ${w.name}
POST https://api.agentfarms.in/v1/workers
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx

{ "name": "My worker", "role": "${w.id}" }`}</Code>
                    <div style={{ borderBottom: "1px solid #e8e8ed" }} className="my-8" />
                </div>
            ))}

            <PageNav
                prev={{ href: "/docs/evidence", label: "Evidence Trail" }}
                next={{ href: "/docs/connectors", label: "Connectors" }}
            />
        </article>
    );
}
