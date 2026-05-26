"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Circle, Clock } from "lucide-react";
import { changelogEntriesContent, changelogListingContent } from "@/lib/marketing-content";

type Status = (typeof changelogEntriesContent)[number]["status"];
type FilterLabel = (typeof changelogListingContent.filters)[number];

const statusConfig: Record<
    Status,
    {
        icon: typeof CheckCircle;
        label: string;
        iconClass: string;
        bg: string;
        text: string;
    }
> = {
    shipped: {
        icon: CheckCircle,
        label: "Shipped",
        iconClass: "text-[var(--accent-green)]",
        bg: "bg-[var(--accent-green)]/10",
        text: "text-[var(--accent-green)]",
    },
    "in-progress": {
        icon: Clock,
        label: "In Progress",
        iconClass: "text-[var(--accent-blue)]",
        bg: "bg-[var(--accent-blue)]/10",
        text: "text-[var(--accent-blue)]",
    },
    planned: {
        icon: Circle,
        label: "Planned",
        iconClass: "text-[var(--ash)]",
        bg: "bg-[var(--surface-el)]",
        text: "text-[var(--mute)]",
    },
};

export default function ChangelogPage() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterLabel>("All");

    const filteredEntries = changelogEntriesContent.filter((entry) => {
        const matchesFilter =
            filter === "All" ||
            (filter === "Shipped" && entry.status === "shipped") ||
            (filter === "In Progress" && entry.status === "in-progress") ||
            (filter === "Planned" && entry.status === "planned");

        const query = search.toLowerCase();
        const matchesSearch =
            !query ||
            entry.title.toLowerCase().includes(query) ||
            entry.description.toLowerCase().includes(query) ||
            entry.tags.some((tag) => tag.toLowerCase().includes(query));

        return matchesFilter && matchesSearch;
    });

    const shipped = filteredEntries.filter((entry) => entry.status === "shipped");
    const upcoming = filteredEntries.filter((entry) => entry.status !== "shipped");

    return (
        <div>
            <section className="relative py-24 border-b border-[var(--hairline)] overflow-hidden">
                <div className="absolute inset-0 bg-[var(--canvas)] pointer-events-none" />
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <span className="chip chip-accent mb-4">{changelogListingContent.hero.eyebrow}</span>
                    <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-[var(--ink)] tracking-[-0.03em]">
                        {changelogListingContent.hero.titleLead}{" "}
                        <span className="bg-gradient-to-r from-[var(--accent-green)] to-[var(--accent-blue)] bg-clip-text text-transparent">
                            {changelogListingContent.hero.titleAccent}
                        </span>
                    </h1>
                    <p className="mt-5 text-xl text-[var(--mute)] max-w-2xl leading-relaxed">
                        {changelogListingContent.hero.description}
                    </p>
                </div>
            </section>

            <div className="border-b border-[var(--hairline)] bg-[var(--canvas)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        {changelogListingContent.filters.map((item) => (
                            <button
                                key={item}
                                onClick={() => setFilter(item)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                                    filter === item
                                        ? "bg-[var(--ink)] text-[var(--canvas)] border-[var(--ink)]"
                                        : "border-[var(--hairline)] text-[var(--mute)] hover:border-[var(--ash)]"
                                }`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                    <div className="sm:ml-auto">
                        <input
                            type="search"
                            placeholder={changelogListingContent.searchPlaceholder}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="text-xs rounded-lg border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] px-3 py-2 w-52 placeholder:text-[var(--ash)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]"
                        />
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
                <div className="max-w-3xl mx-auto space-y-20">
                    <div>
                        <h2 className="text-xl font-semibold text-[var(--ink)] mb-8 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" /> {changelogListingContent.shippedTitle}
                        </h2>
                        <div className="space-y-8 border-l-2 border-[var(--hairline)] pl-6">
                            {shipped.map((entry) => (
                                <div key={entry.title} className="relative">
                                    <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-[var(--accent-green)] bg-[var(--canvas)]" />
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        {entry.version && (
                                            <span className="text-xs font-bold bg-[var(--surface-el)] text-[var(--body-color)] px-2 py-0.5 rounded-md">
                                                {entry.version}
                                            </span>
                                        )}
                                        <span className="text-xs text-[var(--ash)]">{entry.date}</span>
                                        {entry.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-xs bg-[var(--surface-el)] border border-[var(--hairline)] text-[var(--mute)] px-2 py-0.5 rounded-md"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <h3 className="font-semibold text-[var(--ink)] mb-1">{entry.title}</h3>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{entry.description}</p>
                                    {entry.versionSlug && (
                                        <Link
                                            href={`/changelog/${entry.versionSlug}`}
                                            className="mt-2 inline-block text-xs font-semibold text-[var(--accent-blue)] hover:underline"
                                        >
                                            View entry
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold text-[var(--ink)] mb-8 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-500" /> {changelogListingContent.roadmapTitle}
                        </h2>
                        <div className="space-y-8 border-l-2 border-dashed border-[var(--hairline)] pl-6">
                            {upcoming.map((entry) => {
                                const status = statusConfig[entry.status];
                                return (
                                    <div key={entry.title} className="relative">
                                        <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-[var(--ash)] bg-[var(--canvas)]" />
                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                                                {status.label}
                                            </span>
                                            <span className="text-xs text-[var(--ash)]">{entry.date}</span>
                                            {entry.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="text-xs bg-[var(--surface-el)] border border-[var(--hairline)] text-[var(--mute)] px-2 py-0.5 rounded-md"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <h3 className="font-semibold text-[var(--ink)] mb-1">{entry.title}</h3>
                                        <p className="text-sm text-[var(--mute)] leading-relaxed">{entry.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
