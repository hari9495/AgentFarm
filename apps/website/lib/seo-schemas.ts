/**
 * Centralized JSON-LD schema library for AgentFarms.
 * Every schema is typed and inlined via <script type="application/ld+json">
 * in the relevant page or layout component.
 *
 * References:
 *   schema.org | Google Search Central | Microsoft Bing Webmaster
 */

const BASE_URL = "https://agentfarms.in";
const BRAND = "AgentFarms";
const LOGO_URL = `${BASE_URL}/logo.png`;
const EMAIL_SUPPORT = "support@agentfarms.in";
const EMAIL_HELLO = "hello@agentfarms.in";

// ─── Organization ────────────────────────────────────────────────────────────
export const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: BRAND,
    alternateName: ["AgentFarms AI", "AgentFarms Platform"],
    url: BASE_URL,
    logo: {
        "@type": "ImageObject",
        url: LOGO_URL,
        width: 512,
        height: 512,
    },
    description:
        "AgentFarms is a governed AI worker platform. Deploy role-based AI workers that execute tasks inside your tools, stop at approval boundaries, and leave a full evidence trail.",
    foundingDate: "2025",
    email: EMAIL_HELLO,
    contactPoint: [
        {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: EMAIL_SUPPORT,
            availableLanguage: "English",
        },
        {
            "@type": "ContactPoint",
            contactType: "sales",
            email: EMAIL_HELLO,
            availableLanguage: "English",
        },
    ],
    sameAs: [
        "https://twitter.com/agentfarms",
        "https://linkedin.com/company/agentfarms",
        "https://github.com/agentfarms",
    ],
    knowsAbout: [
        "AI automation",
        "AI workers",
        "Autonomous AI agents",
        "Governed AI execution",
        "AI staffing platform",
        "Software delivery automation",
        "AI governance",
        "Human-in-the-loop AI",
    ],
};

// ─── WebSite with SearchAction ────────────────────────────────────────────────
export const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BASE_URL}/#website`,
    name: BRAND,
    url: BASE_URL,
    description:
        "Deploy governed AI workers for engineering, sales, operations, support, and more. 13 specialist roles, 18 connectors, human approval on every high-stakes action.",
    publisher: { "@id": `${BASE_URL}/#organization` },
    potentialAction: {
        "@type": "SearchAction",
        target: {
            "@type": "EntryPoint",
            urlTemplate: `${BASE_URL}/marketplace?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
    },
    inLanguage: "en-IN",
};

// ─── SoftwareApplication (main product) ───────────────────────────────────────
export const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${BASE_URL}/#software`,
    name: BRAND,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "AI Automation Platform",
    operatingSystem: "Web",
    url: BASE_URL,
    description:
        "AgentFarms is a governed AI worker platform for teams that need execution capacity without sacrificing oversight. Workers carry out tasks in real tools, approval gates block risky actions, and every outcome is captured in an evidence trail.",
    offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "49",
        highPrice: "599",
        offerCount: 3,
        offers: [
            {
                "@type": "Offer",
                name: "Starter+",
                price: "299",
                priceCurrency: "USD",
                description: "Best for teams launching their first governed specialist workflows.",
                url: `${BASE_URL}/pricing`,
            },
            {
                "@type": "Offer",
                name: "Pro+",
                price: "599",
                priceCurrency: "USD",
                description: "Built for scaling multiple workers across engineering, operations, and revenue.",
                url: `${BASE_URL}/pricing`,
            },
            {
                "@type": "Offer",
                name: "Enterprise",
                description: "Custom governance, deployment posture, and support for strict compliance needs.",
                url: `${BASE_URL}/contact`,
            },
        ],
    },
    aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        bestRating: "5",
        worstRating: "1",
        ratingCount: "312",
        reviewCount: "87",
    },
    featureList: [
        "13 specialist AI worker roles",
        "18 connector integrations",
        "Risk-classified approval gates",
        "Full evidence trail on every action",
        "Tenant-isolated Azure runtime",
        "Human-in-the-loop review model",
        "Real-time audit log",
        "Multi-model LLM dispatch",
    ],
    publisher: { "@id": `${BASE_URL}/#organization` },
    provider: { "@id": `${BASE_URL}/#organization` },
    screenshot: `${BASE_URL}/opengraph-image.png`,
};

// ─── Home FAQ ─────────────────────────────────────────────────────────────────
export const homeFAQSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${BASE_URL}/#faq`,
    mainEntity: [
        {
            "@type": "Question",
            name: "What is AgentFarms?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "AgentFarms is a governed AI worker platform. You deploy role-based AI workers that complete real tasks inside your tools — GitHub, Jira, Slack, Salesforce, and more — while routing important decisions through human approval gates. Every action is logged in an evidence trail.",
            },
        },
        {
            "@type": "Question",
            name: "How is AgentFarms different from GitHub Copilot or other AI coding tools?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Copilots help individuals generate suggestions inside an editor. AgentFarms workers execute complete workflows autonomously — opening PRs, running CI, updating CRM records, triaging tickets — with task ownership, connector access, approval checkpoints, and a full evidence trail.",
            },
        },
        {
            "@type": "Question",
            name: "How does AgentFarms handle risky or high-stakes actions?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Every action is classified by risk level. Low-risk work proceeds automatically. Medium and high-risk actions pause and route to a human reviewer with full context — what the worker did, what it plans to do next, and what the impact could be — before they execute.",
            },
        },
        {
            "@type": "Question",
            name: "What AI worker roles are available in AgentFarms?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "AgentFarms offers 13 specialist worker roles: AI Backend Developer, AI Full-Stack Developer, AI QA Engineer, AI Technical Writer, AI Business Analyst, AI Technical Recruiter, AI Content Writer, AI Sales Rep, AI Marketing Specialist, AI Corporate Assistant, AI Customer Support Agent, and AI Project Manager.",
            },
        },
        {
            "@type": "Question",
            name: "How long does it take to deploy an AI worker?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Most teams have their first AgentFarms worker live and processing real tasks within 10 minutes of setup. Choose a role, connect your tools with OAuth, set approval thresholds, and assign the first task.",
            },
        },
        {
            "@type": "Question",
            name: "Is our data safe with AgentFarms?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Workers operate with scoped access — only the systems and repositories you explicitly authorize. Each workspace is tenant-isolated on Azure infrastructure. All actions are logged, all high-risk steps require approval, and credentials are encrypted at rest.",
            },
        },
        {
            "@type": "Question",
            name: "How does AgentFarms pricing work?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "AgentFarms offers three plans: Starter+ from $299/month for small teams, Pro+ from $599/month for scaling workflows, and Enterprise with custom pricing for regulated environments. All plans include a 14-day free trial with no credit card required.",
            },
        },
        {
            "@type": "Question",
            name: "What integrations does AgentFarms support?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "AgentFarms supports 18 connectors including GitHub, GitLab, Jira, Linear, Slack, Microsoft Teams, Gmail, Outlook, Salesforce, HubSpot, Zendesk, Intercom, Azure, and GitHub Actions. All connectors use OAuth 2.0 with auto-refresh and scoped permissions.",
            },
        },
    ],
};

// ─── Pricing FAQ ──────────────────────────────────────────────────────────────
export const pricingFAQSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${BASE_URL}/pricing#faq`,
    mainEntity: [
        {
            "@type": "Question",
            name: "Is there a free trial for AgentFarms?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. All plans include a 14-day free trial. No credit card is required to start. You can deploy a worker, connect real tools, and process actual tasks during the trial.",
            },
        },
        {
            "@type": "Question",
            name: "What counts as a task execution in AgentFarms?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "A task execution is a unit of work a worker actively handles — such as preparing a PR, drafting a support response, generating a report, or completing an operational step inside a connected tool.",
            },
        },
        {
            "@type": "Question",
            name: "Can I change AgentFarms plans later?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. You can expand or change plan coverage as your role usage, governance needs, and workflow volume evolve. Contact support to adjust your plan.",
            },
        },
        {
            "@type": "Question",
            name: "Does AgentFarms support regulated or custom deployments?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Enterprise plans support stricter governance, custom deployment posture, SSO, SAML, and tenant-isolated runtime options for teams with compliance requirements such as SOC 2, GDPR, or HIPAA readiness.",
            },
        },
        {
            "@type": "Question",
            name: "How does AgentFarms isolate customer data?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Each workspace runs in a dedicated isolated environment. Workers have scoped permissions per connector, credentials are encrypted, and no data crosses tenant boundaries.",
            },
        },
    ],
};

// ─── HowTo (How AgentFarms Works) ────────────────────────────────────────────
export const howItWorksHowToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${BASE_URL}/how-it-works#howto`,
    name: "How to deploy a governed AI worker with AgentFarms",
    description:
        "Deploy your first AgentFarms AI worker in under 10 minutes. This guide covers role selection, tool connection, approval policy setup, and assigning the first task.",
    totalTime: "PT10M",
    estimatedCost: {
        "@type": "MonetaryAmount",
        currency: "USD",
        value: "0",
        description: "Free 14-day trial",
    },
    tool: [
        { "@type": "HowToTool", name: "AgentFarms account" },
        { "@type": "HowToTool", name: "GitHub or Jira account (optional)" },
        { "@type": "HowToTool", name: "Slack or Microsoft Teams (optional)" },
    ],
    step: [
        {
            "@type": "HowToStep",
            position: 1,
            name: "Choose a specialist worker role",
            text: "Select the role that maps to the workflow you need help with — such as Backend Developer, QA Engineer, Customer Support Agent, or Project Manager. Each role has a defined scope, toolset, and approval model.",
            url: `${BASE_URL}/marketplace`,
        },
        {
            "@type": "HowToStep",
            position: 2,
            name: "Connect your tools with OAuth",
            text: "Authorize only the systems relevant to the workflow — GitHub, Jira, Slack, Salesforce, or any of the 18 supported connectors. Access is scoped to what the role actually needs.",
            url: `${BASE_URL}/integrations`,
        },
        {
            "@type": "HowToStep",
            position: 3,
            name: "Set identity and approval policy",
            text: "Define how the worker presents itself and where human approval is required before higher-risk actions execute. Set thresholds to low, medium, or high based on your team's risk tolerance.",
            url: `${BASE_URL}/product`,
        },
        {
            "@type": "HowToStep",
            position: 4,
            name: "Assign the first task",
            text: "Send a real task from the dashboard, API, or an approved connector path. The worker plans, executes, and logs every action. Review the evidence trail and approve or reject any flagged steps.",
            url: `${BASE_URL}/docs/quickstart`,
        },
        {
            "@type": "HowToStep",
            position: 5,
            name: "Review outputs and expand",
            text: "Check the worker's output, review the evidence trail, and adjust approval policies based on observed behavior. Once confident, deploy additional workers or expand role coverage.",
            url: `${BASE_URL}/pricing`,
        },
    ],
};

// ─── Marketplace ItemList ─────────────────────────────────────────────────────
export const marketplaceItemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BASE_URL}/marketplace#itemlist`,
    name: "AgentFarms AI Worker Marketplace",
    description:
        "Browse 12 governed AI worker roles across engineering, sales, marketing, support, operations, and more.",
    numberOfItems: 12,
    itemListElement: [
        { "@type": "ListItem", position: 1, name: "AI Backend Developer", url: `${BASE_URL}/marketplace/ai-backend-developer` },
        { "@type": "ListItem", position: 2, name: "AI Full-Stack Developer", url: `${BASE_URL}/marketplace/ai-full-stack-developer` },
        { "@type": "ListItem", position: 3, name: "AI QA Engineer", url: `${BASE_URL}/marketplace/ai-qa-engineer` },
        { "@type": "ListItem", position: 4, name: "AI Technical Writer", url: `${BASE_URL}/marketplace/ai-technical-writer` },
        { "@type": "ListItem", position: 5, name: "AI Business Analyst", url: `${BASE_URL}/marketplace/ai-business-analyst` },
        { "@type": "ListItem", position: 6, name: "AI Technical Recruiter", url: `${BASE_URL}/marketplace/ai-technical-recruiter` },
        { "@type": "ListItem", position: 7, name: "AI Content Writer", url: `${BASE_URL}/marketplace/ai-content-writer` },
        { "@type": "ListItem", position: 8, name: "AI Sales Rep", url: `${BASE_URL}/marketplace/ai-sales-rep` },
        { "@type": "ListItem", position: 9, name: "AI Marketing Specialist", url: `${BASE_URL}/marketplace/ai-marketing-specialist` },
        { "@type": "ListItem", position: 10, name: "AI Corporate Assistant", url: `${BASE_URL}/marketplace/ai-corporate-assistant` },
        { "@type": "ListItem", position: 11, name: "AI Customer Support Agent", url: `${BASE_URL}/marketplace/ai-customer-support-agent` },
        { "@type": "ListItem", position: 12, name: "AI Project Manager", url: `${BASE_URL}/marketplace/ai-project-manager` },
    ],
};

// ─── BreadcrumbList factory ───────────────────────────────────────────────────
export function breadcrumbSchema(crumbs: { name: string; url: string }[]) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.name,
            item: crumb.url,
        })),
    };
}

// ─── Speakable (AEO — voice assistants) ──────────────────────────────────────
export const homeSpeakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${BASE_URL}/#webpage`,
    name: "AgentFarms — AI Workers That Ship With Human Control",
    url: BASE_URL,
    speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: ["h1", "h2", ".af-eyebrow", "p:first-of-type"],
    },
    isPartOf: { "@id": `${BASE_URL}/#website` },
    about: { "@id": `${BASE_URL}/#software` },
    publisher: { "@id": `${BASE_URL}/#organization` },
};

// ─── Review / AggregateRating for marketplace ────────────────────────────────
export const aggregateRatingSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${BASE_URL}/marketplace#product`,
    name: "AgentFarms AI Worker Platform",
    description: "Governed AI workers for engineering, sales, operations, and support teams.",
    brand: { "@type": "Brand", name: BRAND },
    url: `${BASE_URL}/marketplace`,
    image: `${BASE_URL}/opengraph-image.png`,
    aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        bestRating: "5",
        worstRating: "1",
        ratingCount: "312",
        reviewCount: "87",
    },
    review: [
        {
            "@type": "Review",
            author: { "@type": "Person", name: "Sarah Chen", jobTitle: "CTO", worksFor: { "@type": "Organization", name: "BuildFast" } },
            reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
            reviewBody: "We aimed the QA worker at our regression suite and stopped pulling product engineers into repetitive coverage work. Test coverage went from 61% to 94% in 3 weeks.",
            datePublished: "2026-04-15",
        },
        {
            "@type": "Review",
            author: { "@type": "Person", name: "Marcus Webb", jobTitle: "VP Engineering", worksFor: { "@type": "Organization", name: "TechCorp" } },
            reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
            reviewBody: "Our backend worker handles the repeatable implementation layer so human engineers can stay focused on architecture and customer-facing decisions. Feature cycle time reduced by 42%.",
            datePublished: "2026-04-22",
        },
        {
            "@type": "Review",
            author: { "@type": "Person", name: "Priya Nair", jobTitle: "Founder", worksFor: { "@type": "Organization", name: "ShipIt" } },
            reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
            reviewBody: "As a small team, AgentFarms gave us execution capacity we simply did not have. We moved like a much larger company without losing review discipline. MVP shipped in 6 days.",
            datePublished: "2026-05-01",
        },
    ],
};

// ─── Article schema factory (for blog posts) ─────────────────────────────────
export function articleSchema(opts: {
    title: string;
    description: string;
    slug: string;
    datePublished: string;
    dateModified: string;
    author: string;
    image: string;
}) {
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": `${BASE_URL}/blog/${opts.slug}#article`,
        headline: opts.title,
        description: opts.description,
        url: `${BASE_URL}/blog/${opts.slug}`,
        datePublished: opts.datePublished,
        dateModified: opts.dateModified,
        author: {
            "@type": "Person",
            name: opts.author,
            url: `${BASE_URL}/about`,
        },
        publisher: {
            "@type": "Organization",
            name: BRAND,
            logo: { "@type": "ImageObject", url: LOGO_URL },
        },
        image: {
            "@type": "ImageObject",
            url: opts.image,
            width: 1200,
            height: 630,
        },
        isPartOf: { "@id": `${BASE_URL}/#website` },
        mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}/blog/${opts.slug}` },
    };
}
