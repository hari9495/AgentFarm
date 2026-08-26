import Link from "next/link";
import { Twitter, Linkedin } from "lucide-react";

const footerCols = [
    {
        heading: "Product",
        links: [
            { href: "/product", label: "Features" },
            { href: "/marketplace", label: "Role Marketplace" },
            { href: "/how-it-works", label: "How It Works" },
            { href: "/pricing", label: "Pricing" },
            { href: "/compare", label: "Compare" },
            { href: "/integrations", label: "Integrations" },
        ],
    },
    {
        heading: "Company",
        links: [
            { href: "/about", label: "About" },
            { href: "/careers", label: "Careers" },
            { href: "/blog", label: "Blog" },
            { href: "/changelog", label: "Changelog" },
            { href: "/contact", label: "Contact" },
        ],
    },
    {
        heading: "Resources",
        links: [
            { href: "/docs", label: "Documentation" },
            { href: "/use-cases", label: "Use Cases" },
            { href: "/docs/api-reference", label: "API Reference" },
            { href: "/security", label: "Security" },
            { href: "/status", label: "Status" },
        ],
    },
    {
        heading: "Legal",
        links: [
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/cookies", label: "Cookie Policy" },
        ],
    },
];

const socials = [
    { icon: Twitter, href: "https://twitter.com/agentfarms", label: "X / Twitter" },
    { icon: Linkedin, href: "https://linkedin.com/company/agentfarms", label: "LinkedIn" },
];

export default function Footer() {
    return (
        <footer style={{ background: "var(--op-paper-2)", borderTop: "1px solid var(--op-line)" }}>
            <div className="max-w-[1100px] mx-auto px-6 py-16">
                {/* Main grid */}
                <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-8">
                    {/* Brand */}
                    <div className="col-span-2 md:col-span-1">
                        <Link href="/" className="inline-flex items-center gap-2 group">
                            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md" style={{ background: "var(--op-indigo)" }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                                    <circle cx="6" cy="6" r="5" stroke="white" strokeWidth="1.5" />
                                    <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                            </span>
                            <span className="font-semibold text-[13px] tracking-[-0.01em]" style={{ color: "var(--op-ink)" }}>AgentFarms</span>
                        </Link>
                        <p className="mt-3 text-[14px] leading-relaxed max-w-xs" style={{ color: "var(--op-muted)" }}>
                            AI staffing platform — 13 specialist roles, approval gates, and a full audit trail.
                        </p>
                        <div className="mt-5 flex items-center gap-2">
                            {socials.map((s) => (
                                <a
                                    key={s.label}
                                    href={s.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={s.label}
                                    className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-black/[0.04]"
                                    style={{ border: "1px solid var(--op-line)", color: "var(--op-muted)" }}
                                >
                                    <s.icon className="w-3.5 h-3.5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Link columns */}
                    {footerCols.map((col) => (
                        <div key={col.heading}>
                            <p
                                className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-3"
                                style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}
                            >
                                {col.heading}
                            </p>
                            <ul className="space-y-0">
                                {col.links.map((l) => (
                                    <li key={l.label}>
                                        <Link
                                            href={l.href}
                                            className="block py-1 text-[14px] leading-[2.2] transition-colors text-[color:var(--op-ink-soft)] hover:text-[color:var(--op-indigo)]"
                                        >
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom bar */}
                <div className="mt-12 pt-6" style={{ borderTop: "1px solid var(--op-line)" }}>
                    <p className="text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                        © {new Date().getFullYear()} AgentFarms — every action logged, every risk gated.
                    </p>
                </div>
            </div>
        </footer>
    );
}
