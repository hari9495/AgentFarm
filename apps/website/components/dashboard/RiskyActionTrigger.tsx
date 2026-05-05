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
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 dark:from-rose-950/20 dark:to-amber-950/20 rounded-2xl border border-rose-200 dark:border-rose-900/40 p-5">
            <div className="flex items-center gap-2 mb-2">
                <PremiumIcon icon={ShieldAlert} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3.5 h-3.5" />
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Approval Simulation</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Trigger a high-risk operation request for this agent to validate routing through pending approvals and decision handling.
            </p>
            <button
                onClick={() => void submitHighRiskAction()}
                disabled={loading}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
                {loading ? <PremiumIcon icon={LoaderCircle} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5 animate-spin" /> : <PremiumIcon icon={ShieldAlert} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />}
                {loading ? "Submitting..." : "Request High-Risk Approval"}
            </button>

            {createdId ? (
                <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
                    Request {createdId} created. <Link href={`/dashboard/agents/${agentSlug}/approvals`} className="font-semibold underline">Open approvals</Link> or <Link href="/dashboard/activity" className="font-semibold underline">view activity</Link>.
                </p>
            ) : null}

            {error ? <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
        </div>
    );
}
