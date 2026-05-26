import type { Metadata } from "next";
import Link from "next/link";
import {
    Activity,
    ArrowRight,
    BookOpen,
    CheckCircle2,
    ChevronRight,
    Code2,
    GitBranch,
    Layers,
    Plug,
    Shield,
    Terminal,
    Zap,
} from "lucide-react";
import { docsOverviewContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: docsOverviewContent.metadata.title,
    description: docsOverviewContent.metadata.description,
};

const cards = [
    { icon: Zap, ...docsOverviewContent.cards[0] },
    { icon: BookOpen, ...docsOverviewContent.cards[1] },
    { icon: Code2, ...docsOverviewContent.cards[2] },
];

const concepts = [
    { icon: Activity, ...docsOverviewContent.concepts[0] },
    { icon: Shield, ...docsOverviewContent.concepts[1] },
    { icon: GitBranch, ...docsOverviewContent.concepts[2] },
    { icon: Plug, ...docsOverviewContent.concepts[3] },
    { icon: Terminal, ...docsOverviewContent.concepts[4] },
    { icon: CheckCircle2, ...docsOverviewContent.concepts[5] },
];

export default function DocsOverviewPage() {
    return (
        <div>
            <div className="mb-10">
                <h1 className="mb-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                    AgentFarm{" "}
                    <span className="bg-gradient-to-r from-[var(--accent-blue)] to-purple-400 bg-clip-text text-transparent">
                        Docs
                    </span>
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-[var(--mute)]">
                    {docsOverviewContent.hero.description}
                </p>
            </div>

            <div className="mb-14 grid gap-5 sm:grid-cols-3">
                {cards.map(({ icon: Icon, title, description, href, cta, gradient }) => (
                    <Link
                        key={title}
                        href={href}
                        className="group rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--accent-blue)]/40 hover:shadow-lg"
                    >
                        <div className="mb-4">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient}`}>
                                <Icon className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <h2 className="mb-2 font-semibold text-[var(--ink)]">{title}</h2>
                        <p className="mb-4 text-sm leading-relaxed text-[var(--mute)]">{description}</p>
                        <span className="text-sm font-medium text-[var(--accent-blue)] group-hover:underline">{cta}</span>
                    </Link>
                ))}
            </div>

            <div className="mb-14">
                <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-[var(--ink)]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
                        <Zap className="h-4 w-4 text-amber-400" />
                    </div>
                    {docsOverviewContent.quickstartTitle}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {docsOverviewContent.quickstartSteps.map((step, index) => (
                        <div key={step.title} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5">
                            <div className="mb-3 flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue)] text-xs font-bold text-[#07080a]">
                                    {index + 1}
                                </span>
                                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ash)]">{step.label}</span>
                            </div>
                            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">{step.title}</h3>
                            <p className="text-xs leading-relaxed text-[var(--mute)]">{step.description}</p>
                            {step.code ? (
                                <div className="mt-3 overflow-x-auto rounded-lg bg-[var(--canvas)] px-3 py-2 font-mono text-[11px] text-[var(--accent-green)]">
                                    {step.code}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mb-14">
                <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-[var(--ink)]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
                        <Layers className="h-4 w-4 text-violet-400" />
                    </div>
                    {docsOverviewContent.conceptsTitle}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {concepts.map((concept) => (
                        <Link
                            key={concept.title}
                            href={concept.href}
                            className="group flex items-start gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5 transition-colors hover:border-[var(--accent-blue)]/40"
                        >
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${concept.gradient}`}>
                                <concept.icon className="h-4 w-4 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent-blue)]">
                                    {concept.title}
                                </h3>
                                <p className="mt-0.5 text-xs leading-relaxed text-[var(--mute)]">{concept.description}</p>
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ash)] transition-colors group-hover:text-[var(--accent-blue)]" />
                        </Link>
                    ))}
                </div>
            </div>

            <div className="mb-14">
                <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-[var(--ink)]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-blue)]/20">
                        <Code2 className="h-4 w-4 text-[var(--accent-blue)]" />
                    </div>
                    {docsOverviewContent.apiTitle}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)]">
                    <div className="border-b border-[var(--hairline)] bg-[var(--surface-el)] px-5 py-3">
                        <p className="text-xs font-mono text-[var(--mute)]">
                            Base URL: <span className="text-[var(--accent-blue)]">{docsOverviewContent.apiBaseUrl}</span>
                        </p>
                    </div>
                    <div className="divide-y divide-[var(--hairline)]">
                        {docsOverviewContent.apiEndpoints.map((endpoint) => (
                            <div
                                key={`${endpoint.method}${endpoint.path}`}
                                className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--surface-el)]"
                            >
                                <span
                                    className={`inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                                        endpoint.method === "GET"
                                            ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]"
                                            : endpoint.method === "POST"
                                              ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                                              : "bg-amber-400/10 text-amber-400"
                                    }`}
                                >
                                    {endpoint.method}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-mono text-[var(--ink)]">{endpoint.path}</p>
                                    <p className="mt-0.5 text-xs text-[var(--mute)]">{endpoint.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-[var(--hairline)] bg-[var(--surface-el)] px-5 py-3">
                        <Link href={docsOverviewContent.apiLink.href} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-blue)] hover:underline">
                            {docsOverviewContent.apiLink.label} <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="mt-10 border-t border-[var(--hairline)] pt-8">
                <h2 className="mb-4 text-base font-semibold text-[var(--ink)]">Popular topics</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {docsOverviewContent.popularTopics.map(({ label, href }) => (
                        <li key={label}>
                            <Link href={href} className="flex items-center gap-2 py-1 text-sm text-[var(--accent-blue)] hover:underline">
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
