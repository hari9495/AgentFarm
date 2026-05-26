"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    ChevronRight,
    CircleCheck,
    Clock,
    Code2,
    GitPullRequest,
    ShieldCheck,
    Terminal,
    TrendingUp,
    Users,
    XCircle,
    Zap,
} from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

const ease = [0.22, 1, 0.36, 1] as const;

function HirePanel() {
    const panel = homeMarketingContent.features.tabs[0].panel;

    return (
        <div className="flex flex-col gap-4 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)]">Role marketplace</p>
            <div className="grid grid-cols-2 gap-2.5">
                {panel.roles.map((role) => (
                    <div key={role.name} className="flex items-center justify-between rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: `${role.color}22` }}>
                                <Users className="h-3 w-3" style={{ color: role.color }} />
                            </div>
                            <span className="text-[12px] font-medium text-[var(--ink)]">{role.name}</span>
                        </div>
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: role.color, background: `${role.color}18` }}>
                            {role.badge}
                        </span>
                    </div>
                ))}
            </div>
            <button className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#57c1ff] py-2.5 text-[12px] font-bold text-[#050c14]">
                {panel.buttonLabel}
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <p className="text-center text-[10px] text-[var(--mute)]">{panel.footnote}</p>
        </div>
    );
}

function ExecutePanel() {
    const panel = homeMarketingContent.features.tabs[1].panel;

    return (
        <div className="flex flex-col gap-3 p-6">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)]">Execution timeline</p>
            {panel.steps.map((step, index) => {
                const Icon = index === 0 ? Code2 : index === 1 || index === 4 ? GitPullRequest : index === 2 ? Terminal : CircleCheck;
                return (
                    <div key={step.label} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${step.color}22` }}>
                                <Icon className="h-3 w-3" style={{ color: step.color }} />
                            </div>
                            {index < panel.steps.length - 1 ? <div className="mt-1 min-h-[16px] w-px flex-1" style={{ background: `${step.color}30` }} /> : null}
                        </div>
                        <div className="pb-1">
                            <p className="text-[12px] font-semibold text-[var(--ink)]">{step.label}</p>
                            <p className="text-[10px] text-[var(--mute)]">{step.detail}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ControlPanel() {
    const panel = homeMarketingContent.features.tabs[2].panel;

    return (
        <div className="flex flex-col gap-3 p-6">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)]">Approval queue</p>
            {panel.items.map((item) => (
                <div key={item.title} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} />
                        <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-[var(--ink)]">{item.title}</p>
                            <p className="text-[10px] text-[var(--mute)]">{item.status}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: item.color, background: `${item.color}18` }}>
                            {item.risk}
                        </span>
                        {item.risk !== "LOW" ? (
                            <>
                                <button className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-[#59d499]/20">
                                    <CircleCheck className="h-3 w-3 text-[#59d499]" />
                                </button>
                                <button className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-[#ff5757]/20">
                                    <XCircle className="h-3 w-3 text-[#ff5757]" />
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ScalePanel() {
    const panel = homeMarketingContent.features.tabs[3].panel;

    return (
        <div className="flex flex-col gap-4 p-6">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)]">Output dashboard</p>
            <div className="grid grid-cols-2 gap-2.5">
                {panel.stats.map((stat, index) => {
                    const Icon = index === 0 ? GitPullRequest : index === 1 ? Clock : index === 2 ? TrendingUp : Zap;
                    return (
                        <div key={stat.label} className="rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-4 py-3">
                            <div className="mb-1.5 flex items-center gap-1.5">
                                <Icon className="h-3 w-3" style={{ color: stat.color }} />
                                <p className="text-[10px] text-[var(--mute)]">{stat.label}</p>
                            </div>
                            <p className="text-[18px] font-black leading-none text-[var(--ink)]">{stat.value}</p>
                            <p className="mt-0.5 text-[10px]" style={{ color: stat.color }}>{stat.delta}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function renderPanel(id: string) {
    if (id === "hire") return <HirePanel />;
    if (id === "execute") return <ExecutePanel />;
    if (id === "control") return <ControlPanel />;
    return <ScalePanel />;
}

export default function Features() {
    const content = homeMarketingContent.features;
    const [active, setActive] = useState<(typeof content.tabs)[number]["id"]>(content.tabs[0].id);
    const tab = content.tabs.find((item) => item.id === active) ?? content.tabs[0];

    return (
        <section className="border-t border-[var(--hairline)] bg-[var(--canvas)] py-24" id="features">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.5, ease }}
                    className="mb-12 max-w-2xl"
                >
                    <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-green)]">{content.eyebrow}</p>
                    <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.03em] text-[var(--ink)]">
                        {content.title}
                        <span className="block text-[var(--mute)]">{content.titleAccent}</span>
                    </h2>
                </motion.div>

                <div className="mb-10 flex flex-wrap gap-2">
                    {content.tabs.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActive(item.id)}
                            className="flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200"
                            style={
                                active === item.id
                                    ? { background: `${item.color}18`, borderColor: `${item.color}50`, color: item.color }
                                    : { background: "transparent", borderColor: "var(--hairline)", color: "var(--mute)" }
                            }
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={active}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3, ease }}
                        className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2"
                    >
                        <div>
                            <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${tab.color}22` }}>
                                {active === "hire" ? (
                                    <Users className="h-5 w-5" style={{ color: tab.color }} />
                                ) : active === "execute" ? (
                                    <Terminal className="h-5 w-5" style={{ color: tab.color }} />
                                ) : active === "control" ? (
                                    <ShieldCheck className="h-5 w-5" style={{ color: tab.color }} />
                                ) : (
                                    <BarChart3 className="h-5 w-5" style={{ color: tab.color }} />
                                )}
                            </div>

                            <h3 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-tight tracking-[-0.03em] text-[var(--ink)]">
                                {tab.headline}
                            </h3>
                            <p className="mb-6 leading-relaxed text-[var(--mute)]">{tab.description}</p>

                            <ul className="space-y-3">
                                {tab.points.map((point) => (
                                    <li key={point} className="flex items-start gap-3 text-sm text-[var(--mute)]">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tab.color }} />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)]">
                            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
                                <span className="text-[11px] font-semibold text-[var(--ash)]">{tab.label}</span>
                                <span className="text-[10px] text-[var(--mute)]">agentfarm.ai</span>
                            </div>
                            {renderPanel(active)}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </section>
    );
}
