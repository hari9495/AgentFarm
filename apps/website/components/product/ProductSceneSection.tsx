"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { CheckCircle2, ShieldAlert, GitPullRequest, FileCheck2, Bot } from "lucide-react";

const PIPELINE = [
    { label: "Task Intake", value: "24 queued", tone: "text-sky-700 dark:text-sky-300" },
    { label: "Agent Execution", value: "18 running", tone: "text-cyan-700 dark:text-cyan-300" },
    { label: "Evidence Logged", value: "151 records", tone: "text-emerald-700 dark:text-emerald-300" },
    { label: "Awaiting Approval", value: "2 high-risk", tone: "text-amber-700 dark:text-amber-300" },
    { label: "Merge Complete", value: "16 shipped", tone: "text-indigo-700 dark:text-indigo-300" },
] as const;

export default function ProductSceneSection() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "end start"],
    });
    const smoothProgress = useSpring(scrollYProgress, { stiffness: 80, damping: 26, mass: 0.34 });
    const [progress, setProgress] = useState(0);

    useMotionValueEvent(smoothProgress, "change", (latest) => {
        const clamped = Math.max(0, Math.min(1, latest));
        setProgress(clamped);
    });

    return (
        <section ref={sectionRef} className="py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 p-6 sm:p-8 shadow-xl">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-8 items-center">
                        <div>
                            <p className="text-xs uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300 font-semibold">Interactive Runtime View</p>
                            <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                                Scroll to inspect a real AgentFarm workflow from task intake to approved merge
                            </h2>
                            <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
                                Instead of abstract 3D geometry, this view mirrors actual product behavior: agent execution,
                                evidence logging, and approval gates before merge.
                            </p>
                            <div className="mt-6">
                                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <motion.div
                                        className="h-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"
                                        style={{ scaleX: smoothProgress, transformOrigin: "0% 50%" }}
                                    />
                                </div>
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Runtime perspective: {Math.round(progress * 100)}%</p>
                            </div>
                        </div>
                        <div className="h-[340px] sm:h-[420px] rounded-2xl overflow-hidden border border-sky-200/70 dark:border-slate-700 bg-gradient-to-b from-sky-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-5">
                            <div className="h-full rounded-xl border border-white/60 dark:border-slate-700/60 bg-white/75 dark:bg-slate-900/65 backdrop-blur p-3 sm:p-4 flex flex-col">
                                <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <Bot className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Agent Runtime Board</p>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">Live</span>
                                </div>

                                <div className="mt-3 space-y-2.5 flex-1">
                                    {PIPELINE.map((item, idx) => {
                                        const active = progress * (PIPELINE.length - 1) >= idx - 0.15;
                                        return (
                                            <div key={item.label} className="flex items-center gap-2.5">
                                                <div className={`h-2.5 w-2.5 rounded-full ${active ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                                                <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white/70 dark:bg-slate-900/60">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{item.label}</span>
                                                        <span className={`text-[10px] font-mono ${item.tone}`}>{item.value}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-white/70 dark:bg-slate-900/60">
                                        <div className="flex items-center gap-1.5">
                                            <GitPullRequest className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">PRs</p>
                                        </div>
                                        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">16</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-white/70 dark:bg-slate-900/60">
                                        <div className="flex items-center gap-1.5">
                                            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Evidence</p>
                                        </div>
                                        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">151</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-white/70 dark:bg-slate-900/60">
                                        <div className="flex items-center gap-1.5">
                                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Approvals</p>
                                        </div>
                                        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">2</p>
                                    </div>
                                </div>

                                <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    High-risk changes require approval before merge
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
