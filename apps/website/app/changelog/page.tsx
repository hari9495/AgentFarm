"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Circle, Clock } from "lucide-react";
import { changelogEntriesContent, changelogListingContent } from "@/lib/marketing-content";

type Status = "shipped" | "in-progress" | "planned";

const statusConfig: Record<Status, { icon: typeof CheckCircle; label: string; color: string; bg: string }> = {
    shipped: { icon: CheckCircle, label: "Shipped", color: "#34c759", bg: "rgba(52,199,89,0.08)" },
    "in-progress": { icon: Clock, label: "In progress", color: "#ff9f0a", bg: "rgba(255,159,10,0.08)" },
    planned: { icon: Circle, label: "Planned", color: "#aeaeb2", bg: "rgba(174,174,178,0.08)" },
};

export default function ChangelogPage() {
    const [filter, setFilter] = useState<string>("All");
    const filters = changelogListingContent.filters;

    const filtered = filter === "All"
        ? changelogEntriesContent
        : changelogEntriesContent.filter((e) => {
            if (filter === "Shipped") return e.status === "shipped";
            if (filter === "In Progress") return e.status === "in-progress";
            if (filter === "Planned") return e.status === "planned";
            return true;
        });

    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 56 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{changelogListingContent.hero.eyebrow}</p>
                    <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        {changelogListingContent.hero.titleLead}{" "}
                        <span className="text-[#0066cc]">{changelogListingContent.hero.titleAccent}</span>
                    </h1>
                    <p className="mt-5 text-[17px] text-[#424245] max-w-lg mx-auto" style={{ lineHeight: 1.47 }}>
                        {changelogListingContent.hero.description}
                    </p>
                </div>
            </section>

            {/* Entries */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 0, paddingBottom: 80 }}>
                <div className="af-container-narrow">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-2 mb-8">
                        {filters.map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer"
                                style={{
                                    background: filter === f ? "#0066cc" : "#ffffff",
                                    color: filter === f ? "#ffffff" : "#6e6e73",
                                    border: filter === f ? "none" : "1px solid #d2d2d7",
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Entry list */}
                    <div className="space-y-4">
                        {filtered.map((entry, i) => {
                            const sc = statusConfig[entry.status as Status];
                            const Icon = sc.icon;
                            const slug = "versionSlug" in entry ? entry.versionSlug : null;
                            const version = "version" in entry ? entry.version : null;
                            const summary = "summary" in entry ? entry.summary : entry.description;

                            return (
                                <div
                                    key={`${entry.title}-${i}`}
                                    className="group rounded-[18px] p-6"
                                    style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span
                                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full"
                                                style={{ background: sc.bg, color: sc.color }}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                {sc.label}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-3 mb-2">
                                                {version && (
                                                    <span className="font-mono text-[13px] font-semibold text-[#0066cc]">{version}</span>
                                                )}
                                                <span className="text-[13px] text-[#aeaeb2]">{entry.date}</span>
                                            </div>
                                            {slug ? (
                                                <Link href={`/changelog/${slug}`} className="block">
                                                    <h3 className="font-semibold text-[17px] text-[#1d1d1f] mb-2 hover:text-[#0066cc] transition-colors" style={{ letterSpacing: "-0.018em" }}>
                                                        {entry.title}
                                                    </h3>
                                                </Link>
                                            ) : (
                                                <h3 className="font-semibold text-[17px] text-[#1d1d1f] mb-2" style={{ letterSpacing: "-0.018em" }}>
                                                    {entry.title}
                                                </h3>
                                            )}
                                            <p className="text-[14px] text-[#6e6e73] mb-3" style={{ lineHeight: 1.5 }}>{summary}</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {entry.tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                                        style={{ background: "rgba(0,102,204,0.06)", color: "#0066cc" }}
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
        </div>
    );
}
