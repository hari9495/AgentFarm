"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Loader2, Building2, Mail, Lock, User } from "lucide-react";
import Link from "next/link";

export default function PortalSignupPage() {
    const router = useRouter();
    const [form, setForm] = useState({ tenantId: "", email: "", password: "", displayName: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setFieldError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/portal/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantId: form.tenantId.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    displayName: form.displayName.trim() || undefined,
                }),
            });

            if (res.ok) {
                router.push("/portal/login?registered=1");
                return;
            }

            const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; field?: string };
            if (body.field) {
                setFieldError(body.field);
                setError(body.message ?? "Please check the highlighted field.");
            } else if (body.error === "email_already_registered") {
                setFieldError("email");
                setError("This email is already registered for this tenant.");
            } else if (body.error === "tenant_not_found") {
                setFieldError("tenantId");
                setError("Tenant not found or inactive. Contact your administrator.");
            } else {
                setError(body.message ?? "Registration failed. Please try again.");
            }
        } catch {
            setError("Unable to connect. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    const fieldClass = (field: string) =>
        `w-full pl-9 pr-3 py-2.5 rounded-[3px] border bg-[var(--bg-deep)] dark:bg-[var(--card)] text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] disabled:opacity-60 transition ${
            fieldError === field
                ? "border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] focus:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]"
                : "border-[color:var(--line)] dark:border-[color:var(--line)] focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
        }`;

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-[4px] bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <LayoutDashboard className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Create your portal account</h1>
                        <p className="mt-1 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Access your AgentFarms workspace and support
                        </p>
                    </div>
                </div>

                <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] shadow-xl shadow-slate-900/5 border border-[color:var(--line)] dark:border-[color:var(--line)] p-8">
                    {error && (
                        <div className="mb-5 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-4 py-3 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <div>
                            <label htmlFor="su-tenant-id" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                                Tenant ID
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                                <input
                                    id="su-tenant-id"
                                    type="text"
                                    autoComplete="organization"
                                    placeholder="your-organisation-id"
                                    required
                                    value={form.tenantId}
                                    onChange={set("tenantId")}
                                    disabled={loading}
                                    className={fieldClass("tenantId")}
                                />
                            </div>
                            <p className="mt-1.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Provided by your AgentFarm administrator</p>
                        </div>

                        <div>
                            <label htmlFor="su-email" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                                <input
                                    id="su-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@company.com"
                                    required
                                    value={form.email}
                                    onChange={set("email")}
                                    disabled={loading}
                                    className={fieldClass("email")}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="su-password" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                                <input
                                    id="su-password"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Min. 8 characters"
                                    required
                                    minLength={8}
                                    value={form.password}
                                    onChange={set("password")}
                                    disabled={loading}
                                    className={fieldClass("password")}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="su-display-name" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                                Display name <span className="font-normal text-[color:var(--ink-muted)]">(optional)</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                                <input
                                    id="su-display-name"
                                    type="text"
                                    autoComplete="name"
                                    placeholder="Your name"
                                    value={form.displayName}
                                    onChange={set("displayName")}
                                    disabled={loading}
                                    className={fieldClass("displayName")}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !form.tenantId.trim() || !form.email.trim() || form.password.length < 8}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:bg-[var(--accent)] text-white text-sm font-semibold shadow-sm transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Creating account…
                                </>
                            ) : (
                                "Create account"
                            )}
                        </button>
                    </form>
                </div>

                <p className="mt-6 text-center text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                    Already have an account?{" "}
                    <Link href="/portal/login" className="text-[color:var(--accent)] hover:underline">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
