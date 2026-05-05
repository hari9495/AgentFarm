import Link from "next/link";
import { Bot } from "lucide-react";

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
            { href: "/product#security", label: "Security" },
            { href: "#", label: "Status" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
        ],
    },
];

export default function Footer() {
    return (
        <footer className="relative border-t border-white/65 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
                    {/* Brand */}
                    <div className="col-span-2 md:col-span-1">
                        <Link href="/" className="group flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-lg">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 shadow-md shadow-sky-500/35 transition-transform duration-300 group-hover:-rotate-6">
                                <Bot className="w-4 h-4 text-white" />
                            </span>
                            AgentFarm
                        </Link>
                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                            Developer Agent platform for engineering teams — 21 skills, approval gates, full audit trail.
                        </p>
                    </div>

                    {/* Columns */}
                    {footerCols.map((col) => (
                        <div key={col.heading}>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-900 dark:text-slate-100 mb-3">
                                {col.heading}
                            </p>
                            <ul className="space-y-2">
                                {col.links.map((l) => (
                                    <li key={l.label}>
                                        <Link
                                            href={l.href}
                                            className="text-sm text-slate-500 dark:text-slate-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                                        >
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-12 pt-8 border-t border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <p>© {new Date().getFullYear()} AgentFarm. All rights reserved.</p>
                    <p>Built with Next.js for modern engineering teams.</p>
                </div>
            </div>
        </footer>
    );
}

