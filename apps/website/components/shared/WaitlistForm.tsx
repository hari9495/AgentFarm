"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { submitToWaitlist } from "@/lib/waitlist";
import Button from "@/components/shared/Button";
import { cn } from "@/lib/cn";

export default function WaitlistForm({
    className,
    compact = false,
    botName,
}: {
    className?: string;
    compact?: boolean;
    botName?: string;
}) {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setErrorMsg("Please enter a valid email address.");
            setStatus("error");
            return;
        }
        setStatus("loading");
        setErrorMsg("");
        const result = await submitToWaitlist(email);
        if (result.success) {
            setStatus("success");
            setEmail("");
            toast.success(
                botName
                    ? `You're on the early access list for ${botName}!`
                    : "You're on the waitlist! We'll be in touch soon."
            );
        } else {
            setStatus("error");
            setErrorMsg(result.error ?? "Something went wrong. Please try again.");
            toast.error(result.error ?? "Something went wrong. Please try again.");
        }
    };

    if (compact) {
        return (
            <div className={className}>
                {status === "success" ? (
                    <p className="text-xs text-green-600 text-center font-medium py-1">
                        You're on the early access list!
                    </p>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
                            placeholder="your@email.com"
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                            required
                            suppressHydrationWarning
                        />
                        <button
                            type="submit"
                            disabled={status === "loading"}
                            className="w-full py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-700 dark:hover:bg-white transition-colors disabled:opacity-60"
                        >
                            {status === "loading" ? "Joining..." : "Notify me at launch"}
                        </button>
                        {status === "error" && errorMsg && (
                            <p className="text-red-600 text-xs">{errorMsg}</p>
                        )}
                    </form>
                )}
            </div>
        );
    }

    return (
        <div className={className}>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (status === "error") setStatus("idle");
                    }}
                    placeholder="Enter your work email"
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    required
                    aria-label="Work email"
                    suppressHydrationWarning
                />
                <Button type="submit" disabled={status === "loading"} size="md">
                    {status === "loading" ? "Joining..." : "Join Waitlist"}
                </Button>
            </form>
            {status === "error" && errorMsg && (
                <p className="mt-2 text-red-600 text-sm">{errorMsg}</p>
            )}
        </div>
    );
}

