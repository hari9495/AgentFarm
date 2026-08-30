"use client";

import Link from "next/link";
import { useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type Props = {
    agentSlug: string;
    agentName: string;
};

export default function RiskyActionTrigger({ agentSlug, agentName }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdId, setCreatedId] = useState<string | null>(null);

    const submitHighRiskAction = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/approvals", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: `Deploy production change for ${agentName}`,
                    agentSlug,
                    agent: agentName,
                    requestedBy: "dashboard-control-plane",
                    channel: "Dashboard / Agent Detail",
                    reason: "High-risk production operation requires explicit human approval.",
                    risk: "high",
                }),
            });

            const body = (await response.json().catch(() => null)) as { error?: string; approval?: { id: string } } | null;
            if (!response.ok) {
                throw new Error(body?.error ?? "Unable to create approval request.");
            }

            setCreatedId(body?.approval?.id ?? null);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to create approval request.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-[color-mix(in_srgb,var(--danger)_8%,transparent)] to-[color-mix(in_srgb,var(--warn)_8%,transparent)] dark:from-[color-mix(in_srgb,var(--danger)_14%,transparent)]/20 dark:to-[color-mix(in_srgb,var(--warn)_14%,transparent)]/20 rounded-[4px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 p-5">
            <div className="flex items-center gap-2 mb-2">
                <PremiumIcon icon={ShieldAlert} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="w-3.5 h-3.5" />
                <span className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Approval Simulation</span>
            </div>
            <p className="text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] leading-relaxed">
                Trigger a high-risk operation request for this agent to validate routing through pending approvals and decision handling.
            </p>
            <button
                onClick={() => void submitHighRiskAction()}
                disabled={loading}
                className="mt-3 inline-flex items-center gap-2 rounded-[3px] bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--danger)] disabled:opacity-60"
            >
                {loading ? <PremiumIcon icon={LoaderCircle} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--card)] text-white border-[color:var(--line)]" iconClassName="w-3.5 h-3.5 animate-spin" /> : <PremiumIcon icon={ShieldAlert} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--card)] text-white border-[color:var(--line)]" iconClassName="w-3.5 h-3.5" />}
                {loading ? "Submitting..." : "Request High-Risk Approval"}
            </button>

            {createdId ? (
                <p className="mt-3 text-xs text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                    Request {createdId} created. <Link href={`/dashboard/agents/${agentSlug}/approvals`} className="font-semibold underline">Open approvals</Link> or <Link href="/dashboard/activity" className="font-semibold underline">view activity</Link>.
                </p>
            ) : null}

            {error ? <p className="mt-3 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</p> : null}
        </div>
    );
}
