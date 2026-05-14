import type { Metadata } from "next";
import Link from "next/link";
import { Zap, BookOpen, Code2, ArrowRight, Terminal, CheckCircle2, GitBranch, Shield, Activity, Plug, Layers, ChevronRight } from "lucide-react";


export const metadata: Metadata = {
  title: "Documentation — AgentFarm",
  description:
    "AgentFarm developer docs — quickstart guides, core concepts, and API reference.",
};

const cards = [
  {
    icon: Zap,
    title: "Quickstart",
    description: "Deploy your first AI worker in under 10 minutes.",
    href: "/docs/quickstart",
    cta: "Get started →",
    gradient: "from-orange-500 to-amber-500",
  },
  {
    icon: BookOpen,
    title: "How Robots Work",
    description: "Understand the task lifecycle, sandboxing, and memory model.",
    href: "/docs/concepts",
    cta: "Read concepts →",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    icon: Code2,
    title: "REST API",
    description: "Programmatically manage workers and tasks via our REST API.",
    href: "/docs/api-reference",
    cta: "View reference →",
    gradient: "from-violet-500 to-blue-500",
  },
];

const quickstartSteps = [
  {
    label: "Step 1",
    title: "Sign up & create workspace",
    description: "Create your AgentFarm account and set up your first workspace with your organization name.",
    code: null,
  },
  {
    label: "Step 2",
    title: "Connect GitHub",
    description: "Authorize AgentFarm to your GitHub org. We request only the scopes your agent needs.",
    code: "POST /v1/connectors\n{ tool: \"github\" }",
  },
  {
    label: "Step 3",
    title: "Install skills",
    description: "Pick skills from the marketplace — Create PR, Run CI Checks, Fix Test Failures, and more.",
    code: "POST /v1/marketplace/invoke\n{ skill: \"workspace_create_pr\" }",
  },
  {
    label: "Step 4",
    title: "Assign your first task",
    description: "Send the agent a task via API, dashboard, or Slack. Your first PR will be open in minutes.",
    code: "POST /v1/tasks\n{ prompt: \"Add input validation to /api/users\" }",
  },
];

const concepts = [
  { icon: Activity, gradient: "from-[var(--accent-blue)] to-cyan-500", title: "Task Lifecycle", description: "How tasks move from queued → executing → evidence → done, including pause points for approval.", href: "/docs/concepts#tasks" },
  { icon: Shield, gradient: "from-rose-500 to-pink-500", title: "Approval Gates", description: "Risk classification (LOW/MEDIUM/HIGH) and how approval routing works across Teams, email, and API.", href: "/docs/concepts#approvals" },
  { icon: GitBranch, gradient: "from-violet-500 to-blue-500", title: "Git Integration", description: "Branch naming conventions, PR authoring, review comment handling, and merge conditions.", href: "/docs/concepts#git" },
  { icon: Plug, gradient: "from-amber-500 to-orange-500", title: "Connectors", description: "OAuth and API key connectors — how they authenticate, refresh tokens, and handle errors.", href: "/docs/concepts#connectors" },
  { icon: Terminal, gradient: "from-[var(--accent-green)] to-teal-500", title: "Sandbox Runtime", description: "Per-task ephemeral containers, file system isolation, and network policies.", href: "/docs/concepts#runtime" },
  { icon: CheckCircle2, gradient: "from-[var(--accent-blue)] to-cyan-400", title: "Evidence Plane", description: "Every agent action creates an immutable evidence record. Query and export for compliance.", href: "/docs/concepts#evidence" },
];

const apiEndpoints = [
  { method: "GET", path: "/tasks", description: "List all tasks for the workspace with status and evidence links" },
  { method: "POST", path: "/tasks", description: "Submit a new task to the active agent with a natural-language prompt" },
  { method: "GET", path: "/tasks/:id", description: "Get full task detail including sub-steps and evidence records" },
  { method: "POST", path: "/marketplace/invoke", description: "Directly invoke a skill by name with a context payload" },
  { method: "GET", path: "/connectors", description: "List configured connectors and their health status" },
  { method: "POST", path: "/connectors", description: "Add a new connector with auth credentials" },
  { method: "GET", path: "/evidence", description: "Query the evidence plane with filters for date, agent, risk level" },
  { method: "PATCH", path: "/approvals/:id", description: "Approve or reject a pending approval request" },
];


export default function DocsOverviewPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">
          AgentFarm{" "}
          <span className="bg-gradient-to-r from-[var(--accent-blue)] to-purple-400 bg-clip-text text-transparent">Docs</span>
        </h1>
        <p className="text-[var(--mute)] text-lg leading-relaxed max-w-2xl">
          Everything you need to deploy AI workers, connect your stack, and
          monitor output — from quickstart to API reference.
        </p>
      </div>

      {/* Top nav cards */}
      <div className="grid sm:grid-cols-3 gap-5 mb-14">
        {cards.map(({ icon: Icon, title, description, href, cta, gradient }) => (
          <Link
            key={title}
            href={href}
            className="group p-6 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] hover:border-[var(--accent-blue)]/40 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <div className="mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <h2 className="font-semibold text-[var(--ink)] mb-2">{title}</h2>
            <p className="text-sm text-[var(--mute)] leading-relaxed mb-4">
              {description}
            </p>
            <span className="text-sm font-medium text-[var(--accent-blue)] group-hover:underline">
              {cta}
            </span>
          </Link>
        ))}
      </div>

      {/* Quickstart steps */}
      <div className="mb-14">
        <h2 className="text-xl font-semibold text-[var(--ink)] mb-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center"><Zap className="w-4 h-4 text-amber-400" /></div>
          Quickstart — deploy your first AI worker
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickstartSteps.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex h-6 w-6 rounded-full bg-[var(--accent-blue)] text-[#07080a] text-xs font-bold items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ash)]">{step.label}</span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--ink)] mb-2">{step.title}</h3>
              <p className="text-xs text-[var(--mute)] leading-relaxed">{step.description}</p>
              {step.code && (
                <div className="mt-3 rounded-lg bg-[var(--canvas)] px-3 py-2 font-mono text-[11px] text-[var(--accent-green)] overflow-x-auto">
                  {step.code}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Core concepts */}
      <div className="mb-14">
        <h2 className="text-xl font-semibold text-[var(--ink)] mb-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center"><Layers className="w-4 h-4 text-violet-400" /></div>
          Core concepts
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {concepts.map((c) => (
            <Link key={c.title} href={c.href} className="group flex items-start gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5 hover:border-[var(--accent-blue)]/40 transition-colors">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0`}>
                <c.icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--ink)] group-hover:text-[var(--accent-blue)] transition-colors">{c.title}</h3>
                <p className="text-xs text-[var(--mute)] mt-0.5 leading-relaxed">{c.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--ash)] shrink-0 mt-0.5 group-hover:text-[var(--accent-blue)] transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* API reference preview */}
      <div className="mb-14">
        <h2 className="text-xl font-semibold text-[var(--ink)] mb-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-blue)]/20 flex items-center justify-center"><Code2 className="w-4 h-4 text-[var(--accent-blue)]" /></div>
          REST API reference
        </h2>
        <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--hairline)] bg-[var(--surface-el)]">
            <p className="text-xs font-mono text-[var(--mute)]">Base URL: <span className="text-[var(--accent-blue)]">https://api.agentfarm.ai/v1</span></p>
          </div>
          <div className="divide-y divide-[var(--hairline)]">
            {apiEndpoints.map((ep) => (
              <div key={ep.method + ep.path} className="flex items-start gap-4 px-5 py-3.5 hover:bg-[var(--surface-el)] transition-colors">
                <span className={`shrink-0 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono ${ep.method === "GET" ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : ep.method === "POST" ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]" : ep.method === "PATCH" ? "bg-amber-400/10 text-amber-400" : "bg-rose-500/10 text-rose-400"}`}>
                  {ep.method}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-[var(--ink)]">{ep.path}</p>
                  <p className="text-xs text-[var(--mute)] mt-0.5">{ep.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[var(--hairline)] bg-[var(--surface-el)]">
            <Link href="/docs/api-reference" className="text-xs font-semibold text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1">
              View full API reference <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Popular topics */}
      <div className="mt-10 border-t border-[var(--hairline)] pt-8">
        <h2 className="text-base font-semibold text-[var(--ink)] mb-4">
          Popular topics
        </h2>
        <ul className="grid sm:grid-cols-2 gap-2">
          {[
            { label: "Connecting GitHub", href: "/docs/quickstart#github" },
            { label: "Installing the Slack bot", href: "/docs/quickstart#slack" },
            { label: "Task assignment syntax", href: "/docs/concepts#tasks" },
            { label: "API authentication", href: "/docs/api-reference#auth" },
            { label: "Webhook events", href: "/docs/api-reference#webhooks" },
            { label: "Approval policy configuration", href: "/docs/concepts#approvals" },
          ].map(({ label, href }) => (
            <li key={label}>
              <Link
                href={href}
                className="flex items-center gap-2 text-sm text-[var(--accent-blue)] hover:underline py-1"
              >
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

