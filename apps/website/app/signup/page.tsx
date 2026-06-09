"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Loader2, Building2, Mail, Lock, User, CheckCircle2, Copy, Check } from "lucide-react";
import Link from "next/link";

type Step = "form" | "success";

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("form");
    const [form, setForm] = useState({ companyName: "", displayName: "", email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [result, setResult] = useState<{ tenantId: string; emailVerified: boolean; verifyUrl?: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setFieldError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/portal/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyName: form.companyName.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    displayName: form.displayName.trim() || undefined,
                }),
            });

            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                field?: string;
                message?: string;
                tenantId?: string;
                emailVerified?: boolean;
                verifyUrl?: string;
            };

            if (!res.ok) {
                if (data.field) setFieldError(data.field);
                setError(data.message ?? "Registration failed. Please try again.");
                return;
            }

            setResult({
                tenantId: data.tenantId ?? "",
                emailVerified: data.emailVerified ?? false,
                verifyUrl: data.verifyUrl,
            });
            setStep("success");
        } catch {
            setError("Unable to connect. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    function copyTenantId() {
        if (!result?.tenantId) return;
        void navigator.clipboard.writeText(result.tenantId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    const fieldCls = (field: string) =>
        `w-full pl-9 pr-3 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066cc] disabled:opacity-60 transition ${
            fieldError === field
                ? "border-rose-400 focus:border-rose-500"
                : "border-slate-200 dark:border-slate-700 focus:border-[#0066cc]"
        }`;

    // ── Success screen ────────────────────────────────────────────────────────
    if (step === "success" && result) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="flex flex-col items-center mb-8 gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-400/25">
                            <CheckCircle2 className="h-7 w-7 text-white" />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Account created!</h1>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Your AgentFarms workspace is ready.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8 space-y-5">
                        {/* Tenant ID card */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                                Your Tenant ID
                            </p>
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-sm font-mono font-semibold text-[#0066cc] break-all">
                                    {result.tenantId}
                                </code>
                                <button
                                    onClick={copyTenantId}
                                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    title="Copy"
                                >
                                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                                Save this — you&apos;ll need it every time you log in.
                            </p>
                        </div>

                        {/* Verification status */}
                        {result.emailVerified ? (
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                                Email verified — you can sign in now.
                            </div>
                        ) : (
                            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 px-4 py-3 text-sm text-sky-700 dark:text-sky-400 space-y-2">
                                <p className="font-semibold">Check your email to verify your account.</p>
                                <p className="text-xs">
                                    We sent a verification link to <strong>{form.email}</strong>. Click it before signing in.
                                </p>
                                {result.verifyUrl && (
                                    <a
                                        href={result.verifyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block text-xs font-semibold underline"
                                    >
                                        Click here to verify (backup link)
                                    </a>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => router.push("/portal/login?next=/dashboard")}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0066cc] hover:bg-[#0071e3] text-white text-sm font-semibold shadow-sm transition-colors"
                        >
                            Go to login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Signup form ───────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-[#0066cc] flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Rocket className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Start your free trial</h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Create your AgentFarms workspace in seconds.
                        </p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8">
                    {error && (
                        <div className="mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        {/* Company name */}
                        <div>
                            <label htmlFor="sg-company" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Company name
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="sg-company"
                                    type="text"
                                    autoComplete="organization"
                                    placeholder="Acme Corp"
                                    required
                                    value={form.companyName}
                                    onChange={set("companyName")}
                                    disabled={loading}
                                    className={fieldCls("companyName")}
                                />
                            </div>
                        </div>

                        {/* Display name */}
                        <div>
                            <label htmlFor="sg-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Your name <span className="font-normal text-slate-400">(optional)</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="sg-name"
                                    type="text"
                                    autoComplete="name"
                                    placeholder="Jane Smith"
                                    value={form.displayName}
                                    onChange={set("displayName")}
                                    disabled={loading}
                                    className={fieldCls("displayName")}
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="sg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Work email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="sg-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@company.com"
                                    required
                                    value={form.email}
                                    onChange={set("email")}
                                    disabled={loading}
                                    className={fieldCls("email")}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="sg-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    id="sg-password"
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="Min. 8 characters"
                                    required
                                    minLength={8}
                                    value={form.password}
                                    onChange={set("password")}
                                    disabled={loading}
                                    className={fieldCls("password")}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={
                                loading ||
                                form.companyName.trim().length < 2 ||
                                !form.email.trim() ||
                                form.password.length < 8
                            }
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#0066cc] hover:bg-[#0071e3] disabled:bg-blue-300 text-white text-sm font-semibold shadow-sm transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Creating workspace…
                                </>
                            ) : (
                                "Create my workspace"
                            )}
                        </button>

                        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                            By signing up you agree to our{" "}
                            <Link href="/privacy" className="underline hover:text-slate-600">Privacy Policy</Link>
                            {" "}and{" "}
                            <Link href="/cookies" className="underline hover:text-slate-600">Terms of Service</Link>.
                        </p>
                    </form>
                </div>

                <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    Already have an account?{" "}
                    <Link href="/portal/login" className="text-[#0066cc] hover:underline">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
