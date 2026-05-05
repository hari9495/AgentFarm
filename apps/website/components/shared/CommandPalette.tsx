"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Bot, ClipboardCheck, CreditCard, FileArchive, LayoutDashboard, Link2, Rocket, Search, Settings, Shield, ShieldCheck, Users, X, type LucideIcon, Bell, BarChart3, ClipboardList } from "lucide-react";

type NavEntry = { href: string; label: string; section: string; icon: LucideIcon };

const allNavEntries: NavEntry[] = [
    { href: "/dashboard", label: "Dashboard Overview", section: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/agents", label: "AI Workers", section: "Dashboard", icon: Bot },
    { href: "/dashboard/deployments", label: "Deployments", section: "Dashboard", icon: Rocket },
    { href: "/dashboard/approvals", label: "Approvals", section: "Dashboard", icon: ClipboardCheck },
    { href: "/dashboard/evidence", label: "Evidence & Compliance", section: "Dashboard", icon: FileArchive },
    { href: "/dashboard/activity", label: "Live Activity", section: "Dashboard", icon: Activity },
    { href: "/dashboard/reports", label: "Reports & Analytics", section: "Dashboard", icon: BarChart3 },
    { href: "/dashboard/notifications", label: "Notifications", section: "Dashboard", icon: Bell },
    { href: "/dashboard/settings", label: "Settings", section: "Dashboard", icon: Settings },
    { href: "/admin", label: "Admin Console", section: "Admin", icon: Shield },
    { href: "/admin/users", label: "Team & Access", section: "Admin", icon: Users },
    { href: "/admin/roles", label: "Roles & Permissions", section: "Admin", icon: ShieldCheck },
    { href: "/admin/security", label: "Security", section: "Admin", icon: Shield },
    { href: "/admin/integrations", label: "Integrations", section: "Admin", icon: Link2 },
    { href: "/admin/billing", label: "Billing", section: "Admin", icon: CreditCard },
    { href: "/admin/audit", label: "Audit Log", section: "Admin", icon: ClipboardList },
];

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setOpen((o) => !o);
            }
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        if (open) {
            setQuery("");
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [open]);

    const filtered = query.trim()
        ? allNavEntries.filter(
            (e) =>
                e.label.toLowerCase().includes(query.toLowerCase()) ||
                e.section.toLowerCase().includes(query.toLowerCase()),
        )
        : allNavEntries;

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
            onClick={() => setOpen(false)}
        >
            {/* backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

            <div
                className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search pages…"
                        className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
                    />
                    <button onClick={() => setOpen(false)} className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                        <X className="w-4 h-4" />
                    </button>
                    <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div className="max-h-[360px] overflow-y-auto py-2">
                    {filtered.length === 0 ? (
                        <p className="px-5 py-6 text-sm text-center text-slate-400">No pages found</p>
                    ) : (
                        (() => {
                            const sections = [...new Set(filtered.map((e) => e.section))];
                            return sections.map((section) => (
                                <div key={section}>
                                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                        {section}
                                    </p>
                                    {filtered
                                        .filter((e) => e.section === section)
                                        .map((entry) => (
                                            <Link
                                                key={entry.href}
                                                href={entry.href}
                                                onClick={() => setOpen(false)}
                                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                                            >
                                                <entry.icon className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                                                {entry.label}
                                            </Link>
                                        ))}
                                </div>
                            ));
                        })()
                    )}
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-4 text-[10px] text-slate-400">
                    <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                    <span><kbd className="font-mono">↵</kbd> open</span>
                    <span><kbd className="font-mono">Ctrl K</kbd> toggle</span>
                </div>
            </div>
        </div>
    );
}
