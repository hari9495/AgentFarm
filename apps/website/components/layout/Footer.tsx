import Link from "next/link";
import { Bot, Github, Twitter, Linkedin } from "lucide-react";

const footerCols = [
    {
        heading: "Product",
        links: [
            { href: "/product", label: "Features" },
            { href: "/marketplace", label: "Skill Marketplace" },
            { href: "/how-it-works", label: "How It Works" },
            { href: "/pricing", label: "Pricing" },
            { href: "/compare", label: "Compare" },
            { href: "/product#connectors", label: "Connectors" },
        ],
    },
    {
        heading: "Company",
        links: [
            { href: "/about", label: "About" },
            { href: "#", label: "Careers" },
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
            { href: "/security", label: "Security" },
            { href: "/cookies", label: "Cookie Policy" },
        ],
    },
];

const socials = [
    { icon: Github, href: "https://github.com/agentfarm", label: "GitHub" },
    { icon: Twitter, href: "https://twitter.com/agentfarm", label: "X / Twitter" },
    { icon: Linkedin, href: "https://linkedin.com/company/agentfarm", label: "LinkedIn" },
];

export default function Footer() {
    return (
        <footer className="relative bg-[var(--canvas)] border-t border-[var(--hairline)]">
            {/* Top gradient line */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-red)]/40 to-transparent" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12">
                    {/* Brand — 2 cols */}
                    <div className="col-span-2">
                        <Link href="/" className="group flex items-center gap-2.5 font-semibold text-[var(--ink)] text-[15px]">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff5757] to-[#a1131a] shadow-md shadow-red-900/40 transition-transform duration-300 group-hover:scale-105">
                                <Bot className="w-4 h-4 text-white" />
                            </span>
                            AgentFarm
                        </Link>
                        <p className="mt-3 text-sm text-[var(--mute)] leading-relaxed max-w-xs">
                            Developer Agent platform for engineering teams — 21 skills, approval gates, full audit trail on Azure.
                        </p>
                        {/* Social links */}
                        <div className="mt-5 flex items-center gap-2">
                            {socials.map((s) => (
                                <a
                                    key={s.label}
                                    href={s.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={s.label}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--hairline)] text-[var(--ash)] hover:text-[var(--ink)] hover:border-[rgba(255,255,255,0.15)] hover:bg-white/[0.04] transition-colors"
                                >
                                    <s.icon className="w-3.5 h-3.5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Link columns — 1 col each */}
                    {footerCols.map((col) => (
                        <div key={col.heading}>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--mute)] mb-3.5">
                                {col.heading}
                            </p>
                            <ul className="space-y-2.5">
                                {col.links.map((l) => (
                                    <li key={l.label}>
                                        <Link
                                            href={l.href}
                                            className="text-sm text-[var(--ash)] hover:text-[var(--ink)] transition-colors"
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
                <div className="mt-12 pt-6 border-t border-[var(--hairline)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--ash)]">
                    <p>© {new Date().getFullYear()} AgentFarm. All rights reserved.</p>
                    <p className="flex items-center gap-1.5">
                        Built with Next.js &amp; deployed on Azure
                    </p>
                </div>
            </div>
        </footer>
    );
}

