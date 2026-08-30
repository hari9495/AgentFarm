"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export default function ApplyPolicyPresetButton({ preset, label }: { preset: "startup" | "enterprise"; label?: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [applied, setApplied] = useState(false);

    const apply = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/bots/policy-preset", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preset }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Could not apply preset.");
            }
            setApplied(true);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not apply preset.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={apply}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] rounded-[3px] px-3 py-1.5 hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/20 disabled:opacity-60 transition-colors"
            >
                {loading && <LoaderCircle className="w-3 h-3 animate-spin" />}
                {applied ? "Applied ✓" : (label ?? "Apply preset")}
            </button>
            {error && <span className="text-[10px] text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</span>}
        </div>
    );
}
