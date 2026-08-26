import Link from "next/link";
import DocsSidebar from "@/components/layout/DocsSidebar";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: { default: "Documentation — AgentFarms", template: "%s — AgentFarms Docs" },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ background: "#ffffff", minHeight: "100vh" }}>

            {/* Docs top bar — sits below the marketing navbar (which is sticky at top-0) */}
            <div
                className="sticky z-40 flex items-center gap-3 px-6 h-11"
                style={{ top: 44, background: "var(--op-paper-2)", borderBottom: "1px solid var(--op-line)" }}
            >
                {/* Breadcrumb */}
                <Link href="/" className="text-[12px] text-[var(--op-muted)] hover:text-[var(--op-indigo)] transition-colors">
                    AgentFarms
                </Link>
                <span className="text-[var(--op-line)] text-[12px]">/</span>
                <span className="text-[12px] font-semibold text-[var(--op-ink)]">Docs</span>

                <div className="ml-auto flex items-center gap-4">
                    <Link href="/docs/quickstart" className="text-[12px] text-[var(--op-muted)] hover:text-[var(--op-ink)] transition-colors hidden sm:block">
                        Quickstart
                    </Link>
                    <Link href="/docs/api-reference" className="text-[12px] text-[var(--op-muted)] hover:text-[var(--op-ink)] transition-colors hidden sm:block">
                        API Reference
                    </Link>
                    <a
                        href="/get-started"
                        className="flex items-center gap-1 text-[12px] font-medium text-[#ffffff] px-3 py-1 rounded-full transition-colors"
                        style={{ background: "var(--op-indigo)" }}
                    >
                        Get API key <ArrowUpRight className="w-3 h-3" />
                    </a>
                </div>
            </div>

            {/* Body */}
            <div className="flex" style={{ maxWidth: 1320, margin: "0 auto" }}>
                {/* Left sidebar */}
                <DocsSidebar />

                {/* Main content */}
                <main
                    className="flex-1 min-w-0 py-10 px-10"
                    style={{ maxWidth: 760 }}
                >
                    {children}
                </main>
            </div>
        </div>
    );
}
