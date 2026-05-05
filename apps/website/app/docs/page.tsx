import type { Metadata } from "next";
import Link from "next/link";
import { Zap, BookOpen, Code2, ArrowRight, Terminal, CheckCircle2, GitBranch, Shield, Activity, Plug, Layers, ChevronRight } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

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
  { icon: Activity, tone: "sky", title: "Task Lifecycle", description: "How tasks move from queued → executing → evidence → done, including pause points for approval.", href: "/docs/concepts#tasks" },
  { icon: Shield, tone: "rose", title: "Approval Gates", description: "Risk classification (LOW/MEDIUM/HIGH) and how approval routing works across Teams, email, and API.", href: "/docs/concepts#approvals" },
  { icon: GitBranch, tone: "violet", title: "Git Integration", description: "Branch naming conventions, PR authoring, review comment handling, and merge conditions.", href: "/docs/concepts#git" },
  { icon: Plug, tone: "amber", title: "Connectors", description: "OAuth and API key connectors — how they authenticate, refresh tokens, and handle errors.", href: "/docs/concepts#connectors" },
  { icon: Terminal, tone: "emerald", title: "Sandbox Runtime", description: "Per-task ephemeral containers, file system isolation, and network policies.", href: "/docs/concepts#runtime" },
  { icon: CheckCircle2, tone: "sky", title: "Evidence Plane", description: "Every agent action creates an immutable evidence record. Query and export for compliance.", href: "/docs/concepts#evidence" },
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
    <div className="site-shell">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-3">
          AgentFarm{" "}
          <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Docs</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed max-w-2xl">
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
            className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <div className="mb-4">
              <PremiumIcon
                icon={Icon}
                tone="sky"
                containerClassName={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white border-white/20`}
                iconClassName="w-5 h-5"
              />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {description}
            </p>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:underline">
              {cta}
            </span>
          </Link>
        ))}
      </div>

      {/* Quickstart steps */}
      <div className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <PremiumIcon icon={Zap} tone="amber" containerClassName="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-4 h-4" />
          Quickstart — deploy your first AI worker
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickstartSteps.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{step.label}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{step.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{step.description}</p>
              {step.code && (
                <div className="mt-3 rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                  {step.code}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Core concepts */}
      <div className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <PremiumIcon icon={Layers} tone="violet" containerClassName="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-4 h-4" />
          Core concepts
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {concepts.map((c) => (
            <Link key={c.title} href={c.href} className="group flex items-start gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-violet-300 dark:hover:border-violet-700 transition-colors">
              <PremiumIcon icon={c.icon} tone={c.tone as Parameters<typeof PremiumIcon>[0]["tone"]} containerClassName="w-9 h-9 rounded-xl shrink-0" iconClassName="w-4 h-4" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{c.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{c.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5 group-hover:text-violet-400 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* API reference preview */}
      <div className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
          <PremiumIcon icon={Code2} tone="sky" containerClassName="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-4 h-4" />
          REST API reference
        </h2>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">Base URL: <span className="text-sky-600 dark:text-sky-400">https://api.agentfarm.ai/v1</span></p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {apiEndpoints.map((ep) => (
              <div key={ep.method + ep.path} className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <span className={`shrink-0 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono ${ep.method === "GET" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : ep.method === "POST" ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : ep.method === "PATCH" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"}`}>
                  {ep.method}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-800 dark:text-slate-200">{ep.path}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ep.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <Link href="/docs/api-reference" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
              View full API reference <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Popular topics */}
      <div className="mt-10 border-t border-slate-100 dark:border-slate-800 pt-8">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
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
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline py-1"
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

