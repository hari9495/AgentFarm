"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";

type Props = {
    roleKey: string; // e.g. "developer"
    source?: string; // tracking label
    className?: string;
    label?: string;
};

/**
 * "Hire this agent" CTA — routes to the setup wizard with role pre-selected.
 * Replaces the legacy MarketplaceDeployButton for the hire flow.
 */
export default function HireAgentButton({ roleKey, source = "marketplace", className, label }: Props) {
    const params = new URLSearchParams({ source });
    const href = `/hire/${encodeURIComponent(roleKey)}?${params.toString()}`;

    return (
        <Link
            href={href}
            className={
                className ??
                "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--canvas)] hover:opacity-90 transition-opacity"
            }
        >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            {label ?? "Hire this agent"}
        </Link>
    );
}
