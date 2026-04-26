import { catalogueBots } from './bots-catalogue';

export type BotDepartment =
    | "Engineering"
    | "DevOps & Infrastructure"
    | "Quality & Testing"
    | "Security"
    | "Data & Analytics"
    | "Product"
    | "Design"
    | "Documentation"
    | "IT & Support"
    | "Marketing"
    | "HR & Talent"
    | "Finance"
    | "Customer Success"
    | "Operations"
    | "Sales"
    // â€” New departments from repo â€”
    | "Creative"
    | "Business Operations"
    | "Compliance & Security"
    | "E-Commerce"
    | "Legal"
    | "Healthcare"
    | "Real Estate"
    | "Supply Chain"
    | "Education"
    | "Automation"
    | "Productivity"
    | "Personal"
    | "Voice & Communication";

export type Bot = {
    slug: string;
    name: string;
    tagline: string;
    description: string;
    longDescription: string;
    skills: string[];
    useCases: string[];
    integrations: string[];
    price: string;
    priceMonthly: number; // numeric for sorting
    plan: "Starter+" | "Pro+" | "Enterprise";
    color: BotColor;
    department: BotDepartment;
    available: boolean;
};

export type BotColor =
    | "blue"
    | "purple"
    | "green"
    | "orange"
    | "teal"
    | "red"
    | "indigo"
    | "pink"
    | "cyan"
    | "slate"
    | "violet"
    | "emerald"
    | "amber"
    | "yellow"
    | "sky"
    | "rose";

export const colorMap: Record<
    BotColor,
    { bg: string; icon: string; badge: string; border: string }
> = {
    blue: {
        bg: "bg-blue-50 dark:bg-blue-950",
        icon: "text-blue-600",
        badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        border: "border-blue-200 dark:border-blue-800",
    },
    purple: {
        bg: "bg-purple-50 dark:bg-purple-950",
        icon: "text-purple-600",
        badge:
            "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
        border: "border-purple-200 dark:border-purple-800",
    },
    green: {
        bg: "bg-green-50 dark:bg-green-950",
        icon: "text-green-600",
        badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
        border: "border-green-200 dark:border-green-800",
    },
    orange: {
        bg: "bg-orange-50 dark:bg-orange-950",
        icon: "text-orange-600",
        badge:
            "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
        border: "border-orange-200 dark:border-orange-800",
    },
    teal: {
        bg: "bg-teal-50 dark:bg-teal-950",
        icon: "text-teal-600",
        badge: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
        border: "border-teal-200 dark:border-teal-800",
    },
    red: {
        bg: "bg-red-50 dark:bg-red-950",
        icon: "text-red-600",
        badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        border: "border-red-200 dark:border-red-800",
    },
    indigo: {
        bg: "bg-indigo-50 dark:bg-indigo-950",
        icon: "text-indigo-600",
        badge:
            "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
        border: "border-indigo-200 dark:border-indigo-800",
    },
    pink: {
        bg: "bg-pink-50 dark:bg-pink-950",
        icon: "text-pink-600",
        badge: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
        border: "border-pink-200 dark:border-pink-800",
    },
    cyan: {
        bg: "bg-cyan-50 dark:bg-cyan-950",
        icon: "text-cyan-600",
        badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
        border: "border-cyan-200 dark:border-cyan-800",
    },
    slate: {
        bg: "bg-slate-100 dark:bg-slate-800",
        icon: "text-slate-600 dark:text-slate-400",
        badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
        border: "border-slate-200 dark:border-slate-700",
    },
    violet: {
        bg: "bg-violet-50 dark:bg-violet-950",
        icon: "text-violet-600",
        badge: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
        border: "border-violet-200 dark:border-violet-800",
    },
    emerald: {
        bg: "bg-emerald-50 dark:bg-emerald-950",
        icon: "text-emerald-600",
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        border: "border-emerald-200 dark:border-emerald-800",
    },
    amber: {
        bg: "bg-amber-50 dark:bg-amber-950",
        icon: "text-amber-600",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800",
    },
    yellow: {
        bg: "bg-yellow-50 dark:bg-yellow-950",
        icon: "text-yellow-600",
        badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
        border: "border-yellow-200 dark:border-yellow-800",
    },
    sky: {
        bg: "bg-sky-50 dark:bg-sky-950",
        icon: "text-sky-600",
        badge: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
        border: "border-sky-200 dark:border-sky-800",
    },
    rose: {
        bg: "bg-rose-50 dark:bg-rose-950",
        icon: "text-rose-600",
        badge: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-800",
    },
};

export const DEPARTMENTS: BotDepartment[] = [
    "Engineering",
    "DevOps & Infrastructure",
    "Quality & Testing",
    "Security",
    "Compliance & Security",
    "Data & Analytics",
    "Product",
    "Design",
    "Documentation",
    "IT & Support",
    "Marketing",
    "Creative",
    "HR & Talent",
    "Finance",
    "Customer Success",
    "Operations",
    "Sales",
    "Business Operations",
    "E-Commerce",
    "Legal",
    "Healthcare",
    "Real Estate",
    "Supply Chain",
    "Education",
    "Automation",
    "Productivity",
    "Personal",
    "Voice & Communication",
];

export const bots: Bot[] = [
    // â”€â”€â”€ Engineering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-backend-developer",
        name: "AI Backend Developer",
        tagline: "REST APIs, business logic, DB migrations",
        description:
            "Implements features end-to-end, writes API endpoints, manages database schemas, and reviews backend PRs with deep codebase context.",
        longDescription:
            "The AI Backend Developer understands your entire codebase and autonomously implements server-side features from ticket to merged PR. It writes clean, tested Node.js or Python code, designs RESTful and GraphQL APIs, handles database migrations with zero downtime, and leaves detailed code-review comments when it spots issues in other PRs. It integrates with your existing CI pipeline and never ships code that breaks the test suite.",
        skills: ["Node.js", "Python", "PostgreSQL", "REST", "GraphQL"],
        useCases: [
            "Implement new CRUD endpoints from a Jira ticket",
            "Write and run database migrations",
            "Review backend PRs for security and performance",
            "Refactor legacy service code with full test coverage",
        ],
        integrations: ["GitHub", "GitLab", "Jira", "Linear", "Slack", "PostgreSQL", "MySQL"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "blue",
        department: "Engineering",
        available: true,
    },
    {
        slug: "ai-frontend-developer",
        name: "AI Frontend Developer",
        tagline: "React components, UI bugs, performance",
        description:
            "Builds accessible React and Next.js components, resolves UI regression bugs, writes Storybook stories, and optimises Core Web Vitals.",
        longDescription:
            "The AI Frontend Developer turns Figma designs and ticket descriptions into pixel-perfect, accessible React components. It uses TypeScript strict mode, writes Storybook stories automatically, and runs Lighthouse audits to catch performance regressions before they merge. It understands your design system tokens and never introduces style drift.",
        skills: ["React", "TypeScript", "Tailwind", "Next.js", "Storybook"],
        useCases: [
            "Build new UI components from design mockups",
            "Fix accessibility and WCAG violations",
            "Optimise Core Web Vitals and bundle size",
            "Write Storybook stories for the component library",
        ],
        integrations: ["GitHub", "Figma", "Storybook", "Vercel", "Netlify", "Linear"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "purple",
        department: "Engineering",
        available: true,
    },
    {
        slug: "ai-qa-engineer",
        name: "AI QA Engineer",
        tagline: "Unit, integration & E2E test coverage",
        description:
            "Writes comprehensive test suites from scratch or expands existing coverage. Runs regression checks on every PR automatically.",
        longDescription:
            "The AI QA Engineer analyses your codebase and incrementally improves test coverage â€” writing unit tests with Jest/Vitest, integration tests via Testing Library, and full E2E flows with Playwright or Cypress. It runs on every PR, catches regressions before they hit production, and generates coverage reports that trend upward every sprint.",
        skills: ["Jest", "Playwright", "Cypress", "Testing Library", "Vitest"],
        useCases: [
            "Raise unit test coverage from 40% to 80%",
            "Write E2E flows for critical checkout paths",
            "Block PRs that introduce regressions",
            "Generate weekly coverage trend reports",
        ],
        integrations: ["GitHub Actions", "CircleCI", "Jest", "Playwright", "Cypress", "Codecov"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "green",
        department: "Quality & Testing",
        available: true,
    },
    {
        slug: "ai-devops-engineer",
        name: "AI DevOps Engineer",
        tagline: "CI/CD, IaC, incident response",
        description:
            "Manages Kubernetes clusters, writes Terraform modules, maintains GitHub Actions pipelines, and auto-responds to on-call incidents.",
        longDescription:
            "The AI DevOps Engineer owns your infrastructure as code. It writes Terraform modules, manages Kubernetes deployments, keeps GitHub Actions pipelines green, and responds to PagerDuty incidents by diagnosing root causes and drafting runbooks. It shrinks mean-time-to-recovery by correlating logs, metrics, and traces automatically.",
        skills: ["Docker", "Kubernetes", "Terraform", "GitHub Actions", "AWS"],
        useCases: [
            "Migrate infra to Terraform from click-ops",
            "Reduce pipeline build times by 50%",
            "Auto-create incident runbooks from alerts",
            "Manage Kubernetes autoscaling policies",
        ],
        integrations: [
            "GitHub Actions",
            "AWS",
            "GCP",
            "Terraform",
            "Kubernetes",
            "PagerDuty",
            "Datadog",
        ],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "orange",
        department: "DevOps & Infrastructure",
        available: true,
    },
    {
        slug: "ai-database-administrator",
        name: "AI Database Administrator",
        tagline: "Schema design, query optimisation",
        description:
            "Audits slow queries, designs normalised schemas, writes migrations, and monitors index health across PostgreSQL and MySQL.",
        longDescription:
            "The AI DBA continuously monitors your database health, catches N+1 queries in PRs, proposes index strategies, and writes zero-downtime migration scripts. It generates ER-diagram diffs so schema changes are always reviewed visually, and alerts on table bloat before it becomes an incident.",
        skills: ["PostgreSQL", "MySQL", "Redis", "Query Tuning", "Migrations"],
        useCases: [
            "Identify and fix the top 10 slow queries",
            "Design a normalised schema for a new domain",
            "Write zero-downtime migration scripts",
            "Monitor index bloat and reindex automatically",
        ],
        integrations: ["PostgreSQL", "MySQL", "Redis", "Datadog", "pganalyze", "GitHub"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "teal",
        department: "Engineering",
        available: true,
    },
    {
        slug: "ai-security-engineer",
        name: "AI Security Engineer",
        tagline: "OWASP audits, dependency scanning",
        description:
            "Scans pull requests for OWASP Top 10 vulnerabilities, keeps dependencies up to date, and writes security test cases.",
        longDescription:
            "The AI Security Engineer reviews every PR for injection flaws, broken access control, cryptographic failures, and all other OWASP Top 10 risks. It runs Snyk and Semgrep in CI, auto-opens PRs for vulnerable dependencies, and writes proof-of-concept security tests to verify fixes. Security debt shrinks sprint over sprint.",
        skills: ["OWASP", "Snyk", "Semgrep", "Dependency Auditing", "Pen Testing"],
        useCases: [
            "Block PRs with SQL injection or XSS vectors",
            "Auto-upgrade vulnerable npm/pip packages",
            "Generate OWASP Top 10 compliance report",
            "Write security regression tests for past CVEs",
        ],
        integrations: ["GitHub", "Snyk", "Semgrep", "JIRA", "Slack", "Dependabot"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "red",
        department: "Security",
        available: true,
    },
    {
        slug: "ai-data-engineer",
        name: "AI Data Engineer",
        tagline: "ETL pipelines, data quality, analytics",
        description:
            "Builds and maintains data pipelines, writes dbt models, monitors data quality, and automates analytics reporting.",
        longDescription:
            "The AI Data Engineer owns your data platform â€” building Airflow DAGs, writing dbt transformation models, and running Great Expectations data quality checks on every pipeline run. It auto-generates data dictionaries, alerts on schema drift, and backfills historical data when upstream sources change.",
        skills: ["Python", "dbt", "Airflow", "Spark", "BigQuery"],
        useCases: [
            "Build a dbt model for the revenue dashboard",
            "Monitor pipeline SLA and alert on failures",
            "Backfill 6 months of historical event data",
            "Auto-generate data dictionary from schema",
        ],
        integrations: ["BigQuery", "Snowflake", "dbt", "Airflow", "Redshift", "Looker"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "indigo",
        department: "Data & Analytics",
        available: true,
    },
    {
        slug: "ai-ml-engineer",
        name: "AI ML Engineer",
        tagline: "Model training, evaluation, deployment",
        description:
            "Fine-tunes models, writes training scripts, evaluates performance metrics, and manages model deployment on cloud infra.",
        longDescription:
            "The AI ML Engineer handles the full model lifecycle. It writes PyTorch training scripts, tracks experiments in MLflow, evaluates models on held-out test sets, converts to ONNX for fast inference, and deploys behind a FastAPI endpoint. It monitors model drift in production and triggers retraining automatically when accuracy degrades.",
        skills: ["PyTorch", "HuggingFace", "MLflow", "FastAPI", "ONNX"],
        useCases: [
            "Fine-tune an LLM on custom domain data",
            "Set up automated retraining on data drift",
            "Deploy a model behind a REST API",
            "Track and compare experiments in MLflow",
        ],
        integrations: ["AWS SageMaker", "GCP Vertex AI", "MLflow", "HuggingFace Hub", "W&B"],
        price: "$199/mo",
        priceMonthly: 199,
        plan: "Enterprise",
        color: "pink",
        department: "Data & Analytics",
        available: false,
    },
    {
        slug: "ai-technical-writer",
        name: "AI Technical Writer",
        tagline: "API docs, READMEs, changelogs",
        description:
            "Auto-generates API documentation, writes README files from code, maintains changelogs, and keeps docs in sync with the codebase.",
        longDescription:
            "The AI Technical Writer monitors your codebase and keeps documentation perpetually up to date. It generates OpenAPI specs from route handlers, writes README files that accurately reflect the current code, maintains CHANGELOG.md from commit history, and drafts guides in Docusaurus or Mintlify. Docs lag is eliminated permanently.",
        skills: ["Markdown", "OpenAPI", "Docusaurus", "JSDoc", "Mintlify"],
        useCases: [
            "Generate OpenAPI spec from Express routes",
            "Write README from scratch for a new service",
            "Maintain CHANGELOG.md from git commits",
            "Keep Docusaurus docs in sync with code",
        ],
        integrations: ["GitHub", "Mintlify", "Docusaurus", "Swagger", "Notion", "Confluence"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "cyan",
        department: "Documentation",
        available: true,
    },
    {
        slug: "ai-code-reviewer",
        name: "AI Code Reviewer",
        tagline: "PR reviews, code quality, standards",
        description:
            "Reviews every pull request for bugs, anti-patterns, security issues, and style violations. Leaves actionable inline comments.",
        longDescription:
            "The AI Code Reviewer is the consistent senior engineer your team never has bandwidth for. It reviews every PR within minutes, leaves inline comments with concrete fix suggestions, enforces your style guide automatically, and escalates critical security or logic bugs to a human reviewer. It never gets tired, never misses a PR, and improves your codebase quality sprint over sprint.",
        skills: ["Code Analysis", "Best Practices", "Security", "Style Guides", "Refactoring"],
        useCases: [
            "Review 100% of PRs for style guide compliance",
            "Catch logic bugs before they reach staging",
            "Enforce consistent naming across the codebase",
            "Escalate security issues to senior engineers",
        ],
        integrations: ["GitHub", "GitLab", "Bitbucket", "Linear", "Jira", "Slack"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "slate",
        department: "Engineering",
        available: true,
    },

    // â”€â”€â”€ Engineering (new) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-mobile-developer",
        name: "AI Mobile Developer",
        tagline: "iOS, Android & React Native apps",
        description:
            "Builds and maintains iOS and Android apps with React Native or native Swift/Kotlin, writes tests, and handles App Store release automation.",
        longDescription:
            "The AI Mobile Developer implements screens from Figma specs, integrates REST and GraphQL APIs, handles push notifications, deep-links, and manages app releases through fastlane. It writes UI tests with Detox or XCUITest, keeps dependencies updated, and enforces accessibility on every component.",
        skills: ["React Native", "Swift", "Kotlin", "Expo", "Fastlane"],
        useCases: [
            "Build new screens from Figma mockups",
            "Integrate REST APIs with offline caching",
            "Automate iOS & Android release pipelines",
            "Write Detox E2E tests for critical flows",
        ],
        integrations: ["GitHub", "Figma", "Fastlane", "Firebase", "App Store Connect", "Google Play"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "blue",
        department: "Engineering",
        available: false,
    },
    {
        slug: "ai-full-stack-developer",
        name: "AI Full-Stack Developer",
        tagline: "End-to-end feature delivery, front and back",
        description:
            "Implements features across the full stack â€” from React UI through REST API to database migration â€” in a single coherent PR.",
        longDescription:
            "The AI Full-Stack Developer owns complete features end-to-end. It writes the React component, the Next.js API route, the Prisma migration, and the test suite in one focused PR. It understands your existing code patterns and produces consistent, maintainable code without context-switching delays.",
        skills: ["Next.js", "React", "Node.js", "TypeScript", "Prisma"],
        useCases: [
            "Implement a user settings page with API",
            "Build a notifications system end-to-end",
            "Migrate a legacy page to modern stack",
            "Write integration tests across front and back",
        ],
        integrations: ["GitHub", "Vercel", "Linear", "Jira", "PostgreSQL", "Slack"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "indigo",
        department: "Engineering",
        available: false,
    },
    {
        slug: "ai-platform-engineer",
        name: "AI Platform Engineer",
        tagline: "Internal developer tooling & golden paths",
        description:
            "Builds and maintains internal platforms, service templates, developer CLIs, and shared libraries that increase team velocity.",
        longDescription:
            "The AI Platform Engineer reduces toil for all engineering teams. It creates service templates, maintains shared CI/CD workflows, builds internal CLIs, and writes the glue code that ties your platform together. It enforces standards without blocking velocity â€” the golden path is always the easiest path.",
        skills: ["Go", "Python", "Backstage", "GitHub Actions", "Docker"],
        useCases: [
            "Create a new service scaffolding CLI",
            "Build a shared GitHub Actions workflow library",
            "Maintain Backstage service catalog",
            "Standardise logging and telemetry across services",
        ],
        integrations: ["GitHub", "Backstage", "Datadog", "PagerDuty", "Slack", "Confluence"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "slate",
        department: "Engineering",
        available: false,
    },

    // â”€â”€â”€ DevOps & Infrastructure (new) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-cloud-architect",
        name: "AI Cloud Architect",
        tagline: "AWS / GCP / Azure architecture design",
        description:
            "Designs cost-optimised, secure cloud architectures, writes Terraform modules end-to-end, and enforces cloud governance policies.",
        longDescription:
            "The AI Cloud Architect translates business requirements into production-grade AWS, GCP, or Azure architectures. It produces Terraform modules, architecture decision records (ADRs), cost estimates, and security reviews. It continuously audits your cloud spend and flags over-provisioned resources automatically.",
        skills: ["AWS", "GCP", "Azure", "Terraform", "CDK"],
        useCases: [
            "Design a multi-region HA architecture",
            "Write Terraform for a new microservice stack",
            "Audit cloud costs and right-size resources",
            "Produce architecture decision records",
        ],
        integrations: ["AWS", "GCP", "Azure", "Terraform Cloud", "Infracost", "GitHub"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "orange",
        department: "DevOps & Infrastructure",
        available: false,
    },
    {
        slug: "ai-site-reliability-engineer",
        name: "AI Site Reliability Engineer",
        tagline: "SLOs, observability, incident post-mortems",
        description:
            "Defines and tracks SLOs, builds alerting rules, writes post-mortem documents, and proactively reduces error-budget burn.",
        longDescription:
            "The AI SRE keeps production reliable. It defines SLIs and SLOs for every service, configures Prometheus/Datadog alerting rules, writes runbooks, and produces detailed post-mortems after every incident. It proactively identifies error-budget burn trends and files tickets before reliability degrades.",
        skills: ["Prometheus", "Datadog", "SLO/SLI", "OpenTelemetry", "PagerDuty"],
        useCases: [
            "Define SLOs for all production services",
            "Build a Prometheus alerting rule library",
            "Write post-mortem for a production incident",
            "Reduce on-call noise by 60% with alert tuning",
        ],
        integrations: ["Datadog", "PagerDuty", "Prometheus", "Grafana", "GitHub", "Slack"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "teal",
        department: "DevOps & Infrastructure",
        available: false,
    },

    // â”€â”€â”€ Quality & Testing (new) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-performance-engineer",
        name: "AI Performance Engineer",
        tagline: "Load testing, profiling & benchmarks",
        description:
            "Runs load tests with k6 or Locust, profiles bottlenecks, and delivers concrete performance improvements PR by PR.",
        longDescription:
            "The AI Performance Engineer systematically improves your system's speed and capacity. It writes k6 load-test scripts, runs profiling sessions on hot paths, identifies database and cache bottlenecks, and opens PRs that demonstrably reduce p99 latency. Every change is benchmarked before and after.",
        skills: ["k6", "Locust", "Flame Graphs", "Lighthouse", "WebPageTest"],
        useCases: [
            "Run a load test simulating 10k concurrent users",
            "Profile and fix the slowest 5 API endpoints",
            "Optimise Lighthouse score from 60 to 95",
            "Identify and resolve N+1 query patterns",
        ],
        integrations: ["k6 Cloud", "Datadog", "GitHub", "AWS", "Lighthouse CI", "Grafana"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "green",
        department: "Quality & Testing",
        available: false,
    },

    // â”€â”€â”€ Security (new) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-compliance-engineer",
        name: "AI Compliance Engineer",
        tagline: "SOC 2, GDPR & ISO 27001 controls",
        description:
            "Maps controls to evidence, drafts policies, tracks audit readiness, and keeps your compliance posture current automatically.",
        longDescription:
            "The AI Compliance Engineer makes SOC 2 and GDPR readiness continuous, not a once-a-year scramble. It maps technical controls to evidence sources, auto-collects audit artifacts, drafts and updates security policies, and alerts when control drift is detected. Auditors get a clean evidence package every time.",
        skills: ["SOC 2", "GDPR", "ISO 27001", "Vanta", "Policy Writing"],
        useCases: [
            "Map all SOC 2 Type II controls to evidence",
            "Draft GDPR data-processing agreements",
            "Track and close compliance gaps weekly",
            "Prepare evidence package for annual audit",
        ],
        integrations: ["Vanta", "Drata", "GitHub", "Google Workspace", "AWS", "Notion"],
        price: "$199/mo",
        priceMonthly: 199,
        plan: "Enterprise",
        color: "red",
        department: "Security",
        available: false,
    },

    // â”€â”€â”€ Data & Analytics (new) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-data-analyst",
        name: "AI Data Analyst",
        tagline: "SQL analysis, dashboards & ad-hoc reports",
        description:
            "Answers business questions with SQL, builds Looker or Metabase dashboards, and maintains weekly automated reports for leadership.",
        longDescription:
            "The AI Data Analyst turns raw data into decisions. It writes optimised SQL queries, builds interactive dashboards, maintains automated weekly reports, and proactively surfaces anomalies in your KPIs. When stakeholders ask 'why did revenue drop last Tuesday?', the AI Data Analyst already has the answer.",
        skills: ["SQL", "Looker", "Metabase", "dbt", "BigQuery"],
        useCases: [
            "Build a weekly revenue metrics dashboard",
            "Answer ad-hoc data questions from stakeholders",
            "Create automated monthly KPI reports",
            "Alert on anomalies in conversion funnel",
        ],
        integrations: ["BigQuery", "Snowflake", "Looker", "Metabase", "Slack", "Notion"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "cyan",
        department: "Data & Analytics",
        available: false,
    },
    {
        slug: "ai-data-scientist",
        name: "AI Data Scientist",
        tagline: "Statistical modelling & hypothesis testing",
        description:
            "Designs and runs A/B experiments, builds predictive models, and translates statistical results into actionable product decisions.",
        longDescription:
            "The AI Data Scientist brings rigorous statistical thinking to your product. It designs A/B tests with correct power calculations, builds regression and classification models, validates results for statistical significance, and produces clear executive summaries that drive product decisions without requiring a PhD to interpret.",
        skills: ["Python", "R", "A/B Testing", "Scikit-learn", "Statistics"],
        useCases: [
            "Design and analyse an A/B pricing experiment",
            "Build a churn prediction model",
            "Validate causal impact of a product change",
            "Produce weekly experimentation reports",
        ],
        integrations: ["Snowflake", "BigQuery", "MLflow", "Jupyter", "Slack", "GitHub"],
        price: "$199/mo",
        priceMonthly: 199,
        plan: "Enterprise",
        color: "purple",
        department: "Data & Analytics",
        available: false,
    },
    {
        slug: "ai-bi-engineer",
        name: "AI BI Engineer",
        tagline: "Data warehouse, Looker & Tableau builds",
        description:
            "Designs and maintains the BI layer â€” semantic models, data marts, LookML views, and Tableau workbooks that always reflect current data.",
        longDescription:
            "The AI BI Engineer bridges the gap between raw warehouse tables and the charts executives rely on. It builds normalised dimensional models, writes LookML or Tableau calculated fields, maintains data freshness SLAs, and documents every metric definition so there is one source of truth.",
        skills: ["LookML", "Tableau", "Redshift", "Snowflake", "dbt"],
        useCases: [
            "Build a self-serve sales performance dashboard",
            "Create a dimensional model for the finance team",
            "Maintain metric definitions across 3 BI tools",
            "Set up daily data freshness monitoring",
        ],
        integrations: ["Looker", "Tableau", "Snowflake", "Redshift", "dbt", "Slack"],
        price: "$149/mo",
        priceMonthly: 149,
        plan: "Pro+",
        color: "indigo",
        department: "Data & Analytics",
        available: false,
    },

    // â”€â”€â”€ Product â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-product-manager",
        name: "AI Product Manager",
        tagline: "PRDs, sprint planning & roadmap docs",
        description:
            "Writes product requirements documents, breaks epics into user stories, and keeps your roadmap and backlog groomed automatically.",
        longDescription:
            "The AI Product Manager eliminates documentation debt. It writes detailed PRDs from stakeholder briefs, breaks them into Jira epics and stories with acceptance criteria, maintains the roadmap in Notion or Confluence, and generates weekly progress reports. Engineers always know what to build and why.",
        skills: ["PRD Writing", "User Stories", "Jira", "Roadmapping", "Stakeholder Mgmt"],
        useCases: [
            "Write a PRD for a new checkout flow",
            "Break an epic into sprint-ready user stories",
            "Maintain a 3-quarter product roadmap",
            "Generate weekly product progress reports",
        ],
        integrations: ["Jira", "Linear", "Notion", "Confluence", "Slack", "Figma"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "green",
        department: "Product",
        available: false,
    },
    {
        slug: "ai-business-analyst",
        name: "AI Business Analyst",
        tagline: "Requirements, process flows & gap analysis",
        description:
            "Elicits and documents business requirements, maps as-is vs to-be processes, and produces gap analyses that align tech with business goals.",
        longDescription:
            "The AI Business Analyst ensures engineering always builds the right thing. It conducts structured requirements elicitation, produces BPMN process flow diagrams, performs gap analyses, and maintains a living requirements traceability matrix. Ambiguity becomes a solved problem.",
        skills: ["Requirements Analysis", "BPMN", "User Stories", "Gap Analysis", "SQL"],
        useCases: [
            "Document as-is and to-be checkout process",
            "Produce a requirements traceability matrix",
            "Run a gap analysis against a new regulation",
            "Write acceptance criteria for 20 stories in a sprint",
        ],
        integrations: ["Jira", "Confluence", "Miro", "Notion", "Slack", "Excel"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "teal",
        department: "Product",
        available: false,
    },

    // â”€â”€â”€ Design â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-ux-researcher",
        name: "AI UX Researcher",
        tagline: "User interviews, usability audits & personas",
        description:
            "Runs moderated usability sessions, synthesises research findings, builds user personas, and delivers actionable design recommendations.",
        longDescription:
            "The AI UX Researcher brings the voice of the user into every sprint. It drafts interview discussion guides, synthesises session recordings into affinity maps, builds evidence-based personas, and writes clear usability audit reports with prioritised recommendations. Design decisions are always grounded in real user behaviour.",
        skills: ["Usability Testing", "Interviews", "Personas", "Heuristic Eval", "Figma"],
        useCases: [
            "Run 6 moderated usability sessions on onboarding",
            "Synthesise research into design recommendations",
            "Build data-driven user personas",
            "Produce a heuristic evaluation of the dashboard",
        ],
        integrations: ["Figma", "Maze", "Hotjar", "Notion", "Miro", "Slack"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "pink",
        department: "Design",
        available: false,
    },

    // â”€â”€â”€ IT & Support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-it-support-engineer",
        name: "AI IT Support Engineer",
        tagline: "Helpdesk tickets, device & access management",
        description:
            "Triages and resolves helpdesk tickets, manages SaaS access provisioning, and writes self-service runbooks to reduce repeat requests.",
        longDescription:
            "The AI IT Support Engineer handles the high-volume, repetitive IT tickets so your team can focus on strategic work. It triages incoming requests, provisions and deprovisions SaaS access, resets credentials, escalates hardware issues, and builds a self-service knowledge base that deflects 40% of tickets over time.",
        skills: ["Okta", "Jamf", "ServiceNow", "Slack", "SaaS Admin"],
        useCases: [
            "Provision new-hire SaaS accounts automatically",
            "Build a self-service IT knowledge base",
            "Automate access revocation on offboarding",
            "Triage and route 100% of helpdesk tickets",
        ],
        integrations: ["Okta", "Jamf", "ServiceNow", "Google Workspace", "Slack", "Zendesk"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "slate",
        department: "IT & Support",
        available: false,
    },
    {
        slug: "ai-system-administrator",
        name: "AI System Administrator",
        tagline: "Linux / Windows admin, patching & provisioning",
        description:
            "Manages server fleets, automates patching, provisions VMs, and maintains configuration management with Ansible or Chef.",
        longDescription:
            "The AI System Administrator keeps your server fleet healthy and compliant. It automates OS patching via Ansible playbooks, provisions new VMs from approved templates, monitors certificate expiry, enforces CIS benchmarks, and produces weekly compliance reports. Toil evaporates, coverage improves.",
        skills: ["Linux", "Ansible", "Active Directory", "Bash", "Chef"],
        useCases: [
            "Automate OS patching across 200 servers",
            "Enforce CIS hardening benchmarks via Ansible",
            "Manage certificate rotation automatically",
            "Provision new dev VMs from approved templates",
        ],
        integrations: ["Ansible", "Chef", "AWS EC2", "Active Directory", "Datadog", "GitHub"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "orange",
        department: "IT & Support",
        available: false,
    },

    // â”€â”€â”€ Marketing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-content-writer",
        name: "AI Content Writer",
        tagline: "Blog posts, case studies & landing copy",
        description:
            "Researches, writes, and edits blog posts, case studies, product landing pages, and social copy that drives organic traffic and leads.",
        longDescription:
            "The AI Content Writer produces high-quality long-form and short-form content at scale. It researches competitors, identifies content gaps, writes SEO-optimised blog posts, crafts compelling case studies from customer data, and adapts your brand voice across every format. Content pipeline bottlenecks become a thing of the past.",
        skills: ["Copywriting", "SEO Writing", "Content Strategy", "Case Studies", "Markdown"],
        useCases: [
            "Write 4 SEO-optimised blog posts per month",
            "Turn customer data into 3 case studies",
            "Refresh 10 stale landing pages",
            "Draft social copy for 30 days of posts",
        ],
        integrations: ["Notion", "HubSpot", "WordPress", "Webflow", "Slack", "Google Docs"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "pink",
        department: "Marketing",
        available: false,
    },
    {
        slug: "ai-seo-specialist",
        name: "AI SEO Specialist",
        tagline: "Keyword research, on-page SEO & technical audits",
        description:
            "Conducts keyword research, optimises meta tags and content, fixes technical SEO issues, and tracks ranking improvements weekly.",
        longDescription:
            "The AI SEO Specialist turns your website into an organic growth engine. It researches high-intent keywords, optimises title tags and meta descriptions at scale, identifies and fixes technical issues like broken links and missing structured data, and produces weekly ranking reports that show compounding progress.",
        skills: ["SEO", "Keyword Research", "Ahrefs", "Core Web Vitals", "Schema Markup"],
        useCases: [
            "Audit entire site for technical SEO issues",
            "Build a keyword strategy for 5 product verticals",
            "Optimise meta tags on 50 top pages",
            "Produce weekly organic ranking reports",
        ],
        integrations: ["Ahrefs", "Semrush", "Google Search Console", "Screaming Frog", "Webflow"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "green",
        department: "Marketing",
        available: false,
    },
    {
        slug: "ai-email-marketer",
        name: "AI Email Marketer",
        tagline: "Drip sequences, campaigns & A/B tests",
        description:
            "Writes and optimises email campaigns, designs nurture sequences, runs subject-line A/B tests, and reports on engagement metrics.",
        longDescription:
            "The AI Email Marketer fills your pipeline with engaged leads. It writes compelling email sequences, sets up behavioural triggers in HubSpot or Klaviyo, runs systematic A/B tests on subject lines and CTAs, and produces weekly engagement reports to guide optimisation. Open rates and conversion rates trend upward every month.",
        skills: ["HubSpot", "Klaviyo", "A/B Testing", "Copywriting", "Email Deliverability"],
        useCases: [
            "Write a 7-email onboarding drip sequence",
            "A/B test subject lines across 5 segments",
            "Build a re-engagement campaign for churned users",
            "Report on weekly email engagement metrics",
        ],
        integrations: ["HubSpot", "Klaviyo", "Mailchimp", "Salesforce", "Stripe", "Slack"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "purple",
        department: "Marketing",
        available: false,
    },

    // â”€â”€â”€ HR & Talent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-technical-recruiter",
        name: "AI Technical Recruiter",
        tagline: "Job specs, sourcing & candidate screening",
        description:
            "Writes job descriptions, sources candidates from LinkedIn and GitHub, screens applications, and schedules interviews automatically.",
        longDescription:
            "The AI Technical Recruiter accelerates hiring without sacrificing quality. It writes compelling job descriptions optimised for relevant keywords, sources passive candidates from LinkedIn and GitHub, screens inbound applications with structured scoring rubrics, and coordinates interview scheduling â€” all asynchronously across time zones.",
        skills: ["LinkedIn Sourcing", "ATS", "Job Description Writing", "Screening", "Scheduling"],
        useCases: [
            "Write job descriptions for 5 open roles",
            "Source 20 qualified senior engineers per week",
            "Screen 100 applications with scoring rubric",
            "Automate interview scheduling workflows",
        ],
        integrations: ["LinkedIn", "Greenhouse", "Lever", "Workday", "Slack", "Google Calendar"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "blue",
        department: "HR & Talent",
        available: false,
    },
    {
        slug: "ai-hr-analyst",
        name: "AI HR Analyst",
        tagline: "HR analytics, policy docs & onboarding flows",
        description:
            "Analyses headcount and attrition data, writes and maintains HR policies, and builds structured onboarding checklists for new hires.",
        longDescription:
            "The AI HR Analyst turns people data into retention strategy. It tracks headcount trends, analyses attrition causes from exit survey data, benchmarks compensation against market data, drafts and updates HR policies, and builds onboarding checklists that reduce time-to-productivity for new hires.",
        skills: ["HR Analytics", "Policy Writing", "Workday", "Excel", "Onboarding Design"],
        useCases: [
            "Build a headcount and attrition dashboard",
            "Analyse exit survey data for retention insights",
            "Draft and update 5 HR policy documents",
            "Create a 30-60-90 day onboarding checklist",
        ],
        integrations: ["Workday", "BambooHR", "Slack", "Notion", "Google Sheets", "Lattice"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "teal",
        department: "HR & Talent",
        available: false,
    },

    // â”€â”€â”€ Finance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-finance-analyst",
        name: "AI Finance Analyst",
        tagline: "Financial models, variance reports & forecasts",
        description:
            "Builds and maintains financial models, produces monthly variance reports, and generates rolling forecasts from actuals automatically.",
        longDescription:
            "The AI Finance Analyst keeps the finance team ahead of the numbers. It builds three-statement financial models, automates monthly variance reports comparing actuals to budget, produces rolling 12-month forecasts, and prepares board-ready financial summaries. Close cycles shrink from days to hours.",
        skills: ["Financial Modelling", "Excel", "SQL", "QuickBooks", "FP&A"],
        useCases: [
            "Build a 3-statement financial model",
            "Automate monthly budget vs actuals report",
            "Produce a rolling 12-month ARR forecast",
            "Prepare a board-deck financial summary",
        ],
        integrations: ["QuickBooks", "NetSuite", "Stripe", "Snowflake", "Google Sheets", "Notion"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "teal",
        department: "Finance",
        available: false,
    },

    // â”€â”€â”€ Customer Success â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-customer-support-agent",
        name: "AI Customer Support Agent",
        tagline: "Support tickets, FAQs & escalation routing",
        description:
            "Handles inbound support tickets at scale, answers common questions instantly, and intelligently routes complex issues to the right human.",
        longDescription:
            "The AI Customer Support Agent provides instant, consistent support 24/7. It answers Tier-1 questions by drawing from your knowledge base, triages and routes complex tickets by category and severity, drafts responses for human review on tricky issues, and continuously updates the help centre as new issues emerge.",
        skills: ["Zendesk", "Intercom", "Help Centre Writing", "Ticket Triage", "CSAT"],
        useCases: [
            "Auto-resolve 60% of Tier-1 tickets instantly",
            "Route tickets to correct team with 95% accuracy",
            "Keep help centre docs updated from resolved tickets",
            "Generate weekly CSAT trend reports",
        ],
        integrations: ["Zendesk", "Intercom", "Freshdesk", "Slack", "Notion", "HubSpot"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "orange",
        department: "Customer Success",
        available: false,
    },
    {
        slug: "ai-customer-success-manager",
        name: "AI Customer Success Manager",
        tagline: "Onboarding, health scores & expansion plays",
        description:
            "Monitors customer health scores, triggers proactive outreach for at-risk accounts, and identifies expansion opportunities before renewal.",
        longDescription:
            "The AI Customer Success Manager makes every customer feel like your most important one. It tracks product usage health scores, identifies at-risk accounts before they churn, triggers personalised outreach sequences, prepares QBR decks from usage data, and surfaces expansion opportunities to the sales team at the perfect moment.",
        skills: ["Gainsight", "Customer Health Scoring", "QBR Writing", "HubSpot", "SQL"],
        useCases: [
            "Build a customer health score dashboard",
            "Trigger at-risk alerts 90 days before renewal",
            "Prepare data-driven QBR decks automatically",
            "Surface expansion opportunities from usage data",
        ],
        integrations: ["Gainsight", "Salesforce", "HubSpot", "Zendesk", "Slack", "Stripe"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "green",
        department: "Customer Success",
        available: false,
    },

    // â”€â”€â”€ Operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-project-manager",
        name: "AI Project Manager",
        tagline: "Sprint planning, status reports & risk tracking",
        description:
            "Facilitates sprint ceremonies, generates weekly status reports, tracks risks and blockers, and keeps delivery timelines on track.",
        longDescription:
            "The AI Project Manager is the glue that keeps cross-functional delivery on track. It runs sprint planning and retrospective prep, generates stakeholder status reports from Jira data, tracks risks and blockers proactively, and flags scope creep before it derails the timeline. Projects become predictable.",
        skills: ["Jira", "Agile/Scrum", "Risk Management", "Status Reporting", "Confluence"],
        useCases: [
            "Generate weekly project status report from Jira",
            "Run sprint planning prep and estimation",
            "Track risks and blockers in a live register",
            "Produce a project retrospective summary",
        ],
        integrations: ["Jira", "Linear", "Confluence", "Notion", "Slack", "Google Workspace"],
        price: "$99/mo",
        priceMonthly: 99,
        plan: "Starter+",
        color: "slate",
        department: "Operations",
        available: false,
    },
    // â”€â”€â”€ Sales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-sales-rep",
        name: "AI Sales Rep",
        tagline: "Lead qualification, CRM updates & outbound sequences",
        description:
            "Qualifies inbound leads, updates CRM records, drafts outbound sequences, writes proposals, and tracks competitive intelligence automatically.",
        longDescription:
            "The AI Sales Rep keeps your pipeline full and your CRM clean. It scores and qualifies inbound leads against your ICP, crafts personalised outbound email sequences, updates Salesforce or HubSpot after every interaction, and produces competitive-analysis briefs so reps walk into every call prepared. Follow-up never falls through the cracks.",
        skills: ["Lead Qualification", "CRM Management", "Cold Outreach", "Proposal Writing", "Competitive Analysis"],
        useCases: [
            "Qualify inbound leads against ICP criteria",
            "Draft personalised outbound email sequences",
            "Update CRM records after every touchpoint",
            "Produce competitive analysis briefs before calls",
        ],
        integrations: ["Salesforce", "HubSpot", "LinkedIn", "Outreach", "Slack", "Gmail"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "green",
        department: "Sales",
        available: false,
    },

    // â”€â”€â”€ Marketing (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-marketing-specialist",
        name: "AI Marketing Specialist",
        tagline: "Campaign strategy, ad copy & analytics reports",
        description:
            "Designs and executes multi-channel marketing campaigns, writes ad copy, optimises SEO, runs A/B tests, and delivers weekly analytics reports.",
        longDescription:
            "The AI Marketing Specialist is your full-stack marketer. It builds campaign briefs, writes Google and LinkedIn ad copy, optimises on-page SEO, analyses A/B test results, and delivers concise weekly reports covering traffic, conversions, and cost-per-acquisition. Every campaign is data-driven from day one.",
        skills: ["Campaign Strategy", "SEO", "Ad Copywriting", "Google Analytics", "A/B Testing"],
        useCases: [
            "Build a multi-channel campaign brief and calendar",
            "Write Google Ads and LinkedIn ad copy",
            "Analyse A/B test results and recommend winners",
            "Deliver weekly marketing performance report",
        ],
        integrations: ["Google Ads", "HubSpot", "Google Analytics", "Semrush", "Slack", "Notion"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "purple",
        department: "Marketing",
        available: false,
    },

    // â”€â”€â”€ Operations (additional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        slug: "ai-corporate-assistant",
        name: "AI Corporate Assistant",
        tagline: "Email drafting, meeting summaries & scheduling",
        description:
            "Drafts professional emails, summarises meeting notes, manages calendar scheduling, formats documents, and coordinates travel logistics.",
        longDescription:
            "The AI Corporate Assistant eliminates the administrative overhead that consumes executive time. It drafts polished emails in your voice, joins meetings and produces action-item summaries, schedules across time zones, formats reports and slide decks, and coordinates travel bookings â€” all within your existing Google Workspace or Microsoft 365 environment.",
        skills: ["Email Drafting", "Calendar Management", "Meeting Summaries", "Document Formatting", "Travel Coordination"],
        useCases: [
            "Draft and send professional emails on your behalf",
            "Summarise meeting recordings into action items",
            "Schedule meetings across multiple time zones",
            "Format and prepare board-ready documents",
        ],
        integrations: ["Google Workspace", "Microsoft 365", "Slack", "Zoom", "Notion", "Calendly"],
        price: "$49/mo",
        priceMonthly: 49,
        plan: "Starter+",
        color: "slate",
        department: "Operations",
        available: false,
    },

    // â”€â”€â”€ Catalogue agents (auto-generated from agents/catalogue) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ...(catalogueBots as Bot[]),
];

const NEW_AGENT_SLUGS = new Set((catalogueBots as Bot[]).map((bot) => bot.slug));

const ALLOWED_MARKETPLACE_SLUGS = new Set<string>([
    "ai-technical-recruiter",      // Recruiter
    "ai-backend-developer",        // Developer
    "ai-full-stack-developer",     // FullStack Developer
    "ai-qa-engineer",              // Tester
    "ai-business-analyst",         // Business Analyst
    "ai-technical-writer",         // Technical Writer
    "ai-content-writer",           // Content Writer
    "ai-sales-rep",                // Sales Rep
    "ai-marketing-specialist",     // Marketing Specialist
    "ai-corporate-assistant",      // Corporate Assistant
    "ai-customer-support-agent",   // Customer Support Executive (Voice/Chat/Email)
    "ai-project-manager",          // Project Manager/Product Owner/Scrum Master
]);

export const marketplaceBots: Bot[] = bots.filter((bot) => {
    if (!ALLOWED_MARKETPLACE_SLUGS.has(bot.slug)) return false;

    // Keep legacy "ai-*" role bots and selected catalogue bots.
    return bot.slug.startsWith("ai-") || NEW_AGENT_SLUGS.has(bot.slug);
});


export function getBotBySlug(slug: string): Bot | undefined {
    return bots.find((b) => b.slug === slug);
}

export function getAllSlugs(): string[] {
    return bots.map((b) => b.slug);
}

// Derived from bot names â€” auto-updates when bots are added
export const ROLE_TO_SLUG: Record<string, string> = Object.fromEntries(
    bots.map((b) => [b.name.replace(/^AI\s+/, ""), b.slug])
);

