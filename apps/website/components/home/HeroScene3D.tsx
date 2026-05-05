"use client";

import { LayoutDashboard, CheckCircle2, FileText, Clock, GitMerge, AlertCircle } from "lucide-react";

export default function HeroScene3D() {
    const stages = [
        { label: "Task Intake", count: 24, status: "queued", active: true },
        { label: "Agent Execution", count: 18, status: "running", active: true },
        { label: "Evidence Logged", count: 151, status: "records", active: true },
        { label: "Awaiting Approval", count: 2, status: "high-risk", active: false },
        { label: "Merge Complete", count: 16, status: "shipped", active: false },
    ];

    const stats = [
        { icon: FileText, label: "PRs", value: "16", color: "text-slate-600 dark:text-slate-400" },
        { icon: AlertCircle, label: "Evidence", value: "151", color: "text-slate-600 dark:text-slate-400" },
        { icon: Clock, label: "Approvals", value: "2", color: "text-rose-600 dark:text-rose-400" },
    ];

    return (
        <div className="hero-3d-canvas-wrap rounded-2xl overflow-hidden bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 border border-cyan-200/60 dark:border-slate-700 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
                <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Agent Runtime Board</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                </span>
            </div>

            {/* Pipeline Stages */}
            <div className="px-5 py-5 space-y-2.5">
                {stages.map((stage) => (
                    <div
                        key={stage.label}
                        className="flex items-center justify-between p-3.5 rounded-lg border bg-white/60 dark:bg-slate-900/50 backdrop-blur"
                        style={{
                            borderColor: stage.active ? "rgb(186, 230, 253)" : "rgb(226, 232, 240)",
                            backgroundColor: stage.active
                                ? "rgba(240, 249, 255, 0.7)"
                                : "rgba(248, 250, 252, 0.6)",
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <span
                                className="w-3 h-3 rounded-full"
                                style={{
                                    backgroundColor: stage.active ? "#0ea5e9" : "#cbd5e1",
                                }}
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{stage.label}</span>
                        </div>
                        <span
                            className="text-sm font-semibold"
                            style={{
                                color: stage.status === "high-risk" ? "#ef4444" : stage.status === "shipped" ? "#3b82f6" : "#0ea5e9",
                            }}
                        >
                            {stage.count} {stage.status}
                        </span>
                    </div>
                ))}
            </div>

            {/* Stats Grid */}
            <div className="px-5 py-4 grid grid-cols-3 gap-3 border-t border-slate-200/60 dark:border-slate-700 bg-white/40 dark:bg-slate-900/30">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={stat.label}
                            className="rounded-lg border border-slate-200/60 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3.5 text-center backdrop-blur"
                        >
                            <div className="flex items-center justify-center gap-2 mb-1.5">
                                <Icon className={`w-4 h-4 ${stat.color}`} />
                            </div>
                            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{stat.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Approval Banner */}
            <div className="mx-5 mb-4 mt-4 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-900/20 px-3.5 py-2.5 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">High-risk changes require approval before merge</p>
            </div>
        </div>
    );
}
