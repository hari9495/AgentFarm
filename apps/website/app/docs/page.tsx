import type { Metadata } from "next";
import Link from "next/link";
import { Zap, BookOpen, Code2, ArrowRight } from "lucide-react";

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
    cta: "Get started ?",
    gradient: "from-orange-500 to-amber-500",
  },
  {
    icon: BookOpen,
    title: "How Robots Work",
    description: "Understand the task lifecycle, sandboxing, and memory model.",
    href: "/docs/concepts",
    cta: "Read concepts ?",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    icon: Code2,
    title: "REST API",
    description: "Programmatically manage workers and tasks via our REST API.",
    href: "/docs/api-reference",
    cta: "View reference ?",
    gradient: "from-violet-500 to-blue-500",
  },
];

export default function DocsOverviewPage() {
  return (
    <div className="site-shell">
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

      <div className="grid sm:grid-cols-3 gap-5 mb-12">
        {cards.map(({ icon: Icon, title, description, href, cta, gradient }) => (
          <Link
            key={title}
            href={href}
            className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-sm`}>
              <Icon className="w-5 h-5 text-white" />
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

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-800/50 rounded-xl p-5">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <strong>Early Access Notice:</strong> Full documentation is being
          written alongside product development. Missing something?{" "}
          <Link href="/contact" className="underline font-medium">
            Let us know
          </Link>{" "}
          and we&apos;ll prioritise it.
        </p>
      </div>

      <div className="mt-10 border-t border-slate-100 dark:border-slate-800 pt-8">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Popular topics
        </h2>
        <ul className="space-y-2">
          {[
            { label: "Connecting GitHub ?", href: "/docs/quickstart#github" },
            { label: "Installing the Slack bot ?", href: "/docs/quickstart#slack" },
            { label: "Task assignment syntax ?", href: "/docs/concepts#tasks" },
            { label: "API authentication ?", href: "/docs/api-reference#auth" },
            { label: "Webhook events ?", href: "/docs/api-reference#webhooks" },
          ].map(({ label, href }) => (
            <li key={label}>
              <Link
                href={href}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}



