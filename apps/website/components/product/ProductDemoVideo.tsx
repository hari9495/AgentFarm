"use client";

import { AnimatePresence, motion } from "motion/react";
import {
    BadgeCheck,
    Building2,
    Code2,
    GitPullRequest,
    Play,
    ShieldCheck,
    Users,
} from "lucide-react";
import { useEffect, useState } from "react";

type PersonaId = "cto" | "manager" | "developer";

type Scene = {
    eyebrow: string;
    title: string;
    detail: string;
    bubble: string;
    subtitle: string;
    metric: string;
    laneLabel: string;
    ctaLabel?: string;
    ctaHref?: string;
};

type PersonaStory = {
    label: string;
    icon: typeof Building2;
    accent: string;
    chip: string;
    duration: string;
    shortLabel: string;
    scenes: Scene[];
};

const STORIES: Record<PersonaId, PersonaStory> = {
    cto: {
        label: "CTO / Enterprise Buyer",
        icon: Building2,
        accent: "from-cyan-400 via-sky-500 to-blue-600",
        chip: "bg-cyan-500/15 text-cyan-200 border border-cyan-400/25",
        duration: "1:18",
        shortLabel: "Enterprise",
        scenes: [
            {
                eyebrow: "Executive View",
                title: "From backlog to governed execution",
                detail: "AgentFarm turns a Jira ticket into controlled delivery with policy enforcement, evidence capture, and approval gates.",
                bubble: "Show me velocity without losing control.",
                subtitle: "AgentFarm converts a Jira ticket into governed AI execution with approvals and auditability.",
                metric: "4x faster feature throughput",
                laneLabel: "Governed delivery",
            },
            {
                eyebrow: "Risk Control",
                title: "High-risk changes stop for sign-off",
                detail: "Every action is classified before execution. Medium and high-risk work pauses for human approval in Teams.",
                bubble: "No risky merge ships without sign-off.",
                subtitle: "Risk classification protects production by pausing sensitive work until a reviewer approves it.",
                metric: "100% approval-gated for high risk",
                laneLabel: "Risk gate active",
            },
            {
                eyebrow: "Audit Ready",
                title: "Evidence plane logs every move",
                detail: "Prompts, code changes, CI outcomes, and approval decisions are captured in a verifiable audit trail.",
                bubble: "Compliance review is ready at any moment.",
                subtitle: "Every prompt, code action, CI check, and approval is captured for enterprise review.",
                metric: "12 evidence records captured",
                laneLabel: "Audit trail complete",
            },
            {
                eyebrow: "Call To Action",
                title: "Launch trusted AI delivery across your engineering org",
                detail: "Start with a controlled rollout, connect GitHub and Jira, and let AgentFarm prove speed with governance.",
                bubble: "This is the operational layer for enterprise AI execution.",
                subtitle: "Book a live walkthrough or start a free trial to see governed AI delivery on your own backlog.",
                metric: "Ready for pilot rollout",
                laneLabel: "Start trusted rollout",
                ctaLabel: "Book Demo",
                ctaHref: "/#waitlist",
            },
        ],
    },
    manager: {
        label: "Engineering Manager",
        icon: Users,
        accent: "from-violet-400 via-fuchsia-500 to-pink-500",
        chip: "bg-violet-500/15 text-violet-200 border border-violet-400/25",
        duration: "1:04",
        shortLabel: "Manager",
        scenes: [
            {
                eyebrow: "Team Capacity",
                title: "Keep the roadmap moving without headcount drag",
                detail: "Developer Agent picks up routine implementation work while your team stays focused on architecture and product decisions.",
                bubble: "Take the ticket. I need my team on priorities.",
                subtitle: "Free your engineers from repetitive backlog execution and keep critical roadmap work moving.",
                metric: "First PR in under 15 minutes",
                laneLabel: "Workload offloaded",
            },
            {
                eyebrow: "Execution Visibility",
                title: "See progress across the runtime board",
                detail: "Track task intake, active execution, logged evidence, approvals, and merge status from one operating view.",
                bubble: "I can see what shipped and what is waiting.",
                subtitle: "One runtime board shows queued work, active execution, evidence captured, and approvals pending.",
                metric: "24 queued • 18 running",
                laneLabel: "Runtime visibility",
            },
            {
                eyebrow: "Delivery Confidence",
                title: "CI, reviews, and approvals stay in flow",
                detail: "The agent writes tests, opens PRs, and waits when risk requires a manager or on-call review.",
                bubble: "Velocity up, surprises down.",
                subtitle: "The agent handles CI and review prep so managers focus only on exceptions and risky decisions.",
                metric: "3 tests passing before review",
                laneLabel: "Review-ready PR",
            },
            {
                eyebrow: "Call To Action",
                title: "Scale delivery without adding management overhead",
                detail: "Put repetitive implementation into a governed agent workflow while your team stays focused on planning and architecture.",
                bubble: "Give my team leverage, not more process.",
                subtitle: "Start a free trial and see how AgentFarm improves delivery flow without losing visibility or control.",
                metric: "Manager-ready rollout",
                laneLabel: "Start free trial",
                ctaLabel: "Start Free Trial",
                ctaHref: "/#waitlist",
            },
        ],
    },
    developer: {
        label: "Developer Hands-On",
        icon: Code2,
        accent: "from-amber-300 via-orange-400 to-rose-500",
        chip: "bg-amber-500/15 text-amber-100 border border-amber-400/25",
        duration: "0:56",
        shortLabel: "Developer",
        scenes: [
            {
                eyebrow: "Daily Workflow",
                title: "Kick off implementation from the ticket",
                detail: "AgentFarm reads Jira context, opens a branch, writes the first pass, and gets the PR ready without repetitive setup work.",
                bubble: "Handle the boilerplate. I will review the real logic.",
                subtitle: "The agent handles ticket intake, branch setup, and the first implementation pass automatically.",
                metric: "Branch + PR drafted automatically",
                laneLabel: "Hands-on acceleration",
            },
            {
                eyebrow: "Code + Tests",
                title: "Ship with tests already written",
                detail: "The developer agent updates code, adds regression coverage, and reruns checks before asking for human attention.",
                bubble: "Code, tests, and CI in one motion.",
                subtitle: "Code changes, tests, and CI validation happen before you even open the PR.",
                metric: "47 LOC + 3 tests passing",
                laneLabel: "Execution in motion",
            },
            {
                eyebrow: "Trusted Merge",
                title: "Approve only when it matters",
                detail: "Low-risk work flows through. High-risk changes pause, explain the reason, and request review with evidence attached.",
                bubble: "I review the risky bits, not every tiny step.",
                subtitle: "You stay in control of risky changes while the agent accelerates the rest of the workflow.",
                metric: "PR #214 shipped in 4m 12s",
                laneLabel: "Trusted completion",
            },
            {
                eyebrow: "Call To Action",
                title: "Work like a senior engineer with extra execution power",
                detail: "Let AgentFarm handle the repetitive parts of delivery so you can spend time on architecture, debugging, and product thinking.",
                bubble: "I want a teammate that ships, not another chatbot.",
                subtitle: "Start free and watch your next ticket become a review-ready PR with tests and evidence included.",
                metric: "Developer-ready workflow",
                laneLabel: "Start building",
                ctaLabel: "Start Free Trial",
                ctaHref: "/#waitlist",
            },
        ],
    },
};

function CartoonScene({
    accent,
    bubble,
    laneLabel,
    stepIndex,
}: {
    accent: string;
    bubble: string;
    laneLabel: string;
    stepIndex: number;
}) {
    const leftArmAngle = [28, 55, -50, 65][stepIndex] ?? 28;
    const rightArmAngle = [-28, -12, 50, -65][stepIndex] ?? -28;
    const isSuccess = stepIndex >= 2;

    return (
        <div className="relative h-full min-h-[240px] overflow-hidden rounded-[22px] border border-slate-700/70 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] p-4 sm:p-5">
            <motion.div
                className="absolute inset-0"
                animate={{ x: `${stepIndex * -3}%`, scale: 1 + stepIndex * 0.015 }}
                transition={{ duration: 0.75, ease: "easeInOut" }}
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.18),transparent_24%),radial-gradient(circle_at_72%_28%,rgba(168,85,247,0.18),transparent_22%),radial-gradient(circle_at_78%_78%,rgba(59,130,246,0.16),transparent_20%)]" />
                <div className="absolute left-[8%] top-[18%] rounded-full border border-sky-400/15 bg-sky-400/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
                    <span className={`bg-gradient-to-r ${accent} bg-clip-text text-transparent`}>AgentFarm</span>
                </div>
                <div className={`absolute left-[5%] top-[33%] flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br ${accent} shadow-lg shadow-black/40`}>
                    <span className="text-sm font-black tracking-tight text-white">AF</span>
                </div>
                <div className="absolute left-[14%] top-[58%] h-20 w-20 rounded-[28px] border border-white/8 bg-white/4" />
                <div className="absolute right-[20%] top-[20%] h-24 w-24 rounded-[32px] border border-cyan-300/10 bg-cyan-300/5" />
                <div className="absolute right-[12%] bottom-[16%] rounded-2xl border border-violet-300/10 bg-violet-300/6 px-3 py-2 text-[10px] font-semibold text-violet-200">
                    Approval + Evidence
                </div>
            </motion.div>
            <div className="absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(ellipse_at_center,rgba(30,41,59,0.9),transparent_70%)]" />

            {[0, 1, 2].map((item) => (
                <motion.div
                    key={item}
                    className={`absolute rounded-2xl border border-white/10 bg-gradient-to-r ${accent} p-[1px] shadow-lg`}
                    style={{ top: `${18 + item * 18}%`, right: `${6 + item * 7}%` }}
                    animate={{ x: [0, 10, 0], y: [0, -8, 0], opacity: [0.68, 1, 0.68] }}
                    transition={{ repeat: Infinity, duration: 2.8 + item * 0.45, ease: "easeInOut" }}
                >
                    <div className="rounded-[15px] bg-slate-950/95 px-3 py-2">
                        <div className="h-1.5 w-14 rounded-full bg-white/20" />
                        <div className="mt-1.5 h-1.5 w-9 rounded-full bg-white/10" />
                    </div>
                </motion.div>
            ))}

            <motion.div
                className="absolute left-[11%] top-[12%] max-w-[210px] rounded-2xl border border-white/12 bg-white/8 px-4 py-3 backdrop-blur"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
            >
                <p className="text-[11px] leading-relaxed text-slate-100">{bubble}</p>
            </motion.div>

            <div className="absolute bottom-7 left-[12%] flex items-end gap-8">
                <motion.div
                    className="relative"
                    animate={{ y: [0, -8, 0], x: [0, 3, 0] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                >
                    <div className="relative h-28 w-20">
                        <div className="absolute bottom-0 left-1/2 h-16 w-14 -translate-x-1/2 rounded-[20px] bg-gradient-to-b from-cyan-400 to-blue-600 shadow-[0_14px_28px_-12px_rgba(37,99,235,0.7)]" />
                        <div className="absolute bottom-14 left-1/2 h-11 w-11 -translate-x-1/2 rounded-full bg-[#f1d3b3]" />
                        <div className="absolute bottom-[3.9rem] left-[1.4rem] h-2 w-2 rounded-full bg-slate-950" />
                        <div className="absolute bottom-[3.9rem] right-[1.4rem] h-2 w-2 rounded-full bg-slate-950" />
                        <div className={`absolute bottom-[3.35rem] left-1/2 h-1.5 -translate-x-1/2 rounded-full border-b-2 ${isSuccess ? "w-6 border-emerald-500" : "w-5 border-slate-900"}`} />
                        <motion.div
                            className="absolute bottom-9 left-0 h-11 w-3 origin-bottom rounded-full bg-blue-500"
                            animate={{ rotate: leftArmAngle }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        />
                        <motion.div
                            className="absolute bottom-9 right-0 h-11 w-3 origin-bottom rounded-full bg-blue-500"
                            animate={{ rotate: rightArmAngle }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        />
                    </div>
                </motion.div>

                <motion.div
                    className="relative"
                    animate={{ y: [0, -6, 0], x: [0, -2, 0] }}
                    transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut", delay: 0.35 }}
                >
                    <div className="relative h-24 w-16">
                        <div className="absolute bottom-0 left-1/2 h-14 w-11 -translate-x-1/2 rounded-[18px] bg-gradient-to-b from-violet-400 to-fuchsia-600" />
                        <div className="absolute bottom-12 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full bg-[#f5d9bd]" />
                        <div className="absolute bottom-[3.1rem] left-[1.05rem] h-1.5 w-1.5 rounded-full bg-slate-950" />
                        <div className="absolute bottom-[3.1rem] right-[1.05rem] h-1.5 w-1.5 rounded-full bg-slate-950" />
                    </div>
                </motion.div>
            </div>

            <motion.div
                className="absolute bottom-7 right-7 w-[40%] min-w-[140px] rounded-2xl border border-slate-700 bg-slate-900/92 p-3"
                animate={{ scale: [1, 1.02, 1], x: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 1.9, ease: "easeInOut" }}
            >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-slate-400">
                    <span>Runtime board</span>
                    <span>Live</span>
                </div>
                <div className="mt-3 space-y-2">
                    {["Task intake", "Execution", "Evidence", "Approval", "Merge"].map((label, idx) => {
                        const active = idx <= stepIndex;
                        return (
                            <div key={label} className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-400" : "bg-slate-700"}`} />
                                <div className="flex-1 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">
                                    {label}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-300">
                    {laneLabel}
                </div>
            </motion.div>
        </div>
    );
}

export default function ProductDemoVideo() {
    const [playing, setPlaying] = useState(false);
    const [persona, setPersona] = useState<PersonaId>("cto");
    const [step, setStep] = useState(0);
    const [captionIdx, setCaptionIdx] = useState(0);
    const [captionWords, setCaptionWords] = useState<string[]>([]);

    const currentStory = STORIES[persona];
    const currentScene = currentStory.scenes[step];
    const isFinalFrame = step === currentStory.scenes.length - 1;

    useEffect(() => {
        setStep(0);
    }, [persona]);

    useEffect(() => {
        const words = currentScene.subtitle.split(" ");
        setCaptionWords(words);
        setCaptionIdx(0);
        let idx = 0;
        const timer = setInterval(() => {
            idx += 1;
            setCaptionIdx(idx);
            if (idx >= words.length) clearInterval(timer);
        }, 85);
        return () => clearInterval(timer);
    }, [persona, step, currentScene.subtitle]);

    useEffect(() => {
        if (!playing) {
            return;
        }

        const interval = setInterval(() => {
            setStep((prev) => (prev + 1) % currentStory.scenes.length);
        }, 2300);

        return () => clearInterval(interval);
    }, [playing, currentStory.scenes.length]);

    return (
        <div className="relative aspect-video overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-950 shadow-[0_32px_90px_-45px_rgba(15,23,42,0.7)]">
            {!playing ? (
                <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.28),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_58%,#172554_100%)]">
                    <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_18%,transparent_35%)]" />
                    <div className="absolute left-6 top-6 flex gap-2">
                        {(Object.entries(STORIES) as Array<[PersonaId, PersonaStory]>).map(([id, item]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setPersona(id)}
                                className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${persona === id ? item.chip : "border border-white/10 bg-white/5 text-slate-300"
                                    }`}
                            >
                                {item.shortLabel}
                            </button>
                        ))}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center px-6">
                        <div className="max-w-[640px] text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">2D Cartoon Product Demo</p>
                            <h3 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
                                Watch AgentFarm explain itself for {currentStory.label}
                            </h3>
                            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                                A custom animated story that shows how your developer agents execute work, log evidence, and pause for approval before trusted delivery.
                            </p>
                            <div className="mt-8 flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPlaying(true)}
                                    className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-950 shadow-xl transition-transform hover:scale-[1.03]"
                                    aria-label="Play AgentFarm animated demo"
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
                                        <Play className="ml-0.5 h-4 w-4 fill-white" />
                                    </span>
                                    Play animated demo
                                </button>
                                <span className="rounded-full border border-white/12 bg-white/6 px-3 py-2 text-xs font-semibold text-slate-200">
                                    {currentStory.duration}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-5 left-5 flex items-center gap-2 text-[11px] text-slate-300">
                        <BadgeCheck className="h-4 w-4 text-emerald-300" />
                        Approval-gated, evidence-backed, tenant-isolated execution
                    </div>
                </div>
            ) : (
                <div className="h-full w-full bg-[linear-gradient(180deg,#020617_0%,#0f172a_100%)] p-4 sm:p-5">
                    <div className="flex h-full flex-col rounded-[26px] border border-slate-800 bg-slate-950/92 p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Animated Product Story</p>
                                <div className="mt-1 flex items-center gap-2 text-white">
                                    {(() => {
                                        const Icon = currentStory.icon;
                                        return <Icon className="h-4 w-4 text-sky-300" />;
                                    })()}
                                    <span className="text-sm font-semibold">{currentStory.label}</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {(Object.entries(STORIES) as Array<[PersonaId, PersonaStory]>).map(([id, item]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setPersona(id)}
                                        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${persona === id ? item.chip : "border border-white/10 bg-white/5 text-slate-300"
                                            }`}
                                    >
                                        {item.shortLabel}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep(0);
                                        setPlaying(false);
                                    }}
                                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200 transition-colors hover:bg-white/10"
                                >
                                    Close
                                </button>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center gap-1.5">
                            {currentStory.scenes.map((scene, idx) => (
                                <button
                                    key={scene.eyebrow}
                                    type="button"
                                    onClick={() => { setStep(idx); setPlaying(true); }}
                                    title={scene.eyebrow}
                                    className="group relative flex-1"
                                >
                                    <div className={`h-2 rounded-full transition-all duration-300 ${idx <= step ? `bg-gradient-to-r ${currentStory.accent}` : "bg-slate-800 hover:bg-slate-700"}`} />
                                    <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300 group-hover:block">
                                        {scene.eyebrow}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.95fr]">
                            <CartoonScene
                                accent={currentStory.accent}
                                bubble={currentScene.bubble}
                                laneLabel={currentScene.laneLabel}
                                stepIndex={step}
                            />

                            <div className="flex min-h-0 flex-col gap-3">
                                <div className="rounded-[22px] border border-slate-800 bg-slate-900/70 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{currentScene.eyebrow}</p>
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={`${persona}-${step}-content`}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.22 }}
                                        >
                                            <h4 className="mt-2 text-xl font-black tracking-tight text-white">{currentScene.title}</h4>
                                            <p className="mt-3 text-sm leading-relaxed text-slate-300">{currentScene.detail}</p>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>

                                <div className="rounded-[22px] border border-slate-800 bg-slate-900/70 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Subtitles</p>
                                    <p className="mt-3 min-h-[4rem] text-sm leading-relaxed text-slate-200">
                                        {captionWords.slice(0, captionIdx).join(" ")}
                                        {captionIdx < captionWords.length && (
                                            <motion.span
                                                animate={{ opacity: [1, 0, 1] }}
                                                transition={{ repeat: Infinity, duration: 0.7 }}
                                                className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-sky-400 align-middle"
                                            />
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-[22px] border border-slate-800 bg-slate-900/70 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Key Signal</p>
                                    <div className="mt-3 flex items-start gap-3">
                                        <div className={`rounded-2xl bg-gradient-to-br ${currentStory.accent} p-2 text-white`}>
                                            {persona === "cto" ? <ShieldCheck className="h-5 w-5" /> : persona === "manager" ? <Users className="h-5 w-5" /> : <GitPullRequest className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <p className="text-base font-bold text-white">{currentScene.metric}</p>
                                            <p className="mt-1 text-xs text-slate-400">Audience-specific proof point for {currentStory.shortLabel.toLowerCase()} view</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[22px] border border-slate-800 bg-slate-900/70 p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Story Beats</p>
                                    <div className="mt-3 space-y-2">
                                        {currentStory.scenes.map((scene, index) => {
                                            const active = index === step;
                                            const complete = index < step;
                                            return (
                                                <div key={scene.title} className="flex items-center gap-2.5">
                                                    <span className={`h-2.5 w-2.5 rounded-full ${active || complete ? "bg-sky-400" : "bg-slate-700"}`} />
                                                    <p className={`text-[11px] ${active ? "text-white" : complete ? "text-slate-300" : "text-slate-500"}`}>{scene.title}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {isFinalFrame && currentScene.ctaLabel && currentScene.ctaHref ? (
                                    <motion.a
                                        href={currentScene.ctaHref}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`inline-flex items-center justify-center rounded-[22px] bg-gradient-to-r ${currentStory.accent} px-5 py-4 text-sm font-bold text-white shadow-lg`}
                                    >
                                        {currentScene.ctaLabel}
                                    </motion.a>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
