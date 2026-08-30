import type { Metadata } from "next";
import { Activity, ChevronRight } from "lucide-react";
import ActivityFeed from "@/components/dashboard/ActivityFeed";

export const metadata: Metadata = {
    title: "Activity - AgentFarms Dashboard",
    description: "Live activity feed across all AI agents.",
};

export default function DashboardActivityPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-deep)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <Activity className="w-3.5 h-3.5" />
                                Activity
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Live Feed</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Live Activity</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Real-time feed of every action, task, and event across all AI teammates.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <ActivityFeed />

            </div>
        </div>
    );
}
