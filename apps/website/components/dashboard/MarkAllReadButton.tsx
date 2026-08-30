"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export default function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const onClick = async () => {
        setLoading(true);
        try {
            await fetch("/api/notifications/mark-read", {
                method: "POST",
                credentials: "include",
            });
            router.refresh();
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || loading}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--accent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/30 hover:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/60 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-[3px] px-4 py-2 transition-colors shrink-0"
        >
            {loading && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
            Mark all read
        </button>
    );
}
