"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

type NavItem = { href: string; label: string; badge?: string };
type NavSection = { heading: string; items: NavItem[]; defaultOpen?: boolean };

const NAV: NavSection[] = [
    {
        heading: "Getting Started",
        defaultOpen: true,
        items: [
            { href: "/docs", label: "Overview" },
            { href: "/docs/quickstart", label: "Quickstart" },
        ],
    },
    {
        heading: "Core Concepts",
        defaultOpen: true,
        items: [
            { href: "/docs/concepts", label: "How Workers Operate" },
            { href: "/docs/approvals", label: "Approval Gates" },
            { href: "/docs/evidence", label: "Evidence Trail" },
        ],
    },
    {
        heading: "Workers",
        defaultOpen: true,
        items: [
            { href: "/docs/workers", label: "Worker Roles", badge: "12" },
        ],
    },
    {
        heading: "Integrations",
        defaultOpen: true,
        items: [
            { href: "/docs/connectors", label: "Connectors", badge: "18" },
        ],
    },
    {
        heading: "API Reference",
        defaultOpen: true,
        items: [
            { href: "/docs/api-reference", label: "REST API" },
            { href: "/docs/webhooks", label: "Webhooks" },
            { href: "/docs/sdk", label: "TypeScript SDK" },
        ],
    },
    {
        heading: "Configuration",
        defaultOpen: false,
        items: [
            { href: "/docs/environment", label: "Environment Variables" },
        ],
    },
];

const EXTERNAL = [
    { href: "/changelog", label: "Changelog" },
    { href: "/status", label: "System Status" },
    { href: "/contact", label: "Support" },
];

function SidebarSection({ section, pathname }: { section: NavSection; pathname: string }) {
    const hasActive = section.items.some((i) => pathname === i.href);
    const [open, setOpen] = useState(section.defaultOpen ?? hasActive);

    return (
        <div>
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded cursor-pointer"
            >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--op-muted)" }}>
                    {section.heading}
                </span>
                <ChevronDown
                    className="w-3.5 h-3.5 transition-transform"
                    style={{ color: "var(--op-muted)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                />
            </button>

            {open && (
                <ul className="mt-0.5 space-y-0.5">
                    {section.items.map(({ href, label, badge }) => {
                        const active = pathname === href;
                        return (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="flex items-center justify-between px-3 py-1.5 rounded-[8px] text-[13px] transition-colors"
                                    style={{
                                        background: active ? "rgba(37,99,235,0.08)" : "transparent",
                                        color: active ? "var(--op-indigo)" : "var(--op-ink-soft)",
                                        fontWeight: active ? 600 : 400,
                                    }}
                                >
                                    {label}
                                    {badge && (
                                        <span
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                            style={{ background: "rgba(37,99,235,0.1)", color: "var(--op-indigo)" }}
                                        >
                                            {badge}
                                        </span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export default function DocsSidebar() {
    const pathname = usePathname();
    const isDocsPage = pathname.startsWith("/docs");

    if (!isDocsPage) return null;

    return (
        <aside
            className="hidden lg:block shrink-0 border-r"
            style={{ width: 240, minWidth: 240, borderColor: "var(--op-line)", background: "var(--op-paper-2)" }}
        >
            <nav
                className="sticky flex flex-col gap-1 py-6 px-3 overflow-y-auto"
                style={{ top: 88, maxHeight: "calc(100vh - 88px)" }}
            >
                {/* Logo in sidebar */}
                <div className="px-3 mb-4 flex items-center gap-2">
                    <div
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ background: "var(--op-indigo)" }}
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1.5" />
                            <path d="M3 5h4M5 3v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-[13px] font-semibold text-[var(--op-ink)]">AgentFarms</span>
                    <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(37,99,235,0.1)", color: "var(--op-indigo)" }}
                    >
                        Docs
                    </span>
                </div>

                {/* Nav sections */}
                <div className="space-y-3">
                    {NAV.map((section) => (
                        <SidebarSection key={section.heading} section={section} pathname={pathname} />
                    ))}
                </div>

                {/* External links */}
                <div className="mt-4 pt-4 border-t border-[var(--op-line)]">
                    <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--op-muted)] mb-1.5">
                        Resources
                    </p>
                    {EXTERNAL.map((l) => (
                        <a
                            key={l.label}
                            href={l.href}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] text-[var(--op-muted)] hover:text-[var(--op-ink)] hover:bg-[rgba(0,0,0,0.03)] transition-colors"
                        >
                            {l.label}
                            <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                    ))}
                </div>
            </nav>
        </aside>
    );
}
