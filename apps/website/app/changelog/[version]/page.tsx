import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Tag } from "lucide-react";
import { changelogEntriesContent, changelogListingContent } from "@/lib/marketing-content";

type VersionedEntry = (typeof changelogEntriesContent)[number] & {
    version: string;
    versionSlug: string;
    summary: string;
    highlights: readonly string[];
};

const versionedEntries = changelogEntriesContent.filter(
    (entry): entry is VersionedEntry => "versionSlug" in entry,
);

export function generateStaticParams() {
    return versionedEntries.map((entry) => ({ version: entry.versionSlug }));
}

export async function generateMetadata({ params }: { params: Promise<{ version: string }> }): Promise<Metadata> {
    const { version } = await params;
    const entry = versionedEntries.find((item) => item.versionSlug === version);

    if (!entry) {
        return changelogListingContent.metadata;
    }

    return {
        title: `${entry.version} - ${entry.title} - AgentFarms`,
        description: entry.summary,
    };
}

export default async function ChangelogVersionPage({ params }: { params: Promise<{ version: string }> }) {
    const { version } = await params;
    const entry = versionedEntries.find((item) => item.versionSlug === version);

    if (!entry) {
        notFound();
    }

    return (
        <article className="site-shell min-h-screen">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <Link
                    href="/changelog"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to changelog
                </Link>

                <div className="mt-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-8">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold">
                            <Tag className="w-3.5 h-3.5" /> {entry.version}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5" /> {entry.date}
                        </span>
                    </div>

                    <h1 className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{entry.title}</h1>
                    <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">{entry.summary}</p>

                    <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Highlights</h2>
                    <ul className="mt-3 space-y-2">
                        {entry.highlights.map((highlight) => (
                            <li
                                key={highlight}
                                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300"
                            >
                                {highlight}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </article>
    );
}
