"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Github, Rocket, Users } from "lucide-react";

type StepId = "github" | "team" | "deploy";

const steps: { id: StepId; title: string; subtitle: string; icon: React.ElementType }[] = [
    { id: "github", title: "Connect GitHub", subtitle: "Authorize org and repositories", icon: Github },
    { id: "team", title: "Invite Team", subtitle: "Add collaborators and roles", icon: Users },
    { id: "deploy", title: "Deploy First Agent", subtitle: "Choose role and start", icon: Rocket },
];

type ProvisioningStatusPayload = {
    tenant: { tenantStatus: string } | null;
    workspace: { workspaceStatus: string } | null;
    bot: { botStatus: string } | null;
    provisioningJob: {
        status: string;
        failureReason?: string | null;
        remediationHint?: string | null;
        updatedAt?: number;
    } | null;
};

const isTerminalProvisioningStatus = (status: string | null | undefined): boolean => {
    if (!status) return false;
    return status === "completed" || status === "failed" || status === "cleaned_up";
};

const formatProvisioningStatus = (value: string | null | undefined): string => {
    if (!value) return "unknown";
    return value.replaceAll("_", " ");
};

export default function OnboardingPage() {
    const [step, setStep] = useState(0);
    const [org, setOrg] = useState("");
    const [email, setEmail] = useState("");
    const [agent, setAgent] = useState("ai-backend-developer");
    const [errors, setErrors] = useState<{ org?: string; email?: string }>({});
    const [submitError, setSubmitError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [provisioningLoading, setProvisioningLoading] = useState(false);
    const [provisioningError, setProvisioningError] = useState("");
    const [provisioningStatus, setProvisioningStatus] = useState<ProvisioningStatusPayload | null>(null);

    const active = steps[step];
    const provisioningJobStatus = provisioningStatus?.provisioningJob?.status ?? null;
    const provisioningCompleted = provisioningJobStatus === "completed";
    const provisioningFailed = provisioningJobStatus === "failed";

    const progress = useMemo(() => ((step + 1) / steps.length) * 100, [step]);

    useEffect(() => {
        if (!done) return;

        let disposed = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const pullProvisioningStatus = async () => {
            setProvisioningLoading(true);
            try {
                const response = await fetch("/api/provisioning/status", {
                    method: "GET",
                    cache: "no-store",
                });
                const data = (await response.json()) as ProvisioningStatusPayload & { error?: string };

                if (!response.ok) {
                    if (!disposed) {
                        setProvisioningError(data.error ?? "Unable to load provisioning status.");
                    }
                    return;
                }

                if (disposed) return;
                setProvisioningError("");
                setProvisioningStatus(data);

                if (isTerminalProvisioningStatus(data.provisioningJob?.status)) {
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }
                }
            } catch {
                if (!disposed) {
                    setProvisioningError("Network error while loading provisioning status.");
                }
            } finally {
                if (!disposed) {
                    setProvisioningLoading(false);
                }
            }
        };

        pullProvisioningStatus();
        intervalId = setInterval(pullProvisioningStatus, 3000);

        return () => {
            disposed = true;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [done]);

    async function next() {
        const nextErrors: { org?: string; email?: string } = {};
        if (active.id === "github" && org.trim().length < 2) {
            nextErrors.org = "Organization name is required.";
        }
        if (active.id === "team" && !/^\S+@\S+\.\S+$/.test(email)) {
            nextErrors.email = "Enter a valid email address.";
        }
        setErrors(nextErrors);
        setSubmitError("");
        if (Object.keys(nextErrors).length > 0) return;

        if (step < steps.length - 1) {
            setStep((s) => s + 1);
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    githubOrg: org,
                    inviteEmail: email,
                    starterAgent: agent,
                }),
            });
            const data = (await response.json()) as { error?: string };

            if (!response.ok) {
                setSubmitError(data.error ?? "Unable to complete onboarding.");
                return;
            }

            setDone(true);
        } catch {
            setSubmitError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-sky-950/20 py-14">
            <div className="mx-auto max-w-4xl px-4 sm:px-6">
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <div className="border-b border-slate-200 dark:border-slate-800 p-6">
                        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Get Started in Minutes</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Connect GitHub, invite your team, and deploy your first AI worker.</p>
                        <div className="mt-5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className="h-2 bg-gradient-to-r from-sky-500 via-blue-600 to-emerald-500" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="mt-4 grid sm:grid-cols-3 gap-3">
                            {steps.map((s, i) => {
                                const Icon = s.icon;
                                const state = i < step ? "done" : i === step ? "active" : "idle";
                                return (
                                    <div key={s.id} className={`rounded-xl border px-3 py-2 ${state === "active" ? "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                            {state === "done" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Icon className="w-3.5 h-3.5" />} {s.title}
                                        </p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.subtitle}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-6 sm:p-8">
                        {!done && active.id === "github" && (
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">GitHub Organization</label>
                                <input
                                    value={org}
                                    onChange={(e) => setOrg(e.target.value)}
                                    placeholder="acme-org"
                                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-sky-500 outline-none"
                                />
                                {errors.org && <p className="text-xs text-rose-600 dark:text-rose-400">{errors.org}</p>}
                            </div>
                        )}

                        {!done && active.id === "team" && (
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">First teammate invite</label>
                                <input
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="teammate@company.com"
                                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-sky-500 outline-none"
                                />
                                {errors.email && <p className="text-xs text-rose-600 dark:text-rose-400">{errors.email}</p>}
                            </div>
                        )}

                        {!done && active.id === "deploy" && (
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Starter agent role</label>
                                <select
                                    value={agent}
                                    onChange={(e) => setAgent(e.target.value)}
                                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-sky-500 outline-none"
                                >
                                    <option value="ai-backend-developer">AI Backend Developer</option>
                                    <option value="ai-qa-engineer">AI QA Engineer</option>
                                    <option value="ai-devops-engineer">AI DevOps Engineer</option>
                                    <option value="ai-security-engineer">AI Security Engineer</option>
                                </select>
                            </div>
                        )}

                        {done && (
                            <div
                                className={`rounded-2xl p-6 text-center ${provisioningFailed
                                    ? "border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-950/20"
                                    : "border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20"
                                    }`}
                            >
                                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                                <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Onboarding complete</h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Your workspace setup is now tracked live while provisioning finishes.</p>

                                <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-700/40 bg-white/80 dark:bg-slate-900/60 p-4 text-left">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Provisioning status</p>
                                    {provisioningLoading && !provisioningStatus && (
                                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Loading status...</p>
                                    )}
                                    {!provisioningLoading && !provisioningStatus && !provisioningError && (
                                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Waiting for provisioning status...</p>
                                    )}
                                    {provisioningStatus && (
                                        <div className="mt-2 grid gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                                            <p>
                                                Tenant: <span className="font-semibold">{formatProvisioningStatus(provisioningStatus.tenant?.tenantStatus)}</span>
                                            </p>
                                            <p>
                                                Workspace: <span className="font-semibold">{formatProvisioningStatus(provisioningStatus.workspace?.workspaceStatus)}</span>
                                            </p>
                                            <p>
                                                Bot: <span className="font-semibold">{formatProvisioningStatus(provisioningStatus.bot?.botStatus)}</span>
                                            </p>
                                            <p>
                                                Job: <span className="font-semibold">{formatProvisioningStatus(provisioningStatus.provisioningJob?.status)}</span>
                                            </p>
                                            {provisioningStatus.provisioningJob?.updatedAt ? (
                                                <p>
                                                    Last transition: <span className="font-semibold">{new Date(provisioningStatus.provisioningJob.updatedAt).toLocaleString()}</span>
                                                </p>
                                            ) : null}
                                        </div>
                                    )}
                                    {provisioningError && (
                                        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{provisioningError}</p>
                                    )}
                                </div>

                                {provisioningFailed && (
                                    <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-700/40 bg-white/80 dark:bg-slate-900/60 p-4 text-left">
                                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Provisioning needs attention</p>
                                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                            Retry from your dashboard provisioning controls, or contact support if this persists.
                                        </p>
                                        {provisioningStatus?.provisioningJob?.failureReason ? (
                                            <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                                                Failure reason: {provisioningStatus.provisioningJob.failureReason}
                                            </p>
                                        ) : null}
                                        {provisioningStatus?.provisioningJob?.remediationHint ? (
                                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                                Remediation: {provisioningStatus.provisioningJob.remediationHint}
                                            </p>
                                        ) : null}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <a
                                                href="/dashboard/deployments"
                                                className="inline-flex rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900"
                                            >
                                                Open provisioning controls
                                            </a>
                                            <a
                                                href="/contact"
                                                className="inline-flex rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"
                                            >
                                                Contact support
                                            </a>
                                        </div>
                                    </div>
                                )}

                                <a
                                    href="/dashboard"
                                    className={`mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold ${provisioningCompleted
                                        ? "bg-gradient-to-r from-emerald-500 to-sky-600 text-white shadow-md shadow-emerald-500/20"
                                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200"
                                        }`}
                                >
                                    {provisioningCompleted ? "Open dashboard" : "Open dashboard (after provisioning)"}
                                </a>
                            </div>
                        )}

                        {!done && submitError && (
                            <p className="mt-4 text-xs text-rose-600 dark:text-rose-400">{submitError}</p>
                        )}
                    </div>

                    {!done && (
                        <div className="border-t border-slate-200 dark:border-slate-800 p-4 sm:p-6 flex items-center justify-between">
                            <button
                                onClick={() => setStep((s) => Math.max(0, s - 1))}
                                disabled={step === 0}
                                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={next}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                            >
                                {submitting ? "Finishing..." : step === steps.length - 1 ? "Finish Setup" : "Continue"}
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
