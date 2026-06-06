'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';

const DISMISSED_KEY = 'af_onboarding_dismissed_v1';

type Step = {
    id: string;
    label: string;
    href: string;
    done: boolean;
};

type Props = {
    hasBot: boolean;
    hasConnector: boolean;
    hasPendingApproval: boolean;
    hasSchedule: boolean;
    hasBranding: boolean;
};

export function OperatorOnboardingBanner({
    hasBot,
    hasConnector,
    hasPendingApproval,
    hasSchedule,
    hasBranding,
}: Props) {
    const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

    useEffect(() => {
        setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    }, []);

    const steps: Step[] = [
        { id: 'agent',     label: 'Deploy an agent',               href: '/agents',           done: hasBot },
        { id: 'connector', label: 'Connect an integration',        href: '/connectors',       done: hasConnector },
        { id: 'approval',  label: 'Review your first approval',     href: '/?tab=approvals',   done: hasPendingApproval },
        { id: 'schedule',  label: 'Create a scheduled task',        href: '/scheduled-tasks',  done: hasSchedule },
        { id: 'branding',  label: 'Set up portal branding',         href: '/tenant-settings',  done: hasBranding },
    ];

    const doneCount = steps.filter((s) => s.done).length;
    const allDone = doneCount === steps.length;

    if (dismissed || allDone) return null;

    const dismiss = () => {
        localStorage.setItem(DISMISSED_KEY, '1');
        setDismissed(true);
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(0,82,204,0.04) 0%, rgba(0,82,204,0.02) 100%)',
            border: '1px solid rgba(0,82,204,0.15)',
            borderRadius: '0.6rem',
            padding: '0.9rem 1.1rem',
            marginBottom: '1rem',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>
                        Getting started — {doneCount}/{steps.length} complete
                    </span>
                    <div style={{ height: 4, background: 'var(--line)', borderRadius: 9999, overflow: 'hidden', marginTop: '0.3rem', width: 200 }}>
                        <div style={{ height: '100%', width: `${(doneCount / steps.length) * 100}%`, background: 'var(--accent)', borderRadius: 9999, transition: 'width 0.4s' }} />
                    </div>
                </div>
                <button type="button" onClick={dismiss} title="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', padding: 2 }}>
                    <X size={14} />
                </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {steps.map((s) => (
                    <Link
                        key={s.id}
                        href={s.href}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.2rem 0.6rem', borderRadius: 9999,
                            fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
                            background: s.done ? 'rgba(26,122,74,0.08)' : 'rgba(0,82,204,0.07)',
                            color: s.done ? '#1a7a4a' : 'var(--accent)',
                            border: `1px solid ${s.done ? 'rgba(26,122,74,0.2)' : 'rgba(0,82,204,0.2)'}`,
                            opacity: s.done ? 0.7 : 1,
                        }}
                    >
                        {s.done
                            ? <CheckCircle2 size={11} />
                            : <Circle size={11} />}
                        {s.label}
                    </Link>
                ))}
            </div>
        </div>
    );
}
