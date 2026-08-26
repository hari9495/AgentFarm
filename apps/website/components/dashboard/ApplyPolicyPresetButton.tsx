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
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-60 transition-colors"
            >
                {loading && <LoaderCircle className="w-3 h-3 animate-spin" />}
                {applied ? "Applied ✓" : (label ?? "Apply preset")}
            </button>
            {error && <span className="text-[10px] text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
    );
}
