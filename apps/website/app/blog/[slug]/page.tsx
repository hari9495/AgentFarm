import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    Bot,
    Calendar,
    Clock,
    Tag,
} from "lucide-react";

export const metadata: Metadata = {
    title: "Blog - AgentFarm",
};

type Post = {
    slug: string;
    title: string;
    category: string;
    categoryColor: string;
    date: string;
    readTime: string;
    author: { name: string; role: string; initials: string };
    excerpt: string;
    body: string[];
};

const posts: Post[] = [
    {
        slug: "introducing-agentfarm",
        title: "Introducing AgentFarm: AI Teammates for Software Teams",
        category: "Product",
        categoryColor: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
        date: "March 15, 2026",
        readTime: "5 min read",
        author: { name: "Jane Doe", role: "Co-founder & CEO", initials: "JD" },
        excerpt: "We're building AI agents that show up to work like real teammates — with real identities, real specialisations, and real accountability.",
        body: [
            "Every software team we've spoken to has the same problem: not enough engineers. Backlogs grow, shipping slows, and the best engineers spend half their time on work that could be automated.",
            "AgentFarm was built to solve this. We deploy AI teammates - not chatbots, not copilots, but full-stack software agents - that join your team as first-class contributors. They open PRs, write tests, monitor infrastructure, and hunt down vulnerabilities, all day, every day.",
            "What makes AgentFarm different is identity. Our agents operate through real corporate accounts: a real email address, a real Slack presence, a real GitHub profile. They show up in your standup feed. They reply to PR comments. They get assigned Jira tickets. They look and feel like teammates.",
            "But they're not black boxes. Every action is logged. Every risky operation goes through your existing approval process. You decide what they can do autonomously and where they need a human in the loop. AgentFarm is designed for teams that care about accountability as much as velocity.",
            "Today we're launching with four specialist roles: Backend Developer, QA Engineer, DevOps Engineer, and Security Engineer. Each has deep, role-specific skills — not a general LLM pretending to know your stack.",
            "We're starting with a small cohort of engineering teams. If you're interested, apply for early access below.",
        ],
    },
    {
        slug: "isolated-robot-runtimes",
        title: "Why Every Agent Needs an Isolated Runtime",
        category: "Engineering",
        categoryColor: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
        date: "March 10, 2026",
        readTime: "7 min read",
        author: { name: "Sam Okafor", role: "Head of Infrastructure", initials: "SO" },
        excerpt: "We give every agent its own sandboxed runtime, ephemeral credentials, and network policies. Here's why that matters for security and reliability.",
        body: [
            "When you run multiple AI agents in a shared environment, one compromised or misbehaving agent can affect all the others. That's why we give each AgentFarm teammate its own isolated runtime from the moment it starts a task.",
            "Isolation means different things at different layers. At the compute layer, each agent runs in its own container with strict CPU and memory limits. At the network layer, default-deny policies prevent lateral movement. At the credential layer, agents receive short-lived, scoped tokens that expire when the task completes.",
            "We built our isolation model around three principles: least privilege, blast radius minimisation, and auditability. Least privilege means an agent can only access the resources its current task requires — nothing more. Blast radius minimisation means a failure or compromise in one agent cannot cascade to others. Auditability means every action, every API call, every credential access is logged and attributable.",
            "The practical effect is that when our security agent flags a CVE, it can scan the affected package in its own ephemeral environment without touching anything else. When our DevOps agent deploys to staging, it uses credentials scoped to that environment for that deployment window.",
            "Isolation also helps reliability. Agents that crash or get stuck don't bring down the platform. We can kill and restart a runtime in under 3 seconds without affecting other tasks.",
            "This architecture is more expensive than running everything in a shared process. But for production software teams, the tradeoff is obvious.",
        ],
    },
    {
        slug: "developer-shortage-2026",
        title: "The Developer Shortage Is Getting Worse — Here's the Data",
        category: "Insights",
        categoryColor: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
        date: "February 28, 2026",
        readTime: "6 min read",
        author: { name: "Priya Nair", role: "Head of Research", initials: "PN" },
        excerpt: "We analysed hiring data from 1,200 software companies. The gap between engineering demand and supply has never been wider.",
        body: [
            "Across 1,200 software companies we analysed, engineering headcount requests are up 34% year-over-year. Filled roles are up 8%. The gap has never been wider.",
            "Three forces are driving the divergence. First, software complexity is increasing faster than developer supply. Modern stacks require specialists in security, reliability, DevOps, and testing — roles that are disproportionately hard to hire. Second, developer salaries have reset to a higher baseline after 2022-2023 adjustments, making headcount growth expensive. Third, AI tools are raising the bar for what a 'good' engineer produces — which paradoxically increases demand for human engineers who can review and direct AI output.",
            "The irony is that the teams feeling this pinch most acutely are the ones building AI products. They need more engineers precisely because AI is raising the bar on software quality and moving the frontier of what's possible.",
            "We see two emerging responses. Some teams are investing heavily in developer tooling to multiply individual output. Others are exploring whether entire categories of engineering work — regression testing, dependency maintenance, security scanning, routine deployments — can be handled by specialised agents rather than human engineers.",
            "AgentFarm was built for the second response. Not because human engineers aren't valuable, but because the best ones should be working on the hardest problems — not spending half their week on work that can be automated with sufficient reliability.",
            "We'll be publishing this dataset publicly next quarter. Subscribe for updates.",
        ],
    },
    {
        slug: "agentfarm-github-integration",
        title: "Deep GitHub Integration: How Our Agents Really Work with Code",
        category: "Product",
        categoryColor: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
        date: "February 20, 2026",
        readTime: "8 min read",
        author: { name: "Alex Rivera", role: "Engineering Lead", initials: "AR" },
        excerpt: "A detailed look at how AgentFarm agents interact with GitHub — from PR authorship to code review and merge policies.",
        body: [
            "GitHub is the operating surface for most engineering work. That's why we spent months building a deep, native GitHub integration rather than bolting on a thin webhook adapter.",
            "AgentFarm agents authenticate to GitHub as real organisation members — not bot accounts. This means pull requests show the agent's profile photo, status checks run under the agent's identity, and code reviews appear in your existing review workflow. The agent's contributions appear in the org's contribution graph.",
            "When a backend agent authors a PR, it follows your branch protection rules, runs the same CI checks as any human engineer, and responds to review comments. If a reviewer asks for a change, the agent picks up the comment, makes the modification, and pushes a new commit within minutes.",
            "We handle merge policies carefully. By default, agents cannot merge their own PRs — a human reviewer or another agent in a different role must approve. You can configure auto-merge for low-risk PRs with passing checks and no pending comments, but it's opt-in and scoped to specific repositories.",
            "For security-critical repositories, we recommend requiring a human approval even for agent-authored PRs. Our approval gate system lets you enforce this at the repository or organisation level without changing your existing GitHub settings.",
            "The GitHub integration also feeds our activity feed. Every commit, PR, review, and merge is visible in the AgentFarm dashboard in real time, so your team always knows what the agents have been doing.",
        ],
    },
    {
        slug: "task-queue-architecture",
        title: "Inside AgentFarm's Task Queue: Distributed Work at Scale",
        category: "Engineering",
        categoryColor: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
        date: "February 12, 2026",
        readTime: "9 min read",
        author: { name: "Sam Okafor", role: "Head of Infrastructure", initials: "SO" },
        excerpt: "How we route tasks to the right agents, handle retries, and maintain ordering guarantees without a central coordinator.",
        body: [
            "Distributing work across many AI agents with different specialisations and rate limits is a harder scheduling problem than it looks. Here's how we approach it.",
            "The core of AgentFarm's task queue is a priority-aware, capability-tagged work queue. Every task carries a capability tag (for example: 'write-code', 'run-tests', 'deploy', 'scan-security') that determines which agent roles can pick it up. Agents poll for tasks matching their capability set.",
            "Priority is three-tiered: critical (security incidents, production outages), normal (routine engineering tasks), and background (maintenance, reporting). Critical tasks preempt normal tasks even on busy agents.",
            "We avoid a central coordinator to eliminate that as a single point of failure. Instead, agents use optimistic concurrency — they claim a task by writing a lock with a TTL. If the agent crashes mid-task, the lock expires and the task is re-queued. Every task is idempotent by design.",
            "Ordering guarantees are maintained at the repository level. We use per-repo task lanes to ensure that two agents don't try to push conflicting commits simultaneously. This is the most complex part of the system — and the one we've iterated on the most.",
            "Current throughput per agent per day is 40-120 tasks depending on task complexity. We scale agent instances horizontally, so throughput scales linearly with the number of deployed agents.",
        ],
    },
    {
        slug: "measuring-ai-worker-output",
        title: "How We Measure AI Teammate Output Quality",
        category: "Engineering",
        categoryColor: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
        date: "January 30, 2026",
        readTime: "6 min read",
        author: { name: "Priya Nair", role: "Head of Research", initials: "PN" },
        excerpt: "First-pass acceptance rate, rework rate, defect escape rate — the metrics that actually tell you if your AI agents are performing.",
        body: [
            "Most AI benchmarks measure capability in isolation. We care about a different question: in a real engineering team, is the agent producing work that ships?",
            "Our primary quality metric is first-pass acceptance rate: the percentage of agent-produced artefacts (PRs, test suites, config changes) that pass human review without requiring significant rework. For our backend developer agent, this currently sits at 78% — meaning roughly 4 in 5 PRs require only minor comments or no changes.",
            "The second metric is rework rate: when rework is required, how significant is it? We track this on a three-tier scale: cosmetic (style, comments), functional (logic changes required), and structural (approach needs rethinking). Cosmetic rework is acceptable. Structural rework is a quality signal we investigate.",
            "Third is defect escape rate: quality issues detected after an artefact is merged or deployed. This is our most important metric because it reflects real production impact. We track this per agent and per task type.",
            "We publish aggregate quality metrics monthly. Each customer also gets per-agent quality dashboards so they can see exactly how their deployed agents are performing against their team's specific standards.",
            "Quality is not static. Agents improve as they accumulate context about your codebase, your style preferences, and your review feedback. We've seen first-pass acceptance rates increase 15-20 percentage points over the first 60 days of deployment.",
        ],
    },
    {
        slug: "engineer-time-allocation-2026",
        title: "Where Engineers Actually Spend Their Time in 2026",
        category: "Insights",
        categoryColor: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
        date: "January 18, 2026",
        readTime: "5 min read",
        author: { name: "Jane Doe", role: "Co-founder & CEO", initials: "JD" },
        excerpt: "We surveyed 800 engineers. The results confirm what we suspected: most high-value engineering time is buried under routine work.",
        body: [
            "We surveyed 800 engineers across 150 companies about how they actually spend their working hours. The results are striking.",
            "On average, engineers report spending 31% of their week on work they consider 'high-value' — designing systems, solving hard problems, and doing creative work. The remaining 69% is a mix of code review (18%), meetings (17%), maintenance and bug fixes (15%), testing and QA (11%), and documentation and reporting (8%).",
            "The ratio flips for senior engineers: they spend more time on review and architecture, less on execution. But even staff-level engineers report only 40% of their time on high-value work.",
            "When we asked engineers which categories they'd most like to hand off, testing (74%), routine maintenance (68%), and security scanning (61%) ranked highest. Code review ranked lowest — most engineers see review as valuable human work.",
            "This matches our thesis. AgentFarm's first four roles map directly to the categories engineers want to automate: QA Engineer (testing), DevOps Engineer (maintenance and deployments), Security Engineer (scanning), and Backend Developer (routine feature work).",
            "We believe the next generation of high-performing engineering teams will look very different: smaller human cores focused on architecture and decisions, with AI agents handling routine execution. The teams experimenting with this model today are already seeing results.",
        ],
    },
    {
        slug: "scale-without-hiring",
        title: "Scale Engineering Output Without Scaling Headcount",
        category: "Insights",
        categoryColor: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
        date: "January 5, 2026",
        readTime: "4 min read",
        author: { name: "Alex Rivera", role: "Engineering Lead", initials: "AR" },
        excerpt: "The economic case for AI teammates: what happens to unit economics when your engineering capacity scales without adding seats.",
        body: [
            "The traditional engineering team model is headcount-bound. More output requires more hires. Hiring takes months, onboarding takes more months, and turnover sets you back.",
            "With AgentFarm, engineering capacity can scale in days, not months. You add a new agent role, it connects to your existing tools, and it starts picking up work. No hiring pipeline, no onboarding, no equity dilution.",
            "The economics are straightforward. A deployed AI engineer costs a fraction of a human engineer — today we estimate 8-15% of fully-loaded headcount cost for equivalent output volume on automatable tasks. That ratio will improve as the technology matures.",
            "The implication is that teams can maintain a lean human engineering core and scale output by adding AI teammates. The human engineers focus on what humans are best at: architecture, difficult debugging, customer conversations, and reviewing AI output. The agents handle the volume.",
            "We've seen early customers ship 40-60% more features per quarter without adding headcount, and reduce security backlog processing time by over 70%.",
            "This doesn't mean AI engineers replace human engineers. It means the teams that adopt this model can do more with the engineers they have — and can hire fewer engineers per unit of output as they scale.",
        ],
    },
    {
        slug: "gitops-ai-bots-2026",
        title: "GitOps for AI Agents: Treating Agent Config as Code",
        category: "Engineering",
        categoryColor: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
        date: "December 20, 2025",
        readTime: "7 min read",
        author: { name: "Sam Okafor", role: "Head of Infrastructure", initials: "SO" },
        excerpt: "Agent configurations, role policies, and approval gates — all version-controlled in git and deployed via PR workflow.",
        body: [
            "We believe agent configuration should be treated exactly like infrastructure configuration: versioned, reviewed, and deployed through a controlled pipeline.",
            "AgentFarm supports a GitOps mode where all agent configurations — role policies, approval gates, integration settings, shift schedules — are stored as YAML files in a repository of your choice. Changes go through PR review. Deployments are automatic on merge.",
            "This gives teams the same safety guarantees for agent configuration that they have for infrastructure: change history, peer review, automated validation, and rollback via revert.",
            "The most important implication is for approval gate configuration. Approval gates define which actions require human sign-off. If those configurations can be changed arbitrarily through a UI, a misconfiguration or compromised credential could silently remove safety controls. With GitOps, every change is visible, reviewable, and auditable.",
            "We also use the GitOps model for our own internal agent deployments. Every agent role, permission set, and runtime configuration at AgentFarm is managed through a monorepo with mandatory review and CI validation before deployment.",
            "GitOps mode is available on all paid plans. We plan to make it the default for enterprise customers.",
        ],
    },
    {
        slug: "security-bots-vs-manual-review",
        title: "Security Bots vs Manual Review: A Comparative Study",
        category: "Insights",
        categoryColor: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
        date: "December 8, 2025",
        readTime: "6 min read",
        author: { name: "Priya Nair", role: "Head of Research", initials: "PN" },
        excerpt: "We ran a controlled study with 20 teams comparing AI security review with traditional manual review processes. The results surprised us.",
        body: [
            "We ran a 90-day controlled study across 20 engineering teams, comparing AI security review (via AgentFarm's security engineer role) against their existing manual security review processes.",
            "The headline finding: AI security review caught 91% of vulnerabilities that manual review caught, plus an additional 23% that manual review missed. The additional catches were predominantly in third-party dependency CVEs and misconfigured access policies — areas where automated, continuous scanning has a natural advantage.",
            "Manual review performed better in one category: novel vulnerability patterns in custom business logic. Human security engineers caught logical flaws in application-layer authorisation that the AI agent missed in 7 out of 20 teams.",
            "Mean time from vulnerability introduction to detection was 4.2 hours for AI review versus 11.6 days for manual review. This is the metric that most surprised us — the backlog problem in manual security review is severe.",
            "Teams using AI security review also reported that human security engineers shifted their time toward the high-value work: threat modelling, architecture review, and incident response — rather than CVE triage and dependency scanning.",
            "Our recommendation: AI security review should complement, not replace, human security expertise. The highest-performing teams in our study used AI for continuous monitoring and human engineers for high-judgment work. This combination outperformed either approach alone.",
        ],
    },
];

export function generateStaticParams() {
    return posts.map((p) => ({ slug: p.slug }));
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = posts.find((p) => p.slug === slug);
    if (!post) notFound();

    const related = posts.filter((p) => p.slug !== slug && p.category === post.category).slice(0, 2);

    return (
        <article className="site-shell min-h-screen">
            {/* Hero */}
            <div className="bg-gradient-to-br from-slate-50 to-sky-50/30 dark:from-slate-900 dark:to-sky-900/10 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                    <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 mb-8 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> All posts
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 mb-5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${post.categoryColor}`}>
                            <Tag className="w-3 h-3" /> {post.category}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                            <Calendar className="w-3.5 h-3.5" /> {post.date}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                            <Clock className="w-3.5 h-3.5" /> {post.readTime}
                        </span>
                    </div>

                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight mb-6">{post.title}</h1>

                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-8">{post.excerpt}</p>

                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {post.author.initials}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{post.author.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{post.author.role}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
                <div className="prose prose-slate dark:prose-invert max-w-none">
                    {post.body.map((para, i) => (
                        <p key={i} className="text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-6 last:mb-0">
                            {para}
                        </p>
                    ))}
                </div>

                {/* Divider */}
                <hr className="my-12 border-slate-200 dark:border-slate-800" />

                {/* Related posts */}
                {related.length > 0 && (
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-5">More in {post.category}</p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {related.map((r) => (
                                <Link
                                    key={r.slug}
                                    href={`/blog/${r.slug}`}
                                    className="group block p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 bg-slate-50 dark:bg-slate-900 hover:bg-sky-50/30 dark:hover:bg-sky-900/10 transition-all"
                                >
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mb-3 ${r.categoryColor}`}>{r.category}</span>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors leading-snug mb-2">{r.title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{r.readTime} · {r.date}</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* CTA */}
                <div className="mt-12 p-8 rounded-3xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-center">
                    <Bot className="w-8 h-8 text-white/80 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white mb-2">See AgentFarm in action</h3>
                    <p className="text-sm text-white/80 mb-5">Deploy your first AI engineer in under 10 minutes.</p>
                    <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-sky-700 font-semibold text-sm hover:bg-slate-50 transition-colors shadow-lg"
                    >
                        Start free trial
                    </Link>
                </div>
            </div>
        </article>
    );
}
