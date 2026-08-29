'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'af_onboarding_dismissed';

type Step = {
    id: string;
    label: string;
    description: string;
    href: string;
    cta: string;
};

const STEPS: Step[] = [
    {
        id: 'workspace',
        label: 'Create a workspace',
        description: 'Organize agents, tasks, and approvals into isolated environments.',
        href: '/?tab=overview',
        cta: 'View workspace',
    },
    {
        id: 'agent',
        label: 'Add your first agent',
        description: 'Deploy an autonomous agent to start automating work.',
        href: '/agents',
        cta: 'Add agent',
    },
    {
        id: 'task',
        label: 'Run your first task',
        description: 'Submit a task and watch your agent handle it end-to-end.',
        href: '/batch-tasks',
        cta: 'Create task',
    },
    {
        id: 'webhook',
        label: 'Set up a webhook',
        description: 'Connect external systems to trigger agents automatically.',
        href: '/webhooks',
        cta: 'Configure webhook',
    },
];

type Props = {
    agentCount: number;
    taskCount: number;
    webhookCount: number;
};

export function OnboardingChecklist({ agentCount, taskCount, webhookCount }: Props) {
    const [dismissed, setDismissed] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const wasDismissed = localStorage.getItem(STORAGE_KEY) === '1';
        setDismissed(wasDismissed);
        setMounted(true);
    }, []);

    if (!mounted || dismissed) return null;

    const completedMap: Record<string, boolean> = {
        workspace: true,
        agent: agentCount > 0,
        task: taskCount > 0,
        webhook: webhookCount > 0,
    };

    const completedCount = Object.values(completedMap).filter(Boolean).length;
    const allDone = completedCount === STEPS.length;
    const pct = Math.round((completedCount / STEPS.length) * 100);

    return (
        <div className="card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>
                        {allDone ? '✓ Setup complete' : 'Get started'}
                    </h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                        {allDone
                            ? 'Your workspace is fully configured.'
                            : `${completedCount} of ${STEPS.length} steps complete — keep going!`}
                    </p>
                </div>
                <button
                    type="button"
                    className="chip-button"
                    onClick={() => {
                        localStorage.setItem(STORAGE_KEY, '1');
                        setDismissed(true);
                    }}
                    aria-label="Dismiss onboarding checklist"
                >
                    Dismiss
                </button>
            </div>

            {/* Progress bar */}
            <div style={{ height: 4, borderRadius: 9999, background: 'var(--line)', marginBottom: '1rem', overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 9999,
                    background: allDone
                        ? 'linear-gradient(90deg, #34d399, #059669)'
                        : 'linear-gradient(90deg, #d6301f, #d6301f)',
                    transition: 'width 0.4s ease',
                }} />
            </div>

            <div style={{ display: 'grid', gap: '0.55rem' }}>
                {STEPS.map((step) => {
                    const done = completedMap[step.id] === true;
                    return (
                        <div
                            key={step.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.65rem 0.85rem',
                                borderRadius: 10,
                                border: `1px solid ${done ? 'var(--ok-border)' : 'var(--line)'}`,
                                background: done ? 'var(--ok-bg)' : 'var(--bg)',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {/* Check circle */}
                            <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: done ? 'var(--ok)' : 'var(--card)',
                                border: `2px solid ${done ? 'var(--ok)' : 'var(--line-strong)'}`,
                                transition: 'all 0.2s ease',
                            }}>
                                {done && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.84rem',
                                    fontWeight: 600,
                                    color: done ? 'var(--ok)' : 'var(--ink)',
                                    textDecoration: done ? 'line-through' : 'none',
                                }}>
                                    {step.label}
                                </div>
                                {!done && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: 1 }}>
                                        {step.description}
                                    </div>
                                )}
                            </div>

                            {!done && (
                                <Link
                                    href={step.href}
                                    className="chip-button"
                                    style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                                >
                                    {step.cta} →
                                </Link>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
