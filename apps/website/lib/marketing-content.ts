export const siteMarketingMetadata = {
    siteTitle: "AgentFarm - AI Workers That Ship With Human Control",
    siteDescription:
        "Deploy AI workers that do real work inside your systems, stop at approval boundaries, and leave behind evidence your team can trust.",
    homeTitle: "AgentFarm - AI Workers That Ship With Human Control",
    homeDescription:
        "Give your team AI workers with real tool access, approval checkpoints, and a full evidence trail so output goes up without governance falling apart.",
} as const;

export const homeMarketingContent = {
    hero: {
        eyebrow: "AI workers with real output and real guardrails",
        titleLead: "Hire AI workers that",
        cycleWords: ["Ship backlog", "Handle support", "Run operations", "Keep teams aligned", "Protect delivery"],
        description:
            "AgentFarm is built for teams who want more output, not more AI theater. Deploy workers with real tool access, hard role boundaries, and human approval where the stakes are real.",
        benefits: [
            "Launch specialist workers across engineering, support, operations, and revenue",
            "Stop risky actions at the approval layer before they touch customers, code, or production",
            "Keep a searchable evidence trail for every task, decision, and shipped outcome",
        ],
        primaryCta: { label: "Start free - no card", href: "/get-started" },
        secondaryCta: { label: "Book a demo", href: "/book-demo" },
        caption: "Deploy in under 10 minutes - no card required",
        activityHeader: "Live operations",
        activityStatus: "4 workers active",
        activity: [
            { label: "PR #482 merged", detail: "Auth timeout fix for billing retries", time: "2m" },
            { label: "Approval granted", detail: "Staging schema change cleared by reviewer", time: "8m" },
            { label: "CI passed", detail: "985 of 985 checks green", time: "15m" },
        ],
        approvalTitle: "Production rollout waiting for approval",
        approvalPrimary: "Approve",
        approvalSecondary: "Review diff",
    },
    problem: {
        eyebrow: "The problem",
        title: "Most teams do not need more ideas. They need more execution.",
        description:
            "Backlogs keep growing, hiring remains slow, and your best people still lose too much of the week to work that should already be off their plate.",
        items: [
            {
                stat: "10M+",
                statLabel: "open technical roles globally",
                accentColor: "#ff6161",
                title: "Hiring cannot keep pace",
                description:
                    "Critical work waits because headcount is slow to secure, slow to onboard, and increasingly expensive to retain.",
            },
            {
                stat: "73 days",
                statLabel: "average time to hire",
                accentColor: "#ffc533",
                title: "Delivery slows down",
                description:
                    "Cross-team handoffs, review queues, and repeated context switching quietly extend every release cycle.",
            },
            {
                stat: "$157k",
                statLabel: "average senior engineer salary",
                accentColor: "#57c1ff",
                title: "Capacity is costly",
                description:
                    "Expanding execution capacity with full-time hiring adds salary, benefits, management overhead, and onboarding drag.",
            },
            {
                stat: "40%",
                statLabel: "time lost to repeatable work",
                accentColor: "#59d499",
                title: "Experts get buried in routine work",
                description:
                    "Strong operators and engineers still spend large chunks of the week on boilerplate, follow-up, triage, and status work.",
            },
        ],
    },
    solution: {
        eyebrow: "The solution",
        title: "A governed execution layer for the work teams repeat every day",
        description:
            "AgentFarm turns autonomous work into something operationally sane. Every worker has a role, a boundary, and a review model your team can actually live with.",
        benefits: [
            "Role-based AI workers with clear responsibilities and expected outputs",
            "Direct connections into GitHub, Jira, Slack, email, and internal tools",
            "Approval checkpoints before risky changes, sends, or production moves",
            "Evidence for every action so reviews are fast and accountability stays clear",
            "Faster execution on repeatable work without adding full-time headcount",
            "Predictable rollout with policy, persona, and connector controls from day one",
        ],
        link: { label: "See the full delivery flow", href: "/how-it-works" },
        liveStatusLabel: "4 workers active",
        events: [
            {
                label: "PR #482 opened",
                detail: "Auth timeout fix prepared for billing retries",
                agent: "AI Backend Developer",
                initials: "AB",
                accentColor: "#57c1ff",
                risk: "low",
                time: "just now",
            },
            {
                label: "CI checks passed",
                detail: "985 of 985 tests green",
                agent: "AI QA Engineer",
                initials: "AQ",
                accentColor: "#59d499",
                risk: "low",
                time: "8m ago",
            },
            {
                label: "Approval needed",
                detail: "Customer schema migration ready for review",
                agent: "AI DevOps Engineer",
                initials: "AD",
                accentColor: "#ffc533",
                risk: "high",
                time: "15m ago",
            },
        ],
        approvalTitle: "High-risk action pending your approval",
        stats: [
            { label: "Median setup", value: "9 minutes", color: "#57c1ff" },
            { label: "Weekly output", value: "+18 PRs", color: "#59d499" },
            { label: "Governance", value: "Audit-ready", color: "#ffc533" },
        ],
        calloutTitle: "Teams usually feel the time savings before they fully trust the system",
        calloutDescription:
            "That is fine. Trust should be earned. The point is that bounded output shows up fast, and confidence grows once the review loop proves itself.",
    },
    features: {
        eyebrow: "Platform",
        title: "One platform for every step",
        titleAccent: "of controlled AI execution.",
        tabs: [
            {
                id: "hire",
                label: "Hire",
                color: "#57c1ff",
                headline: "Launch workers with a job to do, not a vague prompt to chase",
                description:
                    "Pick a role, connect the right tools, and deploy a worker with a scope, persona, and approval model your team can understand in minutes.",
                points: [
                    "Choose from specialist roles across engineering, support, operations, and GTM",
                    "Connect tools with OAuth or approved credentials instead of custom setup scripts",
                    "Define identity, escalation rules, and rollout defaults during setup",
                ],
                panel: {
                    roles: [
                        { name: "Developer", badge: "Active", color: "#57c1ff" },
                        { name: "Tester", badge: "Ready", color: "#59d499" },
                        { name: "Support", badge: "Ready", color: "#ffc533" },
                        { name: "Ops", badge: "Ready", color: "#a78bfa" },
                    ],
                    buttonLabel: "Deploy Developer worker",
                    footnote: "Takes under 10 minutes - no card required",
                },
            },
            {
                id: "execute",
                label: "Execute",
                color: "#59d499",
                headline: "Workers act inside the systems your team already runs",
                description:
                    "AgentFarm workers move through full workflows, whether the work lives in APIs, Git repositories, dashboards, or browser-driven tools.",
                points: [
                    "Run full execution flows from intake to output, status, and follow-through",
                    "Support both API-driven work and visual desktop-style interaction when needed",
                    "Compose reusable skills around the workflows your team already depends on",
                ],
                panel: {
                    steps: [
                        { label: "Task assigned", detail: "Fix timeout issue in billing auth flow", color: "#57c1ff" },
                        { label: "PR opened", detail: "2 files changed, branch pushed", color: "#59d499" },
                        { label: "CI triggered", detail: "Validation pipeline running", color: "#ffc533" },
                        { label: "CI passed", detail: "All checks green", color: "#59d499" },
                        { label: "PR merged", detail: "Change promoted after review", color: "#57c1ff" },
                    ],
                },
            },
            {
                id: "control",
                label: "Control",
                color: "#ffc533",
                headline: "Important actions stop for humans instead of pretending they should not",
                description:
                    "Every action can be classified by risk so routine work keeps moving while meaningful decisions come back with enough context for a fast, confident review.",
                points: [
                    "Use low, medium, and high-risk policies to govern how work flows",
                    "Review a change summary, rollout context, and impact signals before approving",
                    "Keep an exportable evidence trail for compliance, operations, and leadership review",
                ],
                panel: {
                    items: [
                        { title: "Schema migration - staging", risk: "HIGH", status: "Awaiting approval", color: "#ff5757" },
                        { title: "Customer email batch send", risk: "MEDIUM", status: "Awaiting approval", color: "#ffc533" },
                        { title: "Lint and formatting pass", risk: "LOW", status: "Auto-approved", color: "#59d499" },
                    ],
                },
            },
            {
                id: "scale",
                label: "Scale",
                color: "#a78bfa",
                headline: "Scale output without creating a coordination mess",
                description:
                    "Track delivery, approvals, and cost across workers so expansion happens because the data earned it, not because the demo looked exciting.",
                points: [
                    "See activity, throughput, and review pressure across every worker",
                    "Measure output and cost by role, workflow, and workspace",
                    "Add new workers as configuration instead of spinning up a new hiring cycle",
                ],
                panel: {
                    stats: [
                        { label: "PRs merged", value: "312", delta: "+18%", color: "#57c1ff" },
                        { label: "Hours saved", value: "1,840", delta: "+32%", color: "#59d499" },
                        { label: "Cycle time", value: "-41%", delta: "vs last month", color: "#ffc533" },
                        { label: "Cost / task", value: "$1.20", delta: "avg", color: "#a78bfa" },
                    ],
                },
            },
        ],
    },
    testimonials: {
        eyebrow: "Customer stories",
        title: "Real teams. Measurable outcomes.",
        description:
            "Founders and operators use AgentFarm when they want more output without introducing a new black box into the business.",
        items: [
            {
                name: "Sarah Chen",
                role: "CTO - BuildFast",
                initials: "SC",
                color: "bg-sky-500",
                stars: 5,
                metric: "Test coverage 61% to 94% in 3 weeks",
                quote:
                    "We aimed the QA worker at our regression suite and stopped pulling product engineers into repetitive coverage work. The payoff showed up almost immediately.",
            },
            {
                name: "Marcus Webb",
                role: "VP Engineering - TechCorp",
                initials: "MW",
                color: "bg-violet-500",
                stars: 5,
                metric: "Feature cycle time reduced by 42%",
                quote:
                    "Our backend worker handles the repeatable implementation layer so human engineers can stay focused on architecture, judgment, and customer-facing decisions.",
            },
            {
                name: "Priya Nair",
                role: "Founder - ShipIt",
                initials: "PN",
                color: "bg-emerald-500",
                stars: 5,
                metric: "MVP shipped in 6 days",
                quote:
                    "As a small team, AgentFarm gave us execution capacity we simply did not have. We moved like a much larger company without losing review discipline.",
            },
            {
                name: "James Okafor",
                role: "Engineering Manager - DevOps Inc.",
                initials: "JO",
                color: "bg-amber-500",
                stars: 5,
                metric: "Review cleanup time down 35%",
                quote:
                    "The Git and CI loop feels native. Work arrives structured, evidence is attached, and senior reviewers spend less time cleaning up process noise.",
            },
            {
                name: "Anita Russo",
                role: "Lead Architect - CloudNative",
                initials: "AR",
                color: "bg-indigo-500",
                stars: 5,
                metric: "Velocity doubled with 3 workers",
                quote:
                    "The approval model is what made this viable for production. We gained output without treating governance like an afterthought.",
            },
            {
                name: "Tom Lindstrom",
                role: "Head of Product - StartupX",
                initials: "TL",
                color: "bg-rose-500",
                stars: 5,
                metric: "2 hours per week reclaimed from coordination",
                quote:
                    "The notifications, summaries, and evidence stream cut down so much back-and-forth. We spend more time deciding and less time chasing status.",
            },
        ],
    },
    pricing: {
        eyebrow: "Pricing",
        title: "Pricing that matches how cautious teams actually buy",
        description:
            "Start narrow, prove the workflow, and expand only when the output justifies broader rollout.",
        monthlyLabel: "Monthly",
        annualLabel: "Annual",
        annualDiscountLabel: "-20%",
        plans: [
            {
                name: "Starter",
                price: "$299",
                description: "Best for teams proving governed AI workflows with one or two core roles.",
                features: [
                    "2 AI workers",
                    "Up to 10 repositories or toolspaces",
                    "Core integrations and approval routing",
                    "2,000 task executions per month",
                    "Evidence trail and baseline analytics",
                    "Email support",
                ],
                cta: "Start 14-day free trial",
                ctaHref: "/#waitlist",
                highlighted: false,
            },
            {
                name: "Pro",
                price: "$599",
                description: "For teams expanding governed execution across multiple workflows and functions.",
                features: [
                    "5 AI workers",
                    "Unlimited repositories and workspaces",
                    "Expanded integrations across delivery and operations",
                    "10,000 task executions per month",
                    "Priority support and custom approval workflows",
                    "Team analytics and rollout visibility",
                ],
                cta: "Start 14-day free trial",
                ctaHref: "/#waitlist",
                highlighted: true,
            },
            {
                name: "Enterprise",
                price: "Custom",
                description: "For regulated environments that need scale, governance, and deployment flexibility.",
                features: [
                    "Unlimited AI workers",
                    "Unlimited task executions",
                    "SSO, SAML, and enterprise controls",
                    "Tenant-isolated runtime options",
                    "Dedicated onboarding and support",
                    "Custom connectors and policy packs",
                ],
                cta: "Contact sales",
                ctaHref: "/book-demo",
                highlighted: false,
            },
        ],
        linkLabel: "View full pricing and plan details ->",
    },
    faq: {
        eyebrow: "FAQ",
        title: "Frequently asked questions",
        description: "Clear answers about setup, governance, pricing, and everyday operations.",
        items: [
            {
                question: "What is AgentFarm?",
                answer:
                    "AgentFarm is a governed AI worker platform. You deploy role-based workers that complete real tasks inside your tools while routing important decisions through human approval.",
            },
            {
                question: "How is AgentFarm different from coding copilots or chat tools?",
                answer:
                    "Copilots help individuals generate suggestions. AgentFarm workers execute complete workflows with task ownership, tool access, status tracking, approvals, and evidence.",
            },
            {
                question: "How are risky actions handled?",
                answer:
                    "You define approval policy by risk level. Low-risk work can proceed automatically, while medium and high-risk actions pause for review before they execute.",
            },
            {
                question: "What kinds of roles are available?",
                answer:
                    "Teams can launch specialist workers for engineering, testing, support, operations, documentation, project coordination, and revenue-oriented workflows.",
            },
            {
                question: "Is our data safe?",
                answer:
                    "Workers operate with scoped access, tenant isolation, and a full evidence trail. You control which connectors are enabled and where approvals are required.",
            },
            {
                question: "What connectors are supported?",
                answer:
                    "AgentFarm supports common delivery and business systems such as GitHub, Jira, Slack, email, calendars, and internal tools through approved connector paths.",
            },
            {
                question: "How does pricing work?",
                answer:
                    "Plans are aligned to role coverage and usage. Start small, measure value, and expand when the workflows are proving themselves.",
            },
            {
                question: "What happens when a worker makes a mistake?",
                answer:
                    "Outputs remain reviewable, approvals can stop risky actions, and every action is recorded so teams can inspect, learn, and adjust policy or prompts as needed.",
            },
        ],
    },
    cta: {
        badge: "Deploy your first AI worker in under 10 minutes",
        titleLead: "Increase output without",
        titleAccent: "lowering your standards",
        description:
            "Start with one painful workflow, connect the tools you already trust, and scale only after the review loop proves the worker belongs there.",
        liveMetrics: [
            { label: "46 PRs merged this week", color: "#59d499" },
            { label: "184 tasks shipped", color: "#57c1ff" },
            { label: "100% audit-covered", color: "#ffc533" },
        ],
        trustItems: [
            "Policy-aware approvals",
            "Tenant-isolated runtime",
            "14-day free trial",
            "Full evidence trail",
        ],
        footnote: "No spam. No credit card required. Unsubscribe anytime.",
        supportLine: "Need full onboarding support?",
        supportLink: { label: "Apply for early access ->", href: "/get-started" },
        summaryStats: [
            { label: "Workers active", value: "4", color: "#57c1ff" },
            { label: "Tasks today", value: "23", color: "#59d499" },
            { label: "Awaiting approval", value: "2", color: "#ffc533" },
        ],
        rows: [
            { role: "Developer", task: "PR #482 merged - auth timeout fix", time: "2m ago", color: "#57c1ff" },
            { role: "Tester", task: "985 of 985 checks green", time: "8m ago", color: "#59d499" },
            { role: "Support", task: "Customer escalation response drafted", time: "14m ago", color: "#ffc533" },
            { role: "Ops", task: "Meeting summary synced to workspace", time: "21m ago", color: "#a78bfa" },
        ],
    },
} as const;

export const pricingPageContent = {
    metadata: {
        title: "Pricing - AgentFarm",
        description: "Pricing for teams that want AI workers to prove themselves before they scale.",
    },
    hero: {
        eyebrow: "Pricing",
        title: "Buy small. Prove value. Expand with evidence.",
        description:
            "AgentFarm is priced for teams that want to start with one real workflow, measure the output, and expand from proof instead of hype.",
        footnoteTemplate: "{count} live roles - 14-day free trial - no card required",
    },
    decisionCards: [
        {
            chip: "Getting started",
            pricePrefix: "From",
            description: "Best when you are proving AI worker workflows with one or two high-impact roles.",
        },
        {
            chip: "Most popular",
            pricePrefix: "Most teams pick Pro+ at",
            description: "Adds more role coverage and rollout capacity across engineering and operating workflows.",
        },
        {
            chip: "Enterprise",
            pricePrefix: "For regulated environments",
            description: "Custom governance, deployment posture, and support for strict security or compliance needs.",
        },
    ],
    planConfig: {
        "Starter+": {
            cta: "Start free trial",
            ctaHref: "/get-started",
            highlighted: false,
            summary: "Best for teams launching their first governed specialist workflows quickly.",
        },
        "Pro+": {
            cta: "Start free trial",
            ctaHref: "/get-started",
            highlighted: true,
            summary: "Built for scaling multiple workers across engineering, operations, and revenue workflows.",
        },
        Enterprise: {
            cta: "Contact sales",
            ctaHref: "/contact",
            highlighted: false,
            summary: "For compliance-heavy teams requiring custom controls, runtime posture, and support.",
        },
    },
    planFeatures: {
        liveRolesLabel: "live roles",
        totalRolesLabel: "total",
        departmentsLabel: "departments covered",
        topRolesPrefix: "Top roles:",
        fallbackRoleSummary: "Role lineup tailored to your team",
        enterpriseNote: "Custom SLA and governance controls",
        trialNote: "14-day free trial included",
    },
    pageFooterNote:
        "Marketplace pricing updates with role availability - 14-day free trial, no credit card required.",
    faqs: [
        {
            q: "Is there a free trial?",
            a: "Yes. Teams can start with a 14-day trial on the entry plan to validate workflows before committing to a broader rollout.",
        },
        {
            q: "What counts as a task execution?",
            a: "A task execution is a unit of work a worker actively handles, such as preparing a PR, drafting a response, generating a summary, or completing an operational step inside connected tools.",
        },
        {
            q: "Can I change plans later?",
            a: "Yes. Teams can expand or contract plan coverage as role usage, governance needs, and workflow volume evolve.",
        },
        {
            q: "What integrations are supported?",
            a: "AgentFarm supports core delivery, communication, and operating tools, and can extend into internal systems through approved connector paths.",
        },
        {
            q: "Is our data isolated?",
            a: "Yes. Workers run with scoped permissions, tenant isolation, and approval-aware governance rather than broad shared access.",
        },
        {
            q: "Do you support regulated or custom deployments?",
            a: "Enterprise plans support stricter governance, rollout controls, and deployment options for teams with heavier compliance requirements.",
        },
    ],
} as const;

export const productPageContent = {
    metadata: {
        title: "Product - AgentFarm",
        description:
            "Explore the AgentFarm product experience for launching governed AI workers with approvals, evidence, and role-based execution.",
    },
    hero: {
        badge: "Product",
        titleLead: "One platform for",
        titleAccent: "AI work you can actually trust",
        description:
            "AgentFarm helps teams launch role-based AI workers that act in real systems, respect approval boundaries, and show their work clearly enough to earn trust.",
        primaryCta: { label: "Start free trial", href: "/#waitlist" },
        secondaryCta: { label: "How it works", href: "/how-it-works" },
    },
    outcomes: [
        "First worker live in your environment within minutes of setup",
        "Riskier actions pause automatically before they affect customers or production",
        "Role-scoped tool access keeps execution aligned to policy",
        "Every action, approval, and outcome stays visible in the evidence trail",
    ],
    executionFlow: [
        {
            step: "01",
            title: "Choose a role and launch a worker",
            detail: "Provision the worker, define its identity, and set approval defaults from a guided setup flow.",
        },
        {
            step: "02",
            title: "Connect the tools that role needs",
            detail: "Authorize only the systems relevant to the workflow so the worker can operate with clear boundaries.",
        },
        {
            step: "03",
            title: "Run work with approval-aware delivery",
            detail: "Routine actions continue automatically while higher-risk work waits for review before it proceeds.",
        },
    ],
    demo: {
        badge: "See it in action",
        title: "Watch a worker move from intake to delivery",
        description:
            "The product is built around real workflow progression, not prompt tricks, toy demos, or hand-waved autonomy.",
    },
    featuresHeader: {
        title: "Built for real operating environments",
        description:
            "Every capability is shaped around how modern teams actually deliver work, coordinate decisions, and manage risk.",
    },
    features: [
        {
            gradient: "from-blue-500 to-blue-600",
            title: "Role-based worker deployment",
            description:
                "Launch specialist workers for engineering, testing, support, coordination, and operational workflows from a shared control plane.",
            image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-yellow-500 to-amber-500",
            title: "Fast marketplace onboarding",
            description:
                "Choose a role, connect the right tools, and deploy a worker without custom setup or brittle one-off configuration.",
            image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-red-500 to-red-600",
            title: "Approval-aware execution",
            description:
                "Classify work by risk so sensitive actions stop for review while lower-risk work continues to move forward.",
            image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-orange-500 to-orange-600",
            title: "Tenant-isolated runtime",
            description:
                "Keep execution, credentials, and context isolated so rollout can scale without cross-tenant ambiguity.",
            image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-green-500 to-green-600",
            title: "API and visual execution modes",
            description:
                "Handle structured integrations where APIs exist and support visual, browser-driven workflows where they do not.",
            image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-violet-500 to-violet-600",
            title: "Evidence and auditability",
            description:
                "Track action history, approvals, and workflow outputs so operations, security, and leadership can review with confidence.",
            image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-slate-600 to-slate-700",
            title: "Connector-based tool access",
            description:
                "Extend workers into the systems your teams already use, including internal tooling routed through approved connector patterns.",
            image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=800&q=80",
        },
        {
            gradient: "from-pink-500 to-pink-600",
            title: "Multi-model execution posture",
            description:
                "Route work across model providers and fallback strategies without forcing teams to rebuild their operating flow around a single vendor.",
            image: "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=800&q=80",
        },
    ],
    cta: {
        title: "Ready to launch your first governed AI worker?",
        description:
            "Start with one role, prove the workflow, and expand coverage once your team sees the result in real operations.",
        button: { label: "Join the waitlist", href: "/#waitlist" },
    },
} as const;

export const docsOverviewContent = {
    metadata: {
        title: "Documentation - AgentFarm",
        description:
            "Documentation for deploying and governing AgentFarm AI workers across real team workflows.",
    },
    hero: {
        title: "AgentFarm Docs",
        description:
            "Everything you need to deploy workers, connect real systems, and understand the operating model behind controlled AI execution.",
    },
    cards: [
        {
            title: "Quickstart",
            description: "Launch your first governed worker in under 10 minutes.",
            href: "/docs/quickstart",
            cta: "Get started ->",
            gradient: "from-orange-500 to-amber-500",
        },
        {
            title: "How workers operate",
            description: "Learn the task lifecycle, execution model, and approval controls.",
            href: "/docs/concepts",
            cta: "Read concepts ->",
            gradient: "from-blue-500 to-cyan-500",
        },
        {
            title: "REST API",
            description: "Programmatically manage workers, tasks, and evidence-aware workflows.",
            href: "/docs/api-reference",
            cta: "View reference ->",
            gradient: "from-violet-500 to-blue-500",
        },
    ],
    quickstartTitle: "Quickstart - launch your first governed worker",
    quickstartSteps: [
        {
            label: "Step 1",
            title: "Create your account and choose a starting role",
            description:
                "Create an AgentFarm account and pick the first role you want to validate so the platform can tailor setup defaults around that workflow.",
            code: null,
        },
        {
            label: "Step 2",
            title: "Connect the systems that role needs",
            description:
                "Authorize only the tools relevant to the workflow so the worker can operate with scoped access from the beginning.",
            code: 'POST /v1/connectors\n{ tool: "github" | "jira" | "slack" | "gmail" }',
        },
        {
            label: "Step 3",
            title: "Set identity and approval policy",
            description:
                "Define how the worker presents itself and where human approval is required before higher-risk actions execute.",
            code: 'POST /v1/personas\n{ botId, name, email, approvalThreshold: "medium" }',
        },
        {
            label: "Step 4",
            title: "Assign the first task",
            description:
                "Kick off a real task from the dashboard, API, or an approved connector path and review the resulting execution trail.",
            code: "POST /v1/tasks\n{ prompt: \"Prepare a summary of this week's open platform blockers\" }",
        },
    ],
    conceptsTitle: "Core concepts",
    concepts: [
        {
            title: "Task lifecycle",
            description:
                "How work moves from intake to planning, execution, approval, and completion with evidence captured throughout.",
            href: "/docs/concepts#tasks",
            gradient: "from-[var(--accent-blue)] to-cyan-500",
        },
        {
            title: "Approval gates",
            description:
                "How low, medium, and high-risk actions are classified and where teams stay in the decision loop.",
            href: "/docs/concepts#approvals",
            gradient: "from-rose-500 to-pink-500",
        },
        {
            title: "Git and delivery workflows",
            description:
                "How AgentFarm workers interact with repositories, reviews, CI, and downstream delivery coordination.",
            href: "/docs/concepts#git",
            gradient: "from-violet-500 to-blue-500",
        },
        {
            title: "Connectors",
            description:
                "How connectors authenticate, refresh, and expose scoped actions to workers inside approved systems.",
            href: "/docs/concepts#connectors",
            gradient: "from-amber-500 to-orange-500",
        },
        {
            title: "Runtime isolation",
            description:
                "What tenant isolation, execution boundaries, and controlled access look like in practice.",
            href: "/docs/concepts#runtime",
            gradient: "from-[var(--accent-green)] to-teal-500",
        },
        {
            title: "Evidence plane",
            description:
                "How actions, approvals, and outputs are captured for review, export, and compliance use cases.",
            href: "/docs/concepts#evidence",
            gradient: "from-[var(--accent-blue)] to-cyan-400",
        },
    ],
    apiTitle: "REST API reference",
    apiBaseUrl: "https://api.agentfarm.ai/v1",
    apiEndpoints: [
        { method: "GET", path: "/tasks", description: "List tasks with status, worker, and evidence context" },
        { method: "POST", path: "/tasks", description: "Create a new governed task for an active worker" },
        { method: "GET", path: "/tasks/:id", description: "Inspect task detail, outputs, and progress state" },
        { method: "POST", path: "/marketplace/invoke", description: "Invoke a packaged skill or worker capability directly" },
        { method: "GET", path: "/connectors", description: "List configured connectors and current health" },
        { method: "POST", path: "/connectors", description: "Add a new connector credential or integration session" },
        { method: "GET", path: "/evidence", description: "Query the evidence plane across tasks and approvals" },
        { method: "PATCH", path: "/approvals/:id", description: "Approve or reject a pending action request" },
    ],
    apiLink: { label: "View full API reference", href: "/docs/api-reference" },
    popularTopics: [
        { label: "Connecting GitHub", href: "/docs/quickstart#github" },
        { label: "Installing the Slack app", href: "/docs/quickstart#slack" },
        { label: "Task assignment syntax", href: "/docs/concepts#tasks" },
        { label: "API authentication", href: "/docs/api-reference#auth" },
        { label: "Webhook events", href: "/docs/api-reference#webhooks" },
        { label: "Approval policy configuration", href: "/docs/concepts#approvals" },
    ],
} as const;

export const docsQuickstartContent = {
    metadata: {
        title: "Quickstart - AgentFarm Docs",
        description: "Launch your first AgentFarm worker with governed setup in under 10 minutes.",
    },
    hero: {
        badge: "Getting started",
        title: "Quickstart",
        description: "Launch your first governed AI worker in under 10 minutes.",
    },
    steps: [
        {
            n: "01",
            title: "Create your account",
            paragraphs: [
                "Sign up with a work email and choose the team or workflow you want to start with.",
                "Your onboarding answers help AgentFarm configure sensible defaults for the first worker you deploy.",
            ],
            code: null,
        },
        {
            n: "02",
            id: "github",
            title: "Connect GitHub",
            paragraphs: [
                "From the integrations area, add GitHub and authorize only the repositories the worker should touch.",
                "Repository access can be narrowed or updated later from your GitHub application settings.",
            ],
            code: [
                "# Grant access to specific repos only",
                "Permissions requested:",
                "- Read and write access to selected repositories",
                "- Pull request creation and management",
                "- Actions and CI status read access",
            ],
            aside:
                "Repository scope should stay as narrow as possible so the worker can operate inside the right boundary from the beginning.",
        },
        {
            n: "03",
            id: "slack",
            title: "Install the Slack app (optional)",
            paragraphs: [
                "If your team wants conversational task intake or approval notifications, add the Slack integration during setup.",
            ],
            code: [
                "# Invite the app to a channel",
                "/invite @AgentFarm",
                "",
                "# Assign a task to a worker",
                "@AgentFarm assign investigate the login timeout issue",
            ],
            aside: null,
        },
        {
            n: "04",
            title: "Deploy your first worker",
            paragraphs: [
                "Choose a role, define identity and tool scope, and set an initial approval threshold for the workflow.",
                "Within minutes, the worker is ready to take on its first task with the controls you selected.",
            ],
            code: null,
            aside: null,
        },
        {
            n: "05",
            title: "Assign the first task",
            paragraphs: [
                "Send a real task from the dashboard or API and review how the worker plans, executes, and records the result.",
                "Most bounded tasks of this size complete within minutes with evidence attached for review.",
            ],
            code: [
                "# Example task",
                "Prepare a fix for the /api/users validation path.",
                "Return clear 400 responses for invalid email input.",
                "Add or update tests that prove the behavior.",
            ],
            aside: null,
        },
    ],
    nextCard: {
        title: "Your worker is deployed",
        description:
            "Next, read the concepts guide to understand the execution model or explore the API reference to automate task assignment programmatically.",
    },
} as const;

export const docsConceptsContent = {
    metadata: {
        title: "How Workers Operate - AgentFarm Docs",
        description:
            "Understand AgentFarm's task lifecycle, runtime isolation, approval controls, and working context model.",
    },
    hero: {
        badge: "Core concepts",
        titleLead: "How workers",
        titleAccent: "operate",
        description:
            "A practical mental model for how AgentFarm workers receive tasks, use context, execute inside boundaries, and hand decisions back to people when needed.",
    },
    taskLifecycleTitle: "Task lifecycle",
    taskLifecycleDescription: "Every governed task moves through the same five-stage flow:",
    taskStages: [
        {
            stage: "Receive",
            description:
                "A task is assigned through the dashboard, API, or connector path and the worker acknowledges it quickly.",
        },
        {
            stage: "Plan",
            description:
                "The worker gathers relevant context, evaluates policy, and outlines a bounded execution approach before acting.",
        },
        {
            stage: "Execute",
            description:
                "The task runs inside the allowed environment with tool use, changes, and observations captured as evidence.",
        },
        {
            stage: "Review",
            description:
                "Output, risk, and impact are checked against policy so approvals can be requested when the workflow requires them.",
        },
        {
            stage: "Iterate",
            description:
                "If feedback arrives, the worker adapts, updates the output, and records the new state without losing prior context.",
        },
    ],
    sandboxTitle: "Execution sandbox",
    sandboxDescription: "Each task runs inside a bounded execution model designed for controlled delivery:",
    sandboxItems: [
        "A dedicated execution environment is created for each task instead of sharing mutable task state across workers.",
        "Outbound access is limited to the systems and connectors your workspace explicitly authorizes.",
        "Execution state is reset after task completion so a fresh environment is used for the next run.",
        "Workspace context is loaded intentionally rather than leaving stale task data behind between runs.",
        "Long-running or stalled work can be paused and routed back for review before continuing.",
    ],
    memoryTitle: "Working context",
    memoryDescription: "Workers operate with three practical layers of context:",
    memoryTiers: [
        {
            title: "Workspace context",
            color: "border-blue-200 bg-blue-50",
            items: ["Shared conventions and approved tool access", "Persistent rules for the workspace", "Reusable context available across tasks"],
        },
        {
            title: "Task context",
            color: "border-purple-200 bg-purple-50",
            items: ["Current files, task steps, and intermediate outputs", "Evidence captured during execution", "Cleared when the task completes"],
        },
        {
            title: "Conversation history",
            color: "border-green-200 bg-green-50",
            items: ["Reviewer comments and follow-up guidance", "Slack or portal conversation context", "Retained according to workspace policy"],
        },
    ],
    rulesTitle: "Workspace rules",
    rulesDescription:
        "Teams can define workspace-level rules that shape how every worker should behave across planning, execution, and review.",
    rulesCode: [
        "# .agentfarm/rules.md",
        "",
        "## Working style",
        "- Prefer named exports for new modules",
        "- Keep risky changes behind review-aware rollout steps",
        "- Add tests for new business logic",
        "",
        "## Boundaries",
        "- Do not modify legacy directories without approval",
        "- Never push directly to protected branches",
        "- Escalate before production-impacting changes",
    ],
} as const;

export const docsApiReferenceContent = {
    metadata: {
        title: "REST API Reference - AgentFarm Docs",
        description:
            "API reference for authenticating, launching workers, assigning tasks, and subscribing to governed workflow events.",
    },
    hero: {
        badge: "Reference",
        title: "REST API",
        description: "Programmatically manage workers, tasks, approvals, and workspace behavior.",
    },
    auth: {
        title: "Authentication",
        description:
            "All API requests require a bearer token generated from your workspace settings.",
        code: [
            "# Base URL",
            "https://api.agentfarm.ai/v1",
            "",
            "# Authentication header",
            "Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx",
        ],
        aside:
            "Treat API keys like production credentials. Rotate them from the dashboard if they are exposed or no longer needed.",
    },
    workersTitle: "Workers API",
    workersEndpoints: [
        {
            method: "GET",
            path: "/workers",
            description: "List all deployed workers in your workspace.",
            response: '{ "workers": [{ "id": "wkr_01", "name": "Rex", "role": "backend-dev", "status": "idle" }] }',
        },
        {
            method: "POST",
            path: "/workers",
            description: "Deploy a new worker.",
            body: '{ "name": "Rex", "role": "backend-dev", "repo_ids": ["repo_123"] }',
            response: '{ "worker": { "id": "wkr_01", "status": "provisioning" } }',
        },
        {
            method: "DELETE",
            path: "/workers/:id",
            description: "Retire a worker after in-flight tasks are handled safely.",
            response: '{ "success": true }',
        },
    ],
    tasksTitle: "Tasks API",
    taskEndpoints: [
        {
            method: "POST",
            path: "/tasks",
            description: "Assign a new task to a worker.",
            body: '{ "worker_id": "wkr_01", "repo_id": "repo_123", "description": "Prepare a rate-limit fix for POST /api/users." }',
            response: '{ "task": { "id": "tsk_01", "status": "queued", "estimated_completion": "2026-03-13T12:30:00Z" } }',
        },
        {
            method: "GET",
            path: "/tasks/:id",
            description: "Get current task status, progress, and output references.",
            response: '{ "task": { "id": "tsk_01", "status": "in_progress", "progress": 0.4 } }',
        },
        {
            method: "POST",
            path: "/tasks/:id/cancel",
            description: "Cancel a queued or in-progress task while preserving evidence history.",
            response: '{ "success": true }',
        },
    ],
    webhooks: {
        title: "Webhooks",
        description:
            "Subscribe to lifecycle events over HTTP to keep downstream systems in sync with worker activity.",
        code: [
            "{",
            '  "event": "task.completed",',
            '  "task_id": "tsk_01",',
            '  "worker_id": "wkr_01",',
            '  "duration_seconds": 312,',
            '  "timestamp": "2026-03-13T12:28:44Z"',
            "}",
        ],
        aside:
            "Webhook payloads include an HMAC signature header so your receiving service can verify authenticity before processing events.",
    },
} as const;

const legalIntro =
    "These pages describe the current product posture and operating policies for AgentFarm. They are written to be clear, reviewable, and easy to update as the platform evolves.";

export const privacyPageContent = {
    metadata: {
        title: "Privacy Policy - AgentFarm",
        description: "How AgentFarm collects, uses, stores, and protects information.",
    },
    title: "Privacy Policy",
    updatedAt: "May 26, 2026",
    intro:
        "AgentFarm is committed to handling personal information responsibly. This policy explains what we collect, why we collect it, and the choices available to users and workspace administrators.",
    preface: legalIntro,
    sections: [
        {
            heading: "Information we collect",
            body:
                "We collect account information, workspace configuration details, connector metadata, billing records, and usage signals that help us operate and improve the service. We also store task, approval, and evidence records generated as part of platform activity.",
        },
        {
            heading: "How we use information",
            body:
                "We use collected information to provide the service, secure the platform, support billing and support operations, improve product reliability, and communicate about important account or policy changes.",
        },
        {
            heading: "Security and access",
            body:
                "AgentFarm applies scoped access, transport encryption, runtime isolation, and audit-aware review processes to reduce unnecessary exposure. Access to sensitive operational data should remain limited to authorized personnel with a valid business need.",
        },
        {
            heading: "Connectors and third-party systems",
            body:
                "When customers connect external systems, AgentFarm uses only the access granted through those connector flows. Third-party systems continue to apply their own privacy and security policies to the data they process.",
        },
        {
            heading: "Retention and deletion",
            body:
                "Retention periods can vary by workspace policy, product plan, and operational need. When accounts are deleted or retention windows expire, AgentFarm should remove or anonymize data according to the active policy and legal obligations.",
        },
        {
            heading: "User rights and requests",
            body:
                "Depending on jurisdiction, users may have rights related to access, correction, deletion, portability, or objection. Privacy requests should be routed through the appropriate support or legal contact for review and verification.",
        },
        {
            heading: "Policy changes",
            body:
                "AgentFarm may update this policy as the platform evolves. Material changes should be communicated through product, administrative, or direct notice before they take effect where required.",
        },
        {
            heading: "Contact",
            body:
                "Questions about privacy, data handling, or policy interpretation can be directed to the privacy contact listed by AgentFarm for current customers and prospects.",
        },
    ],
} as const;

export const termsPageContent = {
    metadata: {
        title: "Terms of Service - AgentFarm",
        description: "Terms governing access to and use of the AgentFarm platform.",
    },
    title: "Terms of Service",
    updatedAt: "May 26, 2026",
    intro:
        "These terms describe the rules, responsibilities, and limitations that apply when organizations or individuals access and use AgentFarm.",
    sections: [
        {
            heading: "1. Use of the service",
            body:
                "AgentFarm provides software for launching and governing AI workers. Use of the service must remain within applicable law, contractual obligations, and the policies configured for the relevant workspace.",
        },
        {
            heading: "2. Accounts and administrators",
            body:
                "Account holders and workspace administrators are responsible for maintaining accurate account details, protecting credentials, and managing who can access connected tools and governed workflows.",
        },
        {
            heading: "3. Acceptable use",
            body:
                "Customers may not use AgentFarm to violate law, abuse third-party systems, bypass access controls, distribute malicious content, or direct workers toward clearly prohibited or harmful activity.",
        },
        {
            heading: "4. Customer data and outputs",
            body:
                "Customers retain responsibility for the data, prompts, and business workflows they choose to run through the platform, as well as for reviewing outputs before taking sensitive downstream action.",
        },
        {
            heading: "5. Billing and subscriptions",
            body:
                "Paid access, renewals, and service changes are governed by the applicable order form, plan, or subscription terms in effect for the customer workspace.",
        },
        {
            heading: "6. Availability and changes",
            body:
                "AgentFarm may improve, modify, or retire product capabilities over time. Planned changes should be communicated in a commercially reasonable manner when they materially affect current service usage.",
        },
        {
            heading: "7. Disclaimers",
            body:
                "AI-generated and workflow-generated outputs require customer judgment. AgentFarm does not guarantee that every output will be correct, complete, or suitable for every use case without human review.",
        },
        {
            heading: "8. Liability limits",
            body:
                "Any applicable limitations of liability, indemnity provisions, or warranty carve-outs should be interpreted according to the controlling commercial agreement between AgentFarm and the customer.",
        },
        {
            heading: "9. Suspension and termination",
            body:
                "AgentFarm may suspend or terminate access for material breach, serious security risk, non-payment, or prohibited use, subject to the governing commercial terms where applicable.",
        },
        {
            heading: "10. Contact",
            body:
                "Questions about these terms or their application should be directed to the legal or commercial contact provided by AgentFarm.",
        },
    ],
} as const;

export const cookiesPageContent = {
    metadata: {
        title: "Cookie Policy - AgentFarm",
        description: "How AgentFarm uses cookies, local storage, and similar technologies.",
    },
    title: "Cookie Policy",
    updatedAt: "May 26, 2026",
    intro:
        "This policy explains how AgentFarm uses cookies and related storage technologies to support authentication, product experience, and operational insight.",
    sections: [
        {
            heading: "What cookies are",
            body:
                "Cookies are small pieces of data stored on a browser or device. Similar technologies such as local storage and session storage can also be used to preserve product state or user preferences.",
        },
        {
            heading: "How AgentFarm uses them",
            body:
                "AgentFarm uses cookies and related storage for session continuity, security controls, user preference persistence, and limited product analytics that help improve reliability and usability.",
        },
        {
            heading: "Types of storage in use",
            body:
                "Some storage is strictly necessary for authentication or security. Other storage supports experience preferences such as theme, dismissed notices, or in-progress workflow state that should survive navigation.",
        },
        {
            heading: "Third-party services",
            body:
                "When checkout, analytics, or connected tooling involves third-party services, those systems may apply their own storage mechanisms subject to their own policies.",
        },
        {
            heading: "Managing preferences",
            body:
                "Users can usually control cookies through browser settings and in-product consent controls where available. Disabling strictly necessary cookies may prevent sign-in or core product functionality from working as intended.",
        },
        {
            heading: "Policy updates",
            body:
                "AgentFarm may revise this policy when storage behavior or third-party service use changes in a meaningful way.",
        },
        {
            heading: "Contact",
            body:
                "Questions about cookie usage or consent controls should be directed to the relevant privacy or support contact.",
        },
    ],
} as const;

export const aboutPageContent = {
    metadata: {
        title: "About AgentFarm",
        description:
            "Learn why AgentFarm exists and how we build governed AI workers that increase output without giving up accountability.",
    },
    hero: {
        image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80",
        imageAlt: "AgentFarm team collaborating",
        eyebrow: "Our story",
        titleLead: "We build AI workers that",
        titleAccent: "earn trust before scale",
        description:
            "AgentFarm started from a blunt observation: strong teams are still drowning in repetitive execution. We are building AI workers that can take that layer on without asking teams to accept mystery behavior, weak controls, or governance debt.",
    },
    stats: [
        { value: "2025", label: "Founded" },
        { value: "12+", label: "Specialist worker roles" },
        { value: "<10 min", label: "Median first deployment" },
        { value: "Audit-ready", label: "Evidence on every task" },
    ],
    mission: {
        eyebrow: "Mission",
        title: "AI execution should be useful before it is impressive",
        description:
            "We are not building another chat surface with big promises. We are building a governed execution layer for teams that care about throughput, control, and accountability at the same time.",
        callouts: [
            { value: "10x", label: "More leverage from the same team" },
            { value: "Human-in-loop", label: "Default for meaningful risk" },
        ],
        image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80",
        imageAlt: "Team working together at computers",
        imageCaptionTitle: "Built around operating reality",
        imageCaptionBody: "Scoped access, approvals, and evidence are part of the product, not an afterthought.",
    },
    values: [
        {
            icon: "target",
            title: "Useful over theatrical",
            description:
                "We care less about flashy demos and more about whether a worker can finish bounded, real work that saves the team time this week.",
        },
        {
            icon: "zap",
            title: "Speed with policy",
            description:
                "Fast execution only matters when teams keep control. That is why approvals, boundaries, and role scope are built into every deployment.",
        },
        {
            icon: "users",
            title: "Trust through visibility",
            description:
                "Every important action should be inspectable. Teams need context, evidence, and clean handoffs so AI work stays reviewable.",
        },
    ],
    teamIntro:
        "The team combines product, infrastructure, and workflow experience from companies that learned the hard way how expensive coordination drag can become.",
    team: [
        {
            name: "Alex Rivera",
            role: "CEO & Co-founder",
            bio: "Previously led engineering teams building developer infrastructure and internal platforms for fast-moving product orgs.",
            photo: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=300&q=80",
        },
        {
            name: "Priya Nair",
            role: "CTO & Co-founder",
            bio: "Distributed systems researcher focused on dependable execution, safety controls, and evaluation for autonomous workflows.",
            photo: "https://images.unsplash.com/photo-1573496799515-eebbb63814f2?auto=format&fit=crop&w=300&q=80",
        },
        {
            name: "Jordan Kim",
            role: "Head of Product",
            bio: "Product operator focused on making governed automation feel natural inside the tools teams already use every day.",
            photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80",
        },
        {
            name: "Sam Okafor",
            role: "Head of Engineering",
            bio: "Platform builder focused on isolated runtimes, connector reliability, and clear operational boundaries for worker execution.",
            photo: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80",
        },
    ],
    backers: ["Operator angels", "Infrastructure founders", "Applied AI leaders", "Security-minded builders"],
    cta: {
        title: "Join the next phase",
        description:
            "We work best with teams who are ambitious about automation and stubborn about standards. If that sounds like you, we should talk.",
        primary: { label: "Get early access", href: "/#waitlist" },
        secondary: { label: "Get in touch", href: "/contact" },
    },
} as const;

export const howItWorksPageContent = {
    metadata: {
        title: "How AgentFarm Works",
        description:
            "See how AgentFarm deploys governed AI workers, connects them to real tools, and routes risky actions through review.",
    },
    hero: {
        image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1800&q=80",
        imageAlt: "Engineer working with product dashboards",
        eyebrow: "How it works",
        titleLead: "From setup to first useful output in",
        titleAccent: "under 10 minutes",
        description:
            "AgentFarm fits into the workflow you already run. Choose a role, connect the right tools, define the approval line, and let the worker start with bounded work your team can actually review.",
    },
    timeline: [
        { label: "Choose a role", time: "1 min" },
        { label: "Connect tools and policy", time: "5 min" },
        { label: "Assign the first task", time: "8 min" },
        { label: "Review first output", time: "<15 min" },
    ],
    steps: [
        {
            number: "01",
            icon: "shopping-cart",
            gradient: "from-blue-500 to-blue-600",
            title: "Choose a specialist worker",
            description:
                "Start with a role that maps to the workflow you need help with, such as backend delivery, testing, support triage, or operations follow-through.",
            detail: "Role deployed in minutes",
            image: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&w=900&q=80",
        },
        {
            number: "02",
            icon: "users",
            gradient: "from-violet-500 to-violet-600",
            title: "Define identity and escalation",
            description:
                "Give the worker a name, context, and operating boundary so the rest of the team knows what it owns and when it should ask for help.",
            detail: "Persona and policy set fast",
            image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
        },
        {
            number: "03",
            icon: "link",
            gradient: "from-emerald-500 to-emerald-600",
            title: "Connect the real systems",
            description:
                "Authorize the tools the worker needs such as GitHub, Jira, Slack, email, or internal apps. Access stays scoped to the workflow you intend to automate.",
            detail: "Least-privilege setup by default",
            image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=900&q=80",
        },
        {
            number: "04",
            icon: "message-square",
            gradient: "from-orange-500 to-orange-600",
            title: "Assign work and classify risk",
            description:
                "Tasks can arrive from the dashboard, API, or your team systems. AgentFarm checks policy before the worker acts so low-risk work can flow and sensitive actions can pause.",
            detail: "Execution begins in seconds",
            image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=900&q=80",
        },
        {
            number: "05",
            icon: "check-circle-2",
            gradient: "from-pink-500 to-pink-600",
            title: "Review what matters",
            description:
                "When a task crosses a policy boundary, the worker brings back the change, context, and expected impact so a person can approve quickly.",
            detail: "Approval from the tools you already use",
            image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=80",
        },
        {
            number: "06",
            icon: "bar-chart-3",
            gradient: "from-indigo-500 to-indigo-600",
            title: "Scale with visibility",
            description:
                "Track throughput, approvals, and quality across workers so you know where to expand automation and where human review should stay tighter.",
            detail: "Observability stays built in",
            image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80",
        },
    ],
    cta: {
        title: "Ready to launch the first worker?",
        description:
            "Start with a bounded workflow, watch the review loop do its job, and expand only after the worker proves it belongs in production.",
        primary: { label: "Get started free", href: "/#waitlist" },
    },
} as const;

export const securityPageContent = {
    metadata: {
        title: "Security at AgentFarm",
        description:
            "Review how AgentFarm approaches runtime isolation, access control, approvals, auditability, and compliance readiness.",
    },
    hero: {
        eyebrow: "Security & compliance",
        titleLead: "Built for teams that need",
        titleAccent: "control, not just speed",
        description:
            "AgentFarm is for teams that refuse to trade governance for momentum. Boundaries, approvals, scoped access, and evidence are built into the product because useful automation without control is just a new failure mode.",
        primary: { label: "Start free trial", href: "/signup" },
        secondary: { label: "Contact security team", href: "mailto:security@agentfarm.ai" },
    },
    certificationsTitle: "Certifications & readiness",
    certifications: [
        {
            name: "SOC 2 Type II",
            icon: "shield-check",
            iconBg: "bg-[var(--accent-blue)]/10",
            iconColor: "text-[var(--accent-blue)]",
            description: "Audited annually across security, availability, and confidentiality controls.",
        },
        {
            name: "GDPR",
            icon: "globe",
            iconBg: "bg-violet-500/10",
            iconColor: "text-violet-400",
            description: "Privacy controls and data handling processes aligned to EU data protection requirements.",
        },
        {
            name: "HIPAA Ready",
            icon: "file-lock-2",
            iconBg: "bg-rose-500/10",
            iconColor: "text-rose-400",
            description: "Healthcare-focused controls, audit logging, and encryption posture available for regulated environments.",
        },
        {
            name: "ISO 27001",
            icon: "shield",
            iconBg: "bg-[var(--accent-green)]/10",
            iconColor: "text-[var(--accent-green)]",
            description: "Information security management practices aligned to ISO/IEC 27001 standards.",
        },
    ],
    architectureTitle: "Security architecture",
    architectureSubtitle: "Every layer is built around scoped execution and clean review paths.",
    features: [
        {
            icon: "lock",
            iconBg: "bg-[var(--accent-blue)]/10",
            iconColor: "text-[var(--accent-blue)]",
            title: "Encryption everywhere",
            items: [
                "TLS 1.3 for data in transit",
                "AES-256 encryption at rest",
                "Encrypted credential storage with managed key protection",
                "Routine secret rotation practices",
            ],
        },
        {
            icon: "server",
            iconBg: "bg-violet-500/10",
            iconColor: "text-violet-400",
            title: "Isolated runtimes",
            items: [
                "Per-worker or per-task runtime isolation",
                "Network boundaries between execution environments",
                "Short-lived scoped credentials for task work",
                "Automatic teardown after completion",
            ],
        },
        {
            icon: "eye",
            iconBg: "bg-amber-500/10",
            iconColor: "text-amber-400",
            title: "Full auditability",
            items: [
                "Action records tied to identity, time, and reason",
                "Exportable evidence for reviews and investigations",
                "Tamper-evident operational history",
                "Retention policies aligned to plan and policy",
            ],
        },
        {
            icon: "key-round",
            iconBg: "bg-[var(--accent-green)]/10",
            iconColor: "text-[var(--accent-green)]",
            title: "Identity & access",
            items: [
                "SSO support for team identity providers",
                "Role-based access control for operators and reviewers",
                "MFA and access restriction controls",
                "Configurable workspace-level permissions",
            ],
        },
        {
            icon: "zap",
            iconBg: "bg-rose-500/10",
            iconColor: "text-rose-400",
            title: "Action controls",
            items: [
                "Approval gates by risk level or workflow",
                "Emergency stop for active workers",
                "Scope limits enforced during execution",
                "Policy-aware rollout controls",
            ],
        },
        {
            icon: "refresh-cw",
            iconBg: "bg-[var(--surface-el)]",
            iconColor: "text-[var(--body-color)]",
            title: "Reliability posture",
            items: [
                "Production monitoring and alerting",
                "Backup and recovery procedures",
                "Operational incident response paths",
                "Multi-environment deployment support",
            ],
        },
    ],
    faqs: [
        {
            question: "Does AgentFarm store our source code?",
            answer:
                "Workers use the access you grant at task time. Teams can keep scope narrow and require review before anything sensitive moves forward.",
        },
        {
            question: "Can we revoke access quickly?",
            answer:
                "Yes. Administrators can halt worker activity, revoke credentials, and tighten access boundaries when a workflow or environment changes.",
        },
        {
            question: "How are credentials managed?",
            answer:
                "AgentFarm is designed around scoped access, short-lived task credentials where possible, and centrally managed connector permissions.",
        },
        {
            question: "Can security teams review how a worker acted?",
            answer:
                "Yes. The platform keeps evidence tied to tasks, approvals, and actions so teams can inspect what happened and why.",
        },
    ],
    checklist: {
        eyebrow: "Compliance checklist",
        title: "A practical review pack for security teams",
        description:
            "Use this checklist to evaluate agent deployments with the same discipline you apply to infrastructure, identity, and vendor access reviews.",
        buttonLabel: "Download checklist (PDF)",
        buttonHref: "/docs/security-checklist",
        items: [
            "Data residency and retention expectations",
            "Connector scope and token handling",
            "Approval gate configuration by workflow",
            "Evidence export and audit review paths",
            "RBAC and administrator separation",
            "Incident response contacts and escalation",
            "Vendor questionnaire preparation",
            "DPA and compliance review follow-up",
        ],
    },
    cta: {
        title: "Need a deeper security review?",
        description:
            "If your security team wants to go deeper, we are happy to get specific about architecture, controls, and rollout policy before anything ships.",
        primary: { label: "Contact security team", href: "mailto:security@agentfarm.ai" },
        secondary: { label: "Start free trial", href: "/signup" },
    },
} as const;

export const customersPageContent = {
    metadata: {
        title: "Customer Stories - AgentFarm",
        description:
            "See how teams use AgentFarm to increase throughput, reduce repetitive work, and keep review standards intact.",
    },
    hero: {
        eyebrow: "Customer stories",
        titleLead: "Teams getting more done with",
        titleAccent: "governed AI workers",
        description:
            "From engineering delivery to support operations, teams use AgentFarm when they need more execution capacity but do not want to solve the problem with endless hiring or weaker standards.",
        primary: { label: "Start free trial", href: "/signup" },
    },
    stats: [
        { value: "40-60%", label: "More output shipped per quarter" },
        { value: "8.2x", label: "Faster issue detection and follow-through" },
        { value: "78%", label: "First-pass task acceptance rate" },
        { value: "<10 min", label: "Time to first worker deployment" },
    ],
    logosTitle: "Trusted by teams building with tighter headcount and higher expectations",
    logos: [
        { name: "Acme Corp", initials: "AC" },
        { name: "Verdo AI", initials: "VA" },
        { name: "Stack Labs", initials: "SL" },
        { name: "Qubit IO", initials: "QI" },
        { name: "Folio Inc", initials: "FI" },
        { name: "Nexar", initials: "NX" },
        { name: "PulseDB", initials: "PD" },
        { name: "Crafter", initials: "CF" },
    ],
    caseStudiesTitle: "Real outcomes from bounded, reviewable automation",
    caseStudies: [
        {
            company: "Stack Labs",
            initials: "SL",
            accentBg: "bg-[var(--accent-blue)]/10",
            accentColor: "text-[var(--accent-blue)]",
            tagline: "API platform | 24-person team",
            challenge:
                "A small security team was buried under CVE triage, dependency review, and access-policy follow-up across a growing service footprint.",
            outcome:
                "AgentFarm workers absorbed the repeatable scan-and-remediate loop so human security engineers could focus on architecture and higher-judgment review.",
            metrics: [
                { label: "Detection time", before: "11 days", after: "4 hours" },
                { label: "CVEs resolved / month", before: "8", after: "47" },
                { label: "Triage time", before: "60%", after: "10%" },
            ],
            quote:
                "The value was not just faster scanning. It was getting our strongest people back onto the security work only humans should do.",
            quoteAuthor: "Head of Engineering, Stack Labs",
            pdfLabel: "Stack Labs case study",
        },
        {
            company: "Qubit IO",
            initials: "QI",
            accentBg: "bg-[var(--accent-green)]/10",
            accentColor: "text-[var(--accent-green)]",
            tagline: "Data platform | 11-person team",
            challenge:
                "The team needed a major testing push before due diligence but could not afford to pull product engineers off roadmap work for weeks.",
            outcome:
                "A testing-focused worker expanded coverage rapidly while engineers stayed on feature delivery and only reviewed the work that needed judgment.",
            metrics: [
                { label: "Test coverage", before: "31%", after: "89%" },
                { label: "Tests authored", before: "-", after: "2,400" },
                { label: "Human rework", before: "-", after: "6%" },
            ],
            quote:
                "We met the diligence deadline without freezing roadmap work. That alone changed how we think about capacity planning.",
            quoteAuthor: "CTO, Qubit IO",
            pdfLabel: "Qubit IO case study",
        },
        {
            company: "Verdo AI",
            initials: "VA",
            accentBg: "bg-indigo-500/10",
            accentColor: "text-indigo-400",
            tagline: "ML infrastructure | 19-person team",
            challenge:
                "Sales follow-up and CRM hygiene were slipping because reps were spending too much time on admin instead of actual selling.",
            outcome:
                "A revenue-focused worker automated follow-up, record updates, and meeting prep so the team could keep pipeline coverage high without hiring additional SDRs.",
            metrics: [
                { label: "Pipeline coverage", before: "1x", after: "3x" },
                { label: "Missed follow-ups", before: "~15 / week", after: "0" },
                { label: "Admin time", before: "60%", after: "15%" },
            ],
            quote:
                "The worker handled the coordination layer. Our reps got their time back for the conversations that actually move revenue.",
            quoteAuthor: "VP Sales, Verdo AI",
            pdfLabel: "Verdo AI case study",
        },
    ],
    testimonialsTitle: "What teams are saying",
    testimonials: [
        {
            text: "What changed first was not magic productivity. It was the amount of routine work our humans no longer had to babysit.",
            author: "Staff Engineer",
            company: "Series B SaaS company",
            initials: "SE",
        },
        {
            text: "The approval model made rollout straightforward. We were able to move fast without creating an unreviewable black box.",
            author: "Head of Operations",
            company: "Fintech startup",
            initials: "HO",
        },
        {
            text: "The team started treating the worker like a real operator because it showed work clearly and escalated when it should.",
            author: "CEO",
            company: "Early-stage startup",
            initials: "CE",
        },
    ],
    cta: {
        title: "Ready to add capacity without adding chaos?",
        description:
            "Start with one painful workflow, measure what actually changes, and expand from proof instead of optimism.",
        primary: { label: "Start free trial", href: "/signup" },
        secondary: { label: "Talk to sales", href: "/contact" },
    },
} as const;

export const blogListingContent = {
    metadata: {
        title: "Blog - AgentFarm",
        description:
            "Notes on governed AI workers, execution systems, review loops, and the future of software team operations.",
    },
    hero: {
        image: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1800&q=80",
        imageAlt: "Engineer reading technical content on a laptop",
        eyebrow: "Blog",
        titleLead: "Writing about AI work that has to survive",
        titleAccent: "real teams, real systems, and real review",
        description:
            "We write about the hard part of AI work: making it useful inside real organizations instead of impressive in a demo.",
    },
    featuredLabel: "Featured post",
    allPostsLabel: "All posts",
    trendingSlug: "developer-shortage-2026",
    trendingLabel: "Trending",
    readNowLabel: "Read now ->",
    readLabel: "Read ->",
    postCta: {
        title: "See AgentFarm in action",
        description: "Deploy your first AI worker in under 10 minutes and see what the review loop feels like in practice.",
        buttonLabel: "Start free trial",
        buttonHref: "/signup",
    },
} as const;

export const blogPostsContent = [
    {
        slug: "introducing-agentfarm",
        category: "Product",
        title: "Introducing AgentFarm: Governed AI Workers for Modern Teams",
        excerpt:
            "Why we are building AI workers that can move real work forward while staying inside approval policy, role scope, and reviewable evidence.",
        date: "March 15, 2026",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
        author: { name: "Jane Doe", role: "Co-founder & CEO", initials: "JD" },
        body: [
            "Most teams do not have a thinking problem. They have an execution problem. Valuable people keep getting pulled into repetitive implementation, triage, coordination, and cleanup work that steals time from the hardest decisions.",
            "AgentFarm exists to absorb that repeatable layer without turning the delivery process into a black box. We deploy AI workers with a role, real tool access, and a clear approval model so teams can increase output without relaxing control.",
            "That distinction matters. We are not trying to build a chatbot that occasionally helps with work. We are building workers that can take ownership of bounded tasks, operate in real systems, and surface meaningful actions for review when policy requires it.",
            "From the beginning, we built around three principles: scoped access, approval-aware execution, and evidence on every task. If a worker cannot stay inside those boundaries, it should not be operating in the workflow.",
            "We are starting with the workflows where repetitive work is easiest to identify and easiest to measure: engineering delivery, testing, support operations, and follow-through across internal systems.",
            "The long-term opportunity is larger than automation for its own sake. It is giving strong teams more execution capacity while keeping judgment in the places where judgment still matters most.",
        ],
    },
    {
        slug: "isolated-robot-runtimes",
        category: "Engineering",
        title: "Why Every Worker Needs an Isolated Runtime",
        excerpt:
            "Isolation is not a nice-to-have for autonomous execution. It is the baseline that keeps blast radius, credentials, and review posture manageable.",
        date: "March 10, 2026",
        readTime: "7 min read",
        image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
        author: { name: "Sam Okafor", role: "Head of Infrastructure", initials: "SO" },
        body: [
            "The moment a worker moves from suggesting ideas to taking action, isolation stops being an infrastructure detail and becomes a product requirement.",
            "A shared runtime makes it too easy for credentials, state, or unintended side effects to leak across tasks. That is acceptable for prototypes. It is not acceptable for production workflows.",
            "At AgentFarm, isolation is designed around scope and reset. Workers get only the access required for the current task, and that execution context should disappear cleanly when the work is done.",
            "This helps in three ways. First, it shrinks blast radius if a task goes wrong. Second, it makes evidence easier to interpret because the environment is bounded. Third, it keeps the next task from inheriting stale state that changes behavior in hard-to-debug ways.",
            "There is a cost to this approach. Isolated execution is less efficient than one giant shared pool. But the tradeoff is worth it when the alternative is losing trust in the system the first time something unexpected happens.",
            "We think isolated runtimes will become table stakes for serious autonomous systems in the same way test isolation became table stakes for serious software delivery.",
        ],
    },
    {
        slug: "developer-shortage-2026",
        category: "Insights",
        title: "The Capacity Gap Is Real, and Hiring Alone Will Not Close It",
        excerpt:
            "Teams are being asked to ship more into increasingly complex systems. The math no longer works if headcount is the only way to grow execution capacity.",
        date: "February 28, 2026",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80",
        author: { name: "Priya Nair", role: "Head of Research", initials: "PN" },
        body: [
            "Software teams are caught in a familiar squeeze. Systems keep getting more complex, user expectations keep rising, and every release carries more operational overhead than the one before it.",
            "Hiring still matters, but it does not solve the entire problem. Even well-funded teams cannot always add people fast enough to absorb repetitive delivery work, maintenance chores, or continuous review needs.",
            "That is why the interesting question is no longer whether AI can help individuals write faster. The better question is whether AI can absorb enough of the repeatable execution layer to let a team scale output without scaling headcount at the same rate.",
            "The early signs suggest yes, but only when the work is bounded and the review loop stays intact. Teams get into trouble when they ask for general autonomy before they have policy, scope, and observability in place.",
            "The opportunity is not to replace the people doing the hardest work. It is to protect their time so they can do more of it.",
            "In practice, the winners will be the teams that combine strong humans, explicit review models, and AI workers that know exactly where their boundaries are.",
        ],
    },
    {
        slug: "agentfarm-github-integration",
        category: "Product",
        title: "What a Deep GitHub Integration Actually Needs to Support",
        excerpt:
            "A useful worker does more than open pull requests. It has to operate inside real branch protections, review loops, and organizational expectations.",
        date: "February 20, 2026",
        readTime: "8 min read",
        image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=800&q=80",
        author: { name: "Alex Rivera", role: "Engineering Lead", initials: "AR" },
        body: [
            "GitHub is where a large share of engineering work becomes real. If an AI worker cannot live comfortably inside that environment, it will always feel bolted on.",
            "A serious integration starts with identity and policy. Workers need to respect repository boundaries, branch protections, CI requirements, and reviewer expectations instead of inventing their own process.",
            "From there, the integration has to support an actual feedback loop. A worker should be able to respond to review comments, update a branch cleanly, and show why a change was made rather than force humans to reverse engineer its intent.",
            "This is also where approvals matter. Teams may allow a worker to prepare changes automatically while still requiring a person to merge production-impacting work. That is not a weakness in autonomy. It is a sensible design decision.",
            "The most important lesson is that code generation alone is not the product. The product is a governed path from task intake to merge-ready output.",
            "When that path is clean, the worker starts feeling less like a novelty and more like a reliable contributor inside the team’s existing operating model.",
        ],
    },
    {
        slug: "task-queue-architecture",
        category: "Engineering",
        title: "Designing a Task Queue for Many Specialist Workers",
        excerpt:
            "Routing work across specialist workers sounds straightforward until you care about retries, ordering, scope, and policy-aware concurrency.",
        date: "February 12, 2026",
        readTime: "9 min read",
        image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
        author: { name: "Sam Okafor", role: "Head of Infrastructure", initials: "SO" },
        body: [
            "Task routing gets complicated quickly once different workers have different capabilities, different cost profiles, and different approval requirements.",
            "The queue cannot just assign the next item to the next available worker. It has to understand role fit, urgency, downstream conflicts, and whether two actions can proceed safely in parallel.",
            "We treat capability matching and ordering as first-class concerns. A worker should only see tasks that fit its role and current permissions, and repository- or workflow-level conflicts should be prevented before they become repair work.",
            "Retries are another common failure point. If a task can be retried without clear idempotency, the queue becomes a duplication engine. That is why we design worker tasks to be observable, resumable where possible, and safe to requeue when necessary.",
            "The goal is not elegant scheduling for its own sake. The goal is a queue that keeps useful work moving without forcing humans to untangle preventable collisions later.",
            "As worker fleets grow, this operational discipline matters more than raw model capability.",
        ],
    },
    {
        slug: "measuring-ai-worker-output",
        category: "Engineering",
        title: "How We Evaluate Whether an AI Worker Is Actually Useful",
        excerpt:
            "The right metric is not how impressive a demo looks. It is whether the output survives real review and reduces human follow-up.",
        date: "January 30, 2026",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
        author: { name: "Priya Nair", role: "Head of Research", initials: "PN" },
        body: [
            "A worker becomes valuable when a team trusts it with repeatable work and spends less time cleaning up after it. That sounds obvious, but many AI evaluations still stop at isolated benchmark performance.",
            "We care more about first-pass acceptance, rework severity, time to useful output, and downstream defects than about one-off demonstrations of capability.",
            "First-pass acceptance tells us whether the output arrives close enough to the team’s standards to be worth reviewing. Rework severity tells us whether the miss was cosmetic, functional, or structural. That difference matters.",
            "We also watch how often evidence and summaries are sufficient for a fast review. If reviewers keep opening raw diffs or retracing the whole task, the worker may be producing output but still adding coordination cost.",
            "Quality improves when workers operate inside stable boundaries and accumulate the right task context. It drops when scope is vague, rules are inconsistent, or the workflow expects too much generality.",
            "Useful AI work is measurable. The challenge is choosing metrics that reflect operating reality instead of model theater.",
        ],
    },
    {
        slug: "engineer-time-allocation-2026",
        category: "Insights",
        title: "Where High-Leverage Engineers Still Lose Their Week",
        excerpt:
            "The most expensive people on the team still spend too much time on coordination, cleanup, and repetitive follow-through that does not need their full attention.",
        date: "January 18, 2026",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&q=80",
        author: { name: "Jane Doe", role: "Co-founder & CEO", initials: "JD" },
        body: [
            "Ask senior engineers how they want to spend their time and you will hear some variation of architecture, debugging the hard things, mentoring, and customer-facing decisions.",
            "Ask how they actually spend their time and the answer is usually messier: repetitive code review cleanup, regression follow-up, deployment coordination, status reporting, and a surprising amount of task shepherding.",
            "None of that work is trivial. It just does not always require the most expensive attention on the team. That is the gap governed AI workers can help close.",
            "The key is not to remove humans from the loop entirely. It is to move humans toward review, direction, and exception handling while workers take the first pass on bounded execution.",
            "When teams do this well, high-leverage people regain time for the decisions that compound. When they do it poorly, they just create another layer of output that still needs heavy supervision.",
            "The difference usually comes down to scope, workflow design, and whether the worker can show its work cleanly.",
        ],
    },
    {
        slug: "scale-without-hiring",
        category: "Insights",
        title: "How Teams Scale Output Before They Scale Headcount",
        excerpt:
            "There is a growing gap between the amount of work teams need to ship and the amount of hiring they can justify. AI workers are emerging as one answer.",
        date: "January 5, 2026",
        readTime: "4 min read",
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
        author: { name: "Alex Rivera", role: "Engineering Lead", initials: "AR" },
        body: [
            "For years, the default way to increase output was to add seats. That still works, but it is slow, expensive, and hard to tune precisely to the work that is actually piling up.",
            "What many teams need is not another full hiring cycle. They need more execution capacity on the repeatable parts of the workflow right now.",
            "Governed AI workers create a new option. Teams can add bounded execution to testing, maintenance, support operations, or delivery follow-through without waiting for months of recruiting and onboarding.",
            "This does not eliminate the need for strong people. It increases the leverage of the people already there by protecting them from work that should not consume half their week.",
            "The strongest pattern we see is starting narrow: pick one painful workflow, deploy one worker, measure acceptance and time saved, then expand from evidence rather than enthusiasm.",
            "That sequence matters because capacity is only helpful when the review burden stays manageable as output grows.",
        ],
    },
    {
        slug: "gitops-ai-bots-2026",
        category: "Engineering",
        title: "Why Worker Configuration Should Be Managed Like Infrastructure",
        excerpt:
            "If policy, role scope, and approval rules matter, they belong in a controlled change process rather than scattered across opaque settings.",
        date: "December 20, 2025",
        readTime: "7 min read",
        image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
        author: { name: "Sam Okafor", role: "Head of Infrastructure", initials: "SO" },
        body: [
            "The more responsibility a worker takes on, the more its configuration starts to look like infrastructure rather than application preference.",
            "Role scope, approval thresholds, connector permissions, and operating rules all shape real-world behavior. If those controls are changed casually, the team loses a clean understanding of what the worker is allowed to do.",
            "That is why we like a GitOps-style posture for serious deployments. When configuration changes are versioned, reviewed, and easy to diff, the governance story improves immediately.",
            "This is especially important for approval policy. A silent change that weakens review requirements can undo a lot of otherwise strong architecture.",
            "Treating configuration as code also makes rollback, comparison, and audit review much easier. Those are practical wins, not just philosophical ones.",
            "In the long run, controlled configuration will be one of the biggest differences between toy autonomous systems and production-ready ones.",
        ],
    },
    {
        slug: "security-bots-vs-manual-review",
        category: "Insights",
        title: "AI Security Review Works Best as a Force Multiplier",
        excerpt:
            "The best security posture is not humans or AI. It is continuous automated follow-through paired with human judgment where judgment matters most.",
        date: "December 8, 2025",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
        author: { name: "Priya Nair", role: "Head of Research", initials: "PN" },
        body: [
            "Security teams are rarely short on things to check. They are short on time to keep checking them continuously while still handling design review, incidents, and exception-heavy work.",
            "That makes security a strong candidate for governed AI assistance, especially in areas like dependency review, recurring configuration checks, and first-pass remediation planning.",
            "But the right model is not replacement. AI workers can keep a continuous watch on the repeatable surface area while human security engineers focus on nuanced logic, architecture, and response work.",
            "This division of labor matters because novelty is still where human judgment shines. An autonomous system may be excellent at persistent follow-through and still weak at uncommon business-logic flaws.",
            "The practical outcome is faster detection, less backlog drag, and better use of expensive human expertise when the workflow is designed intentionally.",
            "That is the pattern we think will define the most effective security teams over the next few years.",
        ],
    },
] as const;

export const changelogListingContent = {
    metadata: {
        title: "Changelog - AgentFarm",
        description:
            "Track shipped improvements, platform milestones, and the roadmap shaping governed AI work at AgentFarm.",
    },
    hero: {
        eyebrow: "Changelog",
        titleLead: "What we have shipped.",
        titleAccent: "What we are building next.",
        description:
            "A public record of product progress, major platform decisions, and the roadmap we are confident enough to say out loud.",
    },
    filters: ["All", "Shipped", "In Progress", "Planned"],
    searchPlaceholder: "Search entries...",
    shippedTitle: "Shipped",
    roadmapTitle: "Roadmap",
} as const;

export const changelogEntriesContent = [
    {
        date: "May 2026",
        version: "v1.0",
        versionSlug: "v1-0",
        title: "Marketplace general availability",
        description:
            "The specialist worker marketplace reached general availability with broader discovery, cleaner setup flows, and a stable invoke path for production use.",
        status: "shipped",
        tags: ["Marketplace", "Milestone", "API"],
        summary:
            "General availability for the marketplace made it easier to discover, launch, and operate specialist workers in production workflows.",
        highlights: [
            "Shipped the stable marketplace invoke path for production integrations",
            "Improved role discovery and setup flow for first-time deployments",
            "Documented the supporting platform decisions with updated architecture notes",
        ],
    },
    {
        date: "May 2026",
        version: "v0.9",
        versionSlug: "v0-9",
        title: "Code intelligence and observability expansion",
        description:
            "Added a new wave of developer-focused skills around code explanation, CI visibility, diff preview, semantic search, and approval awareness.",
        status: "shipped",
        tags: ["Skills", "Observability", "Developer"],
        summary:
            "A broad expansion of developer productivity skills improved code understanding, visibility, and review support across the platform.",
        highlights: [
            "Added code intelligence skills for explanation, semantic search, and review prep",
            "Expanded observability around approval status and CI behavior",
            "Improved how workers summarize diffs and contextualize proposed changes",
        ],
    },
    {
        date: "April 2026",
        version: "v0.8",
        versionSlug: "v0-8",
        title: "Developer productivity wave",
        description:
            "Released a new set of execution and remediation skills focused on CI follow-through, dependency upgrades, release notes, and incident patch planning.",
        status: "shipped",
        tags: ["Skills", "Productivity", "Tier 9"],
        summary:
            "This release made it easier for workers to support the repeatable engineering chores that usually interrupt product work.",
        highlights: [
            "Shipped skills for CI checks, test-failure follow-up, and dependency upgrade planning",
            "Improved release note generation and incident patch preparation flows",
            "Expanded worker coverage for day-to-day engineering support work",
        ],
    },
    {
        date: "April 2026",
        version: "v0.7",
        versionSlug: "v0-7",
        title: "Isolated runtime lifecycle improvements",
        description:
            "Strengthened isolated runtime management with clearer provisioning, health monitoring, and teardown behavior for dedicated execution environments.",
        status: "shipped",
        tags: ["Infrastructure", "Runtime", "Azure"],
        summary:
            "Runtime isolation became more reliable with better lifecycle management and stronger operational visibility.",
        highlights: [
            "Improved provisioning and health monitoring for isolated worker environments",
            "Tightened teardown and recovery behavior after task completion",
            "Expanded evidence capture around runtime actions and state changes",
        ],
    },
    {
        date: "April 2026",
        version: "v0.6",
        versionSlug: "v0-6",
        title: "Connector authentication foundation",
        description:
            "Expanded OAuth-based connector support across GitHub, Jira, Teams, and email with refresh handling and tighter scope management.",
        status: "shipped",
        tags: ["Connectors", "Auth", "OAuth"],
        summary:
            "This release strengthened the base connector model so workers could operate in real systems with more dependable access control.",
        highlights: [
            "Added OAuth connector flows for core collaboration and delivery systems",
            "Improved token refresh behavior and health monitoring",
            "Strengthened least-privilege connector scope handling",
        ],
    },
    {
        date: "March 2026",
        version: "v0.5",
        versionSlug: "v0-5",
        title: "Approval workflow and risk classification",
        description:
            "Introduced explicit risk tiers so low-risk work can flow automatically while more sensitive actions pause for human review.",
        status: "shipped",
        tags: ["Approvals", "Safety", "Core"],
        summary:
            "Risk classification established the review backbone for governed AI work across the platform.",
        highlights: [
            "Added low, medium, and high-risk action classification",
            "Enabled approval routing through collaboration channels",
            "Created a cleaner audit trail for governed decisions",
        ],
    },
    {
        date: "March 2026",
        version: "v0.4",
        versionSlug: "v0-4",
        title: "Unified dashboard and provisioning service",
        description:
            "Launched the central workspace for task assignment, approvals, and role management alongside improved worker provisioning flows.",
        status: "shipped",
        tags: ["Dashboard", "Provisioning"],
        summary:
            "The dashboard became the control plane for managing workers, approvals, and workspace setup in one place.",
        highlights: [
            "Unified task, approval, and worker visibility into one dashboard",
            "Improved provisioning flow for new worker deployments",
            "Created a cleaner control surface for day-to-day operator work",
        ],
    },
    {
        date: "June 2026",
        title: "Knowledge-aware support workflows",
        description:
            "In progress: support-focused workers that can pull from approved docs and prior resolutions before drafting a response or escalation.",
        status: "in-progress",
        tags: ["Support", "Knowledge", "In Progress"],
    },
    {
        date: "Q3 2026",
        title: "GitLab connector",
        description:
            "Planned support for merge requests, issues, and pipeline awareness so teams outside GitHub can run the same governed delivery loops.",
        status: "planned",
        tags: ["Integration", "GitLab"],
    },
    {
        date: "Q3 2026",
        title: "Confluence and Linear connectors",
        description:
            "Planned connectors for documentation context, issue sync, and workflow support for teams outside the current collaboration stack.",
        status: "planned",
        tags: ["Integration", "Confluence", "Linear"],
    },
    {
        date: "Q3 2026",
        title: "Team accounts and shared policy controls",
        description:
            "Planned multi-user workspace management with shared policy, role-based administration, and approval configuration for larger teams.",
        status: "planned",
        tags: ["Teams", "Enterprise", "Governance"],
    },
    {
        date: "Q4 2026",
        title: "SSO and lifecycle provisioning",
        description:
            "Planned support for enterprise identity flows, single sign-on, and lifecycle provisioning through common identity providers.",
        status: "planned",
        tags: ["Enterprise", "Identity"],
    },
    {
        date: "Q4 2026",
        title: "Private deployment options",
        description:
            "Planned deployment paths for teams that need stricter residency, network control, or more isolated runtime boundaries.",
        status: "planned",
        tags: ["Enterprise", "Infrastructure"],
    },
] as const;
