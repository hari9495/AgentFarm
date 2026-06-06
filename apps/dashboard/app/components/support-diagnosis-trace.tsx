'use client';

import { useEffect, useRef, useState } from 'react';
import { getSelectedIssueId } from './support-issue-feed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiagnosisStepStatus = 'pending' | 'running' | 'done' | 'failed';

type DiagnosisStep = {
    id: string;
    issueId: string;
    stepType: string;
    description: string;
    status: DiagnosisStepStatus;
    metadata: Record<string, unknown>;
    createdAt: string;
};

type IssueWithSteps = {
    id: string;
    title: string;
    status: string;
    steps: DiagnosisStep[];
};

// ---------------------------------------------------------------------------
// Step icon helpers
// ---------------------------------------------------------------------------

const STEP_ICONS: Record<string, string> = {
    reading: '🔍',
    found: '✅',
    applying: '⚙️',
    fixed: '✔️',
    failed: '❌',
    escalating: '🔺',
};

const STATUS_COLORS: Record<DiagnosisStepStatus, string> = {
    pending: 'var(--ink-muted)',
    running: 'var(--info)',
    done: 'var(--ok)',
    failed: 'var(--danger)',
};

function StepRow({ step }: { step: DiagnosisStep }) {
    const icon = STEP_ICONS[step.stepType] ?? '•';
    const color = STATUS_COLORS[step.status] ?? 'var(--ink-muted)';
    const isRunning = step.status === 'running';

    return (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0' }}>
            <span style={{ fontSize: 16, lineHeight: 1.3, flexShrink: 0 }}>{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--ink)', lineHeight: 1.4 }}>
                    {step.description}
                </p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                    {step.stepType.replace(/_/g, ' ')} ·{' '}
                    {new Date(step.createdAt).toLocaleTimeString(undefined, {
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                </p>
            </div>
            <span style={{
                fontSize: 11, fontWeight: 700, color,
                flexShrink: 0, letterSpacing: '0.03em',
                display: 'flex', alignItems: 'center', gap: 4,
            }}>
                {isRunning && (
                    <span style={{
                        display: 'inline-block', width: 7, height: 7,
                        border: `1.5px solid ${color}`, borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                    }} />
                )}
                {step.status}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupportDiagnosisTrace() {
    const [issueId, setIssueId] = useState<string | null>(null);
    const [data, setData] = useState<IssueWithSteps | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Listen for issue selection
    useEffect(() => {
        const id = getSelectedIssueId();
        if (id) setIssueId(id);

        const handler = (e: Event) => {
            setIssueId((e as CustomEvent<string | null>).detail);
        };
        window.addEventListener('support_issue_selected', handler);
        return () => window.removeEventListener('support_issue_selected', handler);
    }, []);

    // Fetch + poll issue data when id changes
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (!issueId) { setData(null); return; }

        const fetchData = async () => {
            try {
                const res = await fetch(`/api/support/issues/${encodeURIComponent(issueId)}`, {
                    cache: 'no-store',
                });
                if (!res.ok) { setError(`Error ${res.status}`); return; }
                const json = await res.json() as IssueWithSteps;
                setData(json);
                setError(null);
            } catch {
                setError('Failed to load diagnosis trace');
            } finally {
                setLoading(false);
            }
        };

        setLoading(true);
        void fetchData();
        // Poll every 3 seconds while the issue is active
        pollRef.current = setInterval(() => void fetchData(), 3_000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [issueId]);

    // Auto-scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [data?.steps?.length]);

    return (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <header style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Diagnosis Trace</h2>
                {data && (
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                        {data.title}
                    </p>
                )}
            </header>

            <div style={{ padding: '0.75rem 1rem', overflowY: 'auto', maxHeight: '42vh' }}>
                {!issueId && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>
                        Select an issue to view its diagnosis trace.
                    </p>
                )}
                {issueId && loading && !data && (
                    <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', margin: 0 }}>Loading…</p>
                )}
                {error && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{error}</p>
                )}
                {data && data.steps.length === 0 && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>
                        No diagnosis steps yet.
                    </p>
                )}
                {data?.steps.map((step) => (
                    <StepRow key={step.id} step={step} />
                ))}
                <div ref={bottomRef} />
            </div>
        </section>
    );
}
