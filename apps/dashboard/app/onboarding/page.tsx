'use client';

import Link from 'next/link';
import { Fragment, useState, useEffect, type FormEvent } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 10;

const STEP_LABELS = ['Account', 'Workspace', 'Agent', 'Plan', 'Done'] as const;

type AgentRoleOption = { value: string; label: string; description: string };
const DEFAULT_AGENT_ROLES: AgentRoleOption[] = [
    { value: 'developer_agent', label: 'Developer Agent', description: 'Writes, reviews, and improves code across your repositories.' },
    { value: 'qa_agent', label: 'QA Agent', description: 'Tests, validates, and reports on software quality.' },
    { value: 'devops_agent', label: 'DevOps Agent', description: 'Manages infrastructure, CI/CD pipelines, and deployments.' },
];

const PLAN_DETAILS: Record<string, { price: string; features: string[] }> = {
    free: { price: '$0 / mo', features: ['1 agent', 'Community support', '100 tasks / mo'] },
    growth: { price: '$49 / mo', features: ['5 agents', 'Email support', '2,000 tasks / mo'] },
    enterprise: { price: 'Contact us', features: ['Unlimited agents', 'Dedicated support', 'Custom SLA'] },
};

type PlanOption = { value: string; label: string; price: string; features: string[]; recommended?: boolean };
const DEFAULT_PLANS: PlanOption[] = [
    { value: 'free', label: 'Free', price: '$0 / mo', features: ['1 agent', 'Community support', '100 tasks / mo'] },
    { value: 'growth', label: 'Growth', price: '$49 / mo', features: ['5 agents', 'Email support', '2,000 tasks / mo'], recommended: true },
    { value: 'enterprise', label: 'Enterprise', price: 'Contact us', features: ['Unlimited agents', 'Dedicated support', 'Custom SLA'] },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardState = {
    step: 1 | 2 | 3 | 4 | 5;
    name: string;
    email: string;
    password: string;
    companyName: string;
    workspaceName: string;
    agentRole: string;
    plan: string;
    userId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    provisioningJobId: string;
    loading: boolean;
    error: string | null;
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
    return (
        <div
            style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '0.65rem 0.85rem',
                fontSize: '0.875rem',
                color: '#991b1b',
            }}
        >
            {message}
        </div>
    );
}

function Field({
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    autoFocus,
}: {
    label: string;
    type?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}) {
    return (
        <label
            style={{
                display: 'grid',
                gap: '0.3rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--ink)',
            }}
        >
            {label}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                style={{
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.9rem',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    background: '#fff',
                    color: 'var(--ink)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => {
                    (e.target as HTMLInputElement).style.borderColor = 'var(--brand)';
                }}
                onBlur={(e) => {
                    (e.target as HTMLInputElement).style.borderColor = 'var(--line)';
                }}
            />
        </label>
    );
}

function PrimaryButton({
    children,
    loading,
    onClick,
    type = 'button',
    disabled,
}: {
    children: React.ReactNode;
    loading?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
}) {
    const isDisabled = loading ?? disabled;
    return (
        <button
            type={type}
            disabled={isDisabled}
            onClick={onClick}
            style={{
                padding: '0.7rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                fontFamily: 'inherit',
                background: isDisabled ? 'var(--brand-dark)' : 'var(--brand)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.7 : 1,
                transition: 'opacity 0.15s ease',
                width: '100%',
            }}
        >
            {loading ? 'Please wait…' : children}
        </button>
    );
}

function BackButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                padding: '0.7rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                background: 'var(--bg)',
                color: 'var(--ink-soft)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                cursor: 'pointer',
            }}
        >
            ← Back
        </button>
    );
}

// ── Progress indicator ────────────────────────────────────────────────────────

function ProgressIndicator({ step }: { step: number }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                marginBottom: '1.75rem',
            }}
        >
            {STEP_LABELS.map((label, i) => {
                const num = i + 1;
                const done = num < step;
                const active = num === step;
                return (
                    <Fragment key={num}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.3rem',
                                minWidth: 48,
                            }}
                        >
                            <div
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    background: done ? '#059669' : active ? 'var(--brand)' : 'var(--line)',
                                    color: done || active ? '#fff' : 'var(--ink-muted)',
                                    transition: 'background 0.2s ease, color 0.2s ease',
                                }}
                            >
                                {done ? '✓' : num}
                            </div>
                            <span
                                style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    color: done ? '#059669' : active ? 'var(--brand)' : 'var(--ink-muted)',
                                    transition: 'color 0.2s ease',
                                }}
                            >
                                {label}
                            </span>
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                            <div
                                style={{
                                    flex: 1,
                                    height: 1,
                                    marginTop: 15, // align with centre of 32px circle
                                    background: num < step ? '#059669' : 'var(--line)',
                                    transition: 'background 0.2s ease',
                                }}
                            />
                        )}
                    </Fragment>
                );
            })}
        </div>
    );
}

// ── Step 1 — Account ──────────────────────────────────────────────────────────

function StepAccount({
    state,
    updateState,
}: {
    state: WizardState;
    updateState: (u: Partial<WizardState>) => void;
}) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (state.name.trim().length < 1) {
            updateState({ error: 'Full name is required.' });
            return;
        }
        if (!EMAIL_REGEX.test(state.email.trim())) {
            updateState({ error: 'Please enter a valid email address.' });
            return;
        }
        if (state.password.length < MIN_PASSWORD_LEN) {
            updateState({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` });
            return;
        }
        if (state.companyName.trim().length < 1) {
            updateState({ error: 'Company name is required.' });
            return;
        }

        updateState({ loading: true, error: null });

        try {
            const signupRes = await fetch(`${apiBase}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: state.name.trim(),
                    email: state.email.trim().toLowerCase(),
                    password: state.password,
                    companyName: state.companyName.trim(),
                }),
            });

            const signupData = (await signupRes.json()) as {
                user_id?: string;
                tenant_id?: string;
                workspace_id?: string;
                bot_id?: string;
                provisioning_job_id?: string;
                message?: string;
                error?: string;
            };

            if (!signupRes.ok) {
                const msg =
                    signupData.error === 'email_taken'
                        ? 'An account with this email already exists. Sign in instead.'
                        : (signupData.message ?? 'Signup failed. Please try again.');
                updateState({ loading: false, error: msg });
                return;
            }

            // Obtain an internal-scope session token for dashboard access
            const loginRes = await fetch(`${apiBase}/auth/internal-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: state.email.trim().toLowerCase(),
                    password: state.password,
                }),
            });

            const loginData = (await loginRes.json()) as { token?: string; message?: string };

            if (!loginRes.ok || !loginData.token) {
                updateState({
                    loading: false,
                    error:
                        loginData.message ??
                        'Account created but sign-in failed. Please log in from the login page.',
                });
                return;
            }

            document.cookie = `agentfarm_internal_session=${encodeURIComponent(loginData.token)}; path=/; samesite=strict; max-age=28800`;

            updateState({
                loading: false,
                error: null,
                userId: signupData.user_id ?? '',
                tenantId: signupData.tenant_id ?? '',
                workspaceId: signupData.workspace_id ?? '',
                botId: signupData.bot_id ?? '',
                provisioningJobId: signupData.provisioning_job_id ?? '',
                workspaceName: state.companyName.trim(),
                step: 2,
            });
        } catch {
            updateState({
                loading: false,
                error: 'Cannot connect to the server. Make sure the API gateway is running.',
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
                <h2 style={{ marginBottom: '0.2rem' }}>Create your account</h2>
                <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--ink-soft)' }}>
                    Takes less than 2 minutes. No credit card required.
                </p>
            </div>

            {state.error && <ErrorBanner message={state.error} />}

            <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Field
                    label="Full name"
                    value={state.name}
                    onChange={(v) => updateState({ name: v })}
                    placeholder="Ada Lovelace"
                    autoFocus
                />
                <Field
                    label="Work email"
                    type="email"
                    value={state.email}
                    onChange={(v) => updateState({ email: v })}
                    placeholder="ada@company.com"
                />
                <Field
                    label="Password"
                    type="password"
                    value={state.password}
                    onChange={(v) => updateState({ password: v })}
                    placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
                />
                <Field
                    label="Company name"
                    value={state.companyName}
                    onChange={(v) => updateState({ companyName: v })}
                    placeholder="Acme Corp"
                />
            </div>

            <PrimaryButton type="submit" loading={state.loading}>
                Create account →
            </PrimaryButton>
        </form>
    );
}

// ── Step 2 — Workspace ────────────────────────────────────────────────────────

function StepWorkspace({
    state,
    updateState,
}: {
    state: WizardState;
    updateState: (u: Partial<WizardState>) => void;
}) {
    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (state.workspaceName.trim().length < 1) {
            updateState({ error: 'Workspace name is required.' });
            return;
        }
        updateState({ error: null, step: 3 });
    };

    return (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
                <h2 style={{ marginBottom: '0.2rem' }}>Name your workspace</h2>
                <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--ink-soft)' }}>
                    Your workspace is where agents, approvals, and evidence live together.
                </p>
            </div>

            {state.error && <ErrorBanner message={state.error} />}

            <Field
                label="Workspace name"
                value={state.workspaceName}
                onChange={(v) => updateState({ workspaceName: v })}
                placeholder="Engineering · Product · Ops"
                autoFocus
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                <BackButton onClick={() => updateState({ step: 1, error: null })} />
                <PrimaryButton type="submit">Continue →</PrimaryButton>
            </div>
        </form>
    );
}

// ── Step 3 — Agent ────────────────────────────────────────────────────────────

function StepAgent({
    state,
    updateState,
    agentRoles,
}: {
    state: WizardState;
    updateState: (u: Partial<WizardState>) => void;
    agentRoles: AgentRoleOption[];
}) {
    const handleNext = async () => {
        if (!state.agentRole) {
            updateState({ error: 'Please select an agent type.' });
            return;
        }
        updateState({ loading: true, error: null });

        try {
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId: state.workspaceId, role: state.agentRole }),
            });

            if (res.status === 409) {
                // Bot was already created during signup — expected outcome, treat as success
                updateState({ loading: false, error: null, step: 4 });
                return;
            }

            if (!res.ok) {
                const data = (await res.json()) as { error?: string; message?: string };
                updateState({
                    loading: false,
                    error: data.message ?? data.error ?? 'Failed to configure agent. Please try again.',
                });
                return;
            }

            const data = (await res.json()) as { bot?: { id: string } };
            updateState({
                loading: false,
                error: null,
                botId: data.bot?.id ?? state.botId,
                step: 4,
            });
        } catch {
            updateState({ loading: false, error: 'Network error. Please check your connection.' });
        }
    };

    return (
        <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
                <h2 style={{ marginBottom: '0.2rem' }}>Choose your agent type</h2>
                <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--ink-soft)' }}>
                    Select the role for your first autonomous agent.
                </p>
            </div>

            {state.error && <ErrorBanner message={state.error} />}

            <div style={{ display: 'grid', gap: '0.6rem' }}>
                {agentRoles.map((r) => {
                    const selected = state.agentRole === r.value;
                    return (
                        <button
                            key={r.value}
                            type="button"
                            onClick={() => updateState({ agentRole: r.value, error: null })}
                            style={{
                                textAlign: 'left',
                                padding: '0.85rem 1rem',
                                border: `2px solid ${selected ? 'var(--brand)' : 'var(--line)'}`,
                                borderRadius: 10,
                                background: selected ? 'var(--brand-light)' : '#fff',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s ease, background 0.15s ease',
                                fontFamily: 'inherit',
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    color: selected ? 'var(--brand-dark)' : 'var(--ink)',
                                }}
                            >
                                {r.label}
                            </div>
                            <div
                                style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--ink-soft)',
                                    marginTop: 2,
                                }}
                            >
                                {r.description}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                <BackButton onClick={() => updateState({ step: 2, error: null })} />
                <PrimaryButton loading={state.loading} onClick={handleNext}>
                    Continue →
                </PrimaryButton>
            </div>
        </div>
    );
}

// ── Step 4 — Plan ─────────────────────────────────────────────────────────────

function StepPlan({
    state,
    updateState,
    plans,
}: {
    state: WizardState;
    updateState: (u: Partial<WizardState>) => void;
    plans: PlanOption[];
}) {
    const handleNext = () => {
        if (!state.plan) {
            updateState({ error: 'Please select a plan.' });
            return;
        }
        updateState({ error: null, step: 5 });
    };

    return (
        <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
                <h2 style={{ marginBottom: '0.2rem' }}>Choose your plan</h2>
                <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--ink-soft)' }}>
                    You can upgrade at any time from your billing settings.
                </p>
            </div>

            {state.error && <ErrorBanner message={state.error} />}

            <div style={{ display: 'grid', gap: '0.6rem' }}>
                {plans.map((p) => {
                    const selected = state.plan === p.value;
                    return (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => updateState({ plan: p.value, error: null })}
                            style={{
                                textAlign: 'left',
                                padding: '0.85rem 1rem',
                                border: `2px solid ${selected ? 'var(--brand)' : 'var(--line)'}`,
                                borderRadius: 10,
                                background: selected ? 'var(--brand-light)' : '#fff',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s ease, background 0.15s ease',
                                fontFamily: 'inherit',
                                position: 'relative',
                            }}
                        >
                            {p.recommended && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 10,
                                        fontSize: '0.62rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        background: 'var(--brand)',
                                        color: '#fff',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                    }}
                                >
                                    Recommended
                                </span>
                            )}
                            <div
                                style={{
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    color: selected ? 'var(--brand-dark)' : 'var(--ink)',
                                }}
                            >
                                {p.label}
                            </div>
                            <div
                                style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: selected ? 'var(--brand)' : 'var(--ink-soft)',
                                    marginTop: 1,
                                }}
                            >
                                {p.price}
                            </div>
                            <ul
                                style={{
                                    margin: '0.4rem 0 0',
                                    padding: 0,
                                    listStyle: 'none',
                                    display: 'flex',
                                    gap: '0.6rem',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {p.features.map((f) => (
                                    <li key={f} style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                        · {f}
                                    </li>
                                ))}
                            </ul>
                        </button>
                    );
                })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                <BackButton onClick={() => updateState({ step: 3, error: null })} />
                <PrimaryButton onClick={handleNext}>Finish setup →</PrimaryButton>
            </div>
        </div>
    );
}

// ── Step 5 — Done ─────────────────────────────────────────────────────────────

function KvRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <li
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.45rem 0',
                borderBottom: '1px solid var(--line)',
                fontSize: '0.82rem',
            }}
        >
            <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{label}</span>
            <span
                style={{
                    color: 'var(--ink)',
                    fontWeight: 600,
                    fontFamily: mono ? 'var(--font-plex-mono)' : 'inherit',
                    fontSize: mono ? '0.75rem' : '0.82rem',
                    maxWidth: '60%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {value}
            </span>
        </li>
    );
}

function StepDone({ state, agentRoles, plans }: { state: WizardState; agentRoles: AgentRoleOption[]; plans: PlanOption[] }) {
    const planLabel = plans.find((p) => p.value === state.plan)?.label ?? 'Free';
    const agentLabel =
        agentRoles.find((r) => r.value === state.agentRole)?.label ?? state.agentRole;

    return (
        <div className="card" style={{ display: 'grid', gap: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>🎉</div>
            <div>
                <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.3rem' }}>You&apos;re all set!</h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                    Your workspace <strong>{state.workspaceName}</strong> is provisioning in the background.
                </p>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, textAlign: 'left' }}>
                <KvRow label="Workspace" value={state.workspaceName} />
                <KvRow label="Agent type" value={agentLabel} />
                <KvRow label="Plan" value={planLabel} />
                {state.provisioningJobId && (
                    <KvRow label="Job ID" value={state.provisioningJobId} mono />
                )}
            </ul>

            <div style={{ display: 'grid', gap: '0.5rem', textAlign: 'center' }}>
                <Link
                    href="/"
                    style={{
                        display: 'block',
                        padding: '0.7rem',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        background: 'var(--brand)',
                        color: '#fff',
                        borderRadius: 8,
                        textDecoration: 'none',
                        textAlign: 'center',
                    }}
                >
                    Go to Dashboard
                </Link>
                <Link
                    href="/agents"
                    style={{
                        display: 'block',
                        padding: '0.7rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        textDecoration: 'none',
                        textAlign: 'center',
                    }}
                >
                    View Agents
                </Link>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
    const [agentRoles, setAgentRoles] = useState<AgentRoleOption[]>(DEFAULT_AGENT_ROLES);
    const [plans, setPlans] = useState<PlanOption[]>(DEFAULT_PLANS);

    useEffect(() => {
        void fetch('/api/onboarding/agent-roles', { cache: 'no-store' })
            .then(r => r.json())
            .then((data: { roles?: Array<{ id: string; label: string }> }) => {
                if (Array.isArray(data.roles) && data.roles.length > 0) {
                    setAgentRoles(
                        data.roles.map(r => ({
                            value: r.id,
                            label: r.label,
                            description: DEFAULT_AGENT_ROLES.find(d => d.value === r.id)?.description ?? '',
                        })),
                    );
                }
            })
            .catch(() => { /* keep defaults on failure */ });

        void fetch('/api/onboarding/plans', { cache: 'no-store' })
            .then(r => r.json())
            .then((data: { plans?: Array<{ id: string; label: string; recommended?: boolean }> }) => {
                if (Array.isArray(data.plans) && data.plans.length > 0) {
                    setPlans(
                        data.plans.map(p => ({
                            value: p.id,
                            label: p.label,
                            recommended: p.recommended,
                            price: PLAN_DETAILS[p.id]?.price ?? p.label,
                            features: PLAN_DETAILS[p.id]?.features ?? [],
                        })),
                    );
                }
            })
            .catch(() => { /* keep defaults on failure */ });
    }, []);

    const [state, setState] = useState<WizardState>({
        step: 1,
        name: '',
        email: '',
        password: '',
        companyName: '',
        workspaceName: '',
        agentRole: 'developer_agent',
        plan: 'growth',
        userId: '',
        tenantId: '',
        workspaceId: '',
        botId: '',
        provisioningJobId: '',
        loading: false,
        error: null,
    });

    const updateState = (updates: Partial<WizardState>) => {
        setState((prev) => ({ ...prev, ...updates }));
    };

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem 1rem',
                background: 'var(--bg)',
            }}
        >
            <div style={{ width: '100%', maxWidth: 520 }}>
                {/* Brand header */}
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <span
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--brand)',
                            background: 'var(--brand-light)',
                            padding: '3px 10px',
                            borderRadius: 20,
                            display: 'inline-block',
                        }}
                    >
                        AgentFarm
                    </span>
                    <h1
                        style={{
                            margin: '0.5rem 0 0.2rem',
                            fontSize: '1.625rem',
                            fontWeight: 700,
                            color: 'var(--ink)',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {state.step < 5 ? 'Set up your account' : 'Welcome aboard'}
                    </h1>
                    {state.step < 5 && (
                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                            Step {state.step} of 5
                        </p>
                    )}
                </div>

                <ProgressIndicator step={state.step} />

                {state.step === 1 && <StepAccount state={state} updateState={updateState} />}
                {state.step === 2 && <StepWorkspace state={state} updateState={updateState} />}
                {state.step === 3 && <StepAgent state={state} updateState={updateState} agentRoles={agentRoles} />}
                {state.step === 4 && <StepPlan state={state} updateState={updateState} plans={plans} />}
                {state.step === 5 && <StepDone state={state} agentRoles={agentRoles} plans={plans} />}

                {state.step === 1 && (
                    <p
                        style={{
                            textAlign: 'center',
                            marginTop: '1.25rem',
                            fontSize: '0.875rem',
                            color: 'var(--ink-soft)',
                        }}
                    >
                        Already have an account?{' '}
                        <Link
                            href="/login"
                            style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
                        >
                            Sign in
                        </Link>
                    </p>
                )}
            </div>
        </main>
    );
}
