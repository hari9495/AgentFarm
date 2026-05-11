'use client';

import Link from 'next/link';

export type SubscriptionStatusCardProps = {
    plan?: string;
    status: string;
    expiresAt?: string | null;
    gracePeriodDays?: number;
    suspendedAt?: string | null;
    daysUntilSuspension?: number | null;
    tasksUsed?: number;
    tasksLimit?: number;
};

// ── Badge ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string; label: string }> = {
    active:    { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', label: 'Active' },
    expired:   { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5', label: 'Expired' },
    suspended: { bg: '#fffbeb', text: '#92400e', border: '#fcd34d', label: 'Suspended' },
    cancelled: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'Cancelled' },
    none:      { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'No Plan' },
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_COLOR[status] ?? STATUS_COLOR['none']!;
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                background: s.bg,
                color: s.text,
                border: `1px solid ${s.border}`,
            }}
        >
            {s.label}
        </span>
    );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────

function UsageBar({ used, limit }: { used: number; limit: number }) {
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const color =
        pct > 90 ? '#dc2626' :
        pct > 70 ? '#d97706' :
        '#059669';

    return (
        <div style={{ marginTop: '1rem' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: 'var(--ink-soft)',
                    marginBottom: '0.35rem',
                    fontWeight: 500,
                }}
            >
                <span>Tasks used this period</span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                    {used.toLocaleString()} / {limit.toLocaleString()}
                </span>
            </div>
            <div
                style={{
                    height: 8,
                    background: 'var(--line)',
                    borderRadius: 4,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 4,
                        transition: 'width 0.4s ease',
                    }}
                />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', margin: '0.25rem 0 0' }}>
                {pct.toFixed(0)}% of limit used
            </p>
        </div>
    );
}

// ── CTA buttons ───────────────────────────────────────────────────────────────

function PlanCTA({ plan }: { plan: string }) {
    const lower = plan.toLowerCase();
    if (lower === 'enterprise') {
        return (
            <Link
                href="/contact"
                style={{
                    display: 'inline-block',
                    marginTop: '1rem',
                    padding: '0.55rem 1.1rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    border: '1px solid var(--brand)',
                    borderRadius: 8,
                    color: 'var(--brand)',
                    textDecoration: 'none',
                }}
            >
                Contact Sales
            </Link>
        );
    }
    if (lower === 'pro') {
        return (
            <Link
                href="/billing/upgrade"
                style={{
                    display: 'inline-block',
                    marginTop: '1rem',
                    padding: '0.55rem 1.1rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    border: '1px solid var(--brand)',
                    borderRadius: 8,
                    color: 'var(--brand)',
                    textDecoration: 'none',
                }}
            >
                Upgrade to Enterprise →
            </Link>
        );
    }
    // free or unknown
    return (
        <Link
            href="/billing/upgrade"
            style={{
                display: 'inline-block',
                marginTop: '1rem',
                padding: '0.55rem 1.1rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                background: 'var(--brand)',
                color: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
            }}
        >
            Upgrade to Pro →
        </Link>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubscriptionStatusCard({
    plan,
    status,
    expiresAt,
    suspendedAt,
    daysUntilSuspension,
    tasksUsed,
    tasksLimit,
}: SubscriptionStatusCardProps) {
    const planLabel = plan ?? 'Standard Plan';
    const isExpired = status === 'expired';

    const relevantDate = suspendedAt ?? expiresAt ?? null;
    let dateLabel: string | null = null;
    if (relevantDate) {
        const d = new Date(relevantDate).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
        if (status === 'active') {
            dateLabel = `Renews on ${d}`;
        } else if (isExpired) {
            dateLabel = `Expired on ${d}`;
        } else if (status === 'suspended') {
            dateLabel = `Suspended on ${d}`;
        }
    }

    return (
        <div
            className="card"
            style={{
                display: 'grid',
                gap: '0.25rem',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                }}
            >
                <div>
                    <p
                        style={{
                            margin: '0 0 0.3rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            color: 'var(--ink-muted)',
                        }}
                    >
                        Current Plan
                    </p>
                    <h2
                        style={{
                            margin: 0,
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: 'var(--ink)',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {planLabel}
                    </h2>
                </div>
                <StatusBadge status={status} />
            </div>

            {dateLabel && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                    {dateLabel}
                </p>
            )}

            {daysUntilSuspension != null && daysUntilSuspension >= 0 && status === 'expired' && (
                <p
                    style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.83rem',
                        color: '#d97706',
                        fontWeight: 600,
                    }}
                >
                    ⚠ Suspends in {daysUntilSuspension} day{daysUntilSuspension !== 1 ? 's' : ''} — renew to keep access.
                </p>
            )}

            {tasksUsed != null && tasksLimit != null && (
                <UsageBar used={tasksUsed} limit={tasksLimit} />
            )}

            <div>
                <PlanCTA plan={plan ?? 'free'} />
            </div>
        </div>
    );
}
