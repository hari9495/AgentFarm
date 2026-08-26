"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Github, Rocket, Users, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StepId = "github" | "team" | "deploy";

const steps: { id: StepId; title: string; subtitle: string; icon: LucideIcon }[] = [
    { id: "github", title: "Connect GitHub", subtitle: "Authorize org and repositories", icon: Github },
    { id: "team", title: "Invite Team", subtitle: "Add collaborators and roles", icon: Users },
    { id: "deploy", title: "Deploy First AI Worker", subtitle: "Choose a role and start", icon: Rocket },
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

/** Logo lockup — same mark as signup / login. */
function BrandMark() {
    return (
        <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--op-indigo)" }}>
                <svg width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="5" stroke="white" strokeWidth="1.5" />
                    <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </span>
            <span className="font-semibold text-[15px] tracking-[-0.01em]" style={{ color: "var(--op-ink)" }}>AgentFarms</span>
        </Link>
    );
}

const fieldCls =
    "w-full px-3.5 py-2.5 rounded-lg border bg-white text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] outline-none focus:ring-2 transition border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]";
const labelCls = "block text-[13px] font-medium mb-1.5";

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
                const response = await fetch("/api/provisioning/status", { method: "GET", cache: "no-store" });
                const data = (await response.json()) as ProvisioningStatusPayload & { error?: string };

                if (!response.ok) {
                    if (!disposed) setProvisioningError(data.error ?? "Unable to load provisioning status.");
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
                if (!disposed) setProvisioningError("Network error while loading provisioning status.");
            } finally {
                if (!disposed) setProvisioningLoading(false);
            }
        };

        pullProvisioningStatus();
        intervalId = setInterval(pullProvisioningStatus, 3000);

        return () => {
            disposed = true;
            if (intervalId) clearInterval(intervalId);
        };
    }, [done]);

    async function next() {
        const nextErrors: { org?: string; email?: string } = {};
        if (active.id === "github" && org.trim().length < 2) nextErrors.org = "Organization name is required.";
        if (active.id === "team" && !/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
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
                body: JSON.stringify({ githubOrg: org, inviteEmail: email, starterAgent: agent }),
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
        <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)" }}>
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(45% 38% at 50% 0%, var(--op-indigo-soft), transparent 70%)" }} />

            <main className="relative flex-1 flex items-center justify-center px-4 py-12">
                <div className="op-rise w-full max-w-[680px]">
                    <div className="flex justify-center mb-7"><BrandMark /></div>

                    <div className="rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid var(--op-line)", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" }}>
                        {/* Header */}
                        <div className="p-7" style={{ borderBottom: "1px solid var(--op-line)" }}>
                            <h1 className="font-display font-bold" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>Get started in minutes</h1>
                            <p className="mt-1.5 text-[14px]" style={{ color: "var(--op-muted)" }}>Connect your tools, invite your team, and deploy your first AI worker.</p>

                            <div className="mt-5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--op-paper-3)" }}>
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: "var(--op-indigo)" }} />
                            </div>

                            <div className="mt-4 grid sm:grid-cols-3 gap-3">
                                {steps.map((s, i) => {
                                    const Icon = s.icon;
                                    const state = i < step ? "done" : i === step ? "active" : "idle";
                                    return (
                                        <div
                                            key={s.id}
                                            className="rounded-xl px-3 py-2.5"
                                            style={{
                                                border: `1px solid ${state === "active" ? "var(--op-indigo)" : "var(--op-line)"}`,
                                                background: state === "active" ? "var(--op-indigo-soft)" : "transparent",
                                            }}
                                        >
                                            <p className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: "var(--op-ink)" }}>
                                                {state === "done"
                                                    ? <Check className="w-3.5 h-3.5" style={{ color: "var(--op-approved)" }} />
                                                    : <Icon className="w-3.5 h-3.5" style={{ color: state === "active" ? "var(--op-indigo)" : "var(--op-muted)" }} />}
                                                {s.title}
                                            </p>
                                            <p className="text-[11px] mt-0.5" style={{ color: "var(--op-muted)" }}>{s.subtitle}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-7">
                            {!done && active.id === "github" && (
                                <div>
                                    <label htmlFor="ob-org" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>GitHub organization</label>
                                    <input id="ob-org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="acme-org" className={fieldCls} />
                                    {errors.org && <p className="mt-1.5 flex items-center gap-1 text-[12px]" style={{ color: "var(--op-blocked)" }}><AlertCircle className="w-3.5 h-3.5 shrink-0" />{errors.org}</p>}
                                </div>
                            )}

                            {!done && active.id === "team" && (
                                <div>
                                    <label htmlFor="ob-email" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>First teammate invite</label>
                                    <input id="ob-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" className={fieldCls} autoComplete="email" autoCapitalize="off" />
                                    {errors.email && <p className="mt-1.5 flex items-center gap-1 text-[12px]" style={{ color: "var(--op-blocked)" }}><AlertCircle className="w-3.5 h-3.5 shrink-0" />{errors.email}</p>}
                                </div>
                            )}

                            {!done && active.id === "deploy" && (
                                <div>
                                    <label htmlFor="ob-agent" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>Starter agent role</label>
                                    <select id="ob-agent" value={agent} onChange={(e) => setAgent(e.target.value)} className={fieldCls}>
                                        <option value="ai-developer">Developer</option>
                                        <option value="ai-tester">Tester</option>
                                        <option value="ai-fullstack-developer">Full Stack Developer</option>
                                        <option value="ai-devops-engineer">DevOps Engineer</option>
                                        <option value="ai-sales-rep">Sales Representative</option>
                                        <option value="ai-corporate-assistant">Corporate Assistant</option>
                                        <option value="ai-technical-writer">Technical Writer</option>
                                        <option value="ai-business-analyst">Business Analyst</option>
                                        <option value="ai-content-writer">Content Writer</option>
                                        <option value="ai-customer-support">Customer Support Executive</option>
                                        <option value="ai-marketing-specialist">Marketing Specialist</option>
                                        <option value="ai-project-manager">Project Manager / Scrum Master</option>
                                        <option value="ai-recruiter">Recruiter</option>
                                    </select>
                                </div>
                            )}

                            {done && (
                                <div
                                    className="rounded-2xl p-6 text-center"
                                    style={{
                                        border: `1px solid ${provisioningFailed ? "var(--op-blocked)" : "var(--op-approved)"}`,
                                        background: provisioningFailed ? "#fdecea" : "var(--op-approved-soft)",
                                    }}
                                >
                                    <div className="mx-auto h-11 w-11 rounded-full flex items-center justify-center" style={{ background: "var(--op-approved)" }}>
                                        <Check className="w-6 h-6 text-white" />
                                    </div>
                                    <h2 className="mt-3 font-display font-bold" style={{ fontSize: "1.25rem", color: "var(--op-ink)" }}>Onboarding complete</h2>
                                    <p className="text-[14px] mt-1" style={{ color: "var(--op-muted)" }}>Your workspace setup is tracked live while provisioning finishes.</p>

                                    <div className="mt-4 rounded-xl bg-white p-4 text-left" style={{ border: "1px solid var(--op-line)" }}>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>Provisioning status</p>
                                        {provisioningLoading && !provisioningStatus && <p className="mt-2 text-[14px]" style={{ color: "var(--op-muted)" }}>Loading status…</p>}
                                        {!provisioningLoading && !provisioningStatus && !provisioningError && <p className="mt-2 text-[14px]" style={{ color: "var(--op-muted)" }}>Waiting for provisioning status…</p>}
                                        {provisioningStatus && (
                                            <div className="mt-2 grid gap-1.5 text-[14px]" style={{ color: "var(--op-ink-soft)" }}>
                                                <p>Tenant: <span className="font-semibold" style={{ color: "var(--op-ink)" }}>{formatProvisioningStatus(provisioningStatus.tenant?.tenantStatus)}</span></p>
                                                <p>Workspace: <span className="font-semibold" style={{ color: "var(--op-ink)" }}>{formatProvisioningStatus(provisioningStatus.workspace?.workspaceStatus)}</span></p>
                                                <p>Bot: <span className="font-semibold" style={{ color: "var(--op-ink)" }}>{formatProvisioningStatus(provisioningStatus.bot?.botStatus)}</span></p>
                                                <p>Job: <span className="font-semibold" style={{ color: "var(--op-ink)" }}>{formatProvisioningStatus(provisioningStatus.provisioningJob?.status)}</span></p>
                                                {provisioningStatus.provisioningJob?.updatedAt ? (
                                                    <p>Last transition: <span className="font-semibold" style={{ color: "var(--op-ink)" }}>{new Date(provisioningStatus.provisioningJob.updatedAt).toLocaleString()}</span></p>
                                                ) : null}
                                            </div>
                                        )}
                                        {provisioningError && <p className="mt-2 text-[12px]" style={{ color: "var(--op-blocked)" }}>{provisioningError}</p>}
                                    </div>

                                    {provisioningFailed && (
                                        <div className="mt-4 rounded-xl bg-white p-4 text-left" style={{ border: "1px solid var(--op-blocked)" }}>
                                            <p className="text-[14px] font-semibold" style={{ color: "var(--op-blocked)" }}>Provisioning needs attention</p>
                                            <p className="mt-1 text-[12px]" style={{ color: "var(--op-muted)" }}>Retry from your dashboard provisioning controls, or contact support if this persists.</p>
                                            {provisioningStatus?.provisioningJob?.failureReason ? (
                                                <p className="mt-1 text-[12px]" style={{ color: "var(--op-blocked)" }}>Failure reason: {provisioningStatus.provisioningJob.failureReason}</p>
                                            ) : null}
                                            {provisioningStatus?.provisioningJob?.remediationHint ? (
                                                <p className="mt-1 text-[12px]" style={{ color: "var(--op-muted)" }}>Remediation: {provisioningStatus.provisioningJob.remediationHint}</p>
                                            ) : null}
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <a href="/dashboard/deployments" className="inline-flex rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: "var(--op-indigo)" }}>Open provisioning controls</a>
                                                <a href="/contact" className="inline-flex rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-white" style={{ border: "1px solid var(--op-blocked)", color: "var(--op-blocked)" }}>Contact support</a>
                                            </div>
                                        </div>
                                    )}

                                    <a
                                        href="/dashboard"
                                        className="mt-4 inline-flex rounded-lg px-5 py-2.5 text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
                                        style={provisioningCompleted
                                            ? { background: "var(--op-indigo)", color: "white" }
                                            : { background: "var(--op-paper-3)", color: "var(--op-muted)" }}
                                    >
                                        {provisioningCompleted ? "Open dashboard" : "Open dashboard (after provisioning)"}
                                    </a>
                                </div>
                            )}

                            {!done && submitError && (
                                <p className="mt-4 flex items-center gap-1 text-[12px]" style={{ color: "var(--op-blocked)" }}><AlertCircle className="w-3.5 h-3.5 shrink-0" />{submitError}</p>
                            )}
                        </div>

                        {/* Footer nav */}
                        {!done && (
                            <div className="p-5 flex items-center justify-between" style={{ borderTop: "1px solid var(--op-line)" }}>
                                <button
                                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                                    disabled={step === 0}
                                    className="rounded-lg px-4 py-2 text-[13px] font-semibold bg-white transition-colors hover:bg-[var(--op-paper-2)] disabled:opacity-40"
                                    style={{ border: "1px solid var(--op-line)", color: "var(--op-ink)" }}
                                >
                                    Back
                                </button>
                                <button
                                    onClick={next}
                                    disabled={submitting}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                                    style={{ background: "var(--op-indigo)" }}
                                >
                                    {submitting ? "Finishing…" : step === steps.length - 1 ? "Finish setup" : "Continue"}
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <footer className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-8 text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                <span>© {new Date().getFullYear()} AgentFarms</span>
                <Link href="/privacy" className="hover:text-[color:var(--op-indigo)] transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-[color:var(--op-indigo)] transition-colors">Terms</Link>
            </footer>
        </div>
    );
}
