"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Loader2, Lock, Mail, Building2 } from "lucide-react";
import Link from "next/link";

export default function PortalLoginPage() {
    const router = useRouter();

    const [tenantId, setTenantId] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inactive, setInactive] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setInactive(false);

        if (!tenantId.trim()) {
            setError("Tenant ID is required.");
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            setError("Enter a valid email address.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/portal/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: tenantId.trim(), email, password }),
            });

            if (res.status === 403) {
                setInactive(true);
                return;
            }
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { message?: string };
                setError(data.message ?? "Email or password is incorrect.");
                return;
            }

            router.push("/portal");
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Logo + heading */}
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                        <LayoutDashboard className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                            Tenant Portal Login
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Sign in to manage your AgentFarm account
                        </p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8">
                    {inactive && (
                        <div className="mb-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                            This account has been deactivated. Contact your administrator.
                        </div>
                    )}

                    {error && !inactive && (
                        <div className="mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        {/* Tenant ID */}
                        <div>
                            <label
                                htmlFor="portal-tenant-id"
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                                Tenant ID
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="portal-tenant-id"
                                    type="text"
                                    autoComplete="organization"
                                    placeholder="your-tenant-id"
                                    value={tenantId}
                                    onChange={(e) => setTenantId(e.target.value)}
                                    disabled={loading}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60 transition"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label
                                htmlFor="portal-email"
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="portal-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60 transition"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label
                                htmlFor="portal-password"
                                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="portal-password"
                                    type="password"
                                    autoComplete="current-password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-60 transition"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-semibold shadow-sm transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Signing in…
                                </>
                            ) : (
                                "Sign in"
                            )}
                        </button>
                    </form>
                </div>

                <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    Not a customer yet?{" "}
                    <Link href="/pricing" className="text-sky-600 hover:underline">
                        View pricing
                    </Link>
                </p>
            </div>
        </div>
    );
}
