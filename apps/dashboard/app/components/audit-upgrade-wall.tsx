import Link from 'next/link';
import { ScrollText, Film, Waves, Lock, ArrowRight } from 'lucide-react';

const features = [
    { Icon: ScrollText, title: 'Audit Log',            desc: 'Filterable event log by workspace, bot, and event type with CSV export.' },
    { Icon: Film,       title: 'Session Replay',       desc: 'Step-through timeline of every browser and desktop action an agent took.' },
    { Icon: Waves,      title: 'Op. Signal Timeline',  desc: '12-hour annotated telemetry across approvals, runtime, and audit channels.' },
];

type Props = {
    planName?: string;
};

export function AuditUpgradeWall({ planName }: Props) {
    return (
        <div style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            padding: '2.5rem 2rem',
            textAlign: 'center',
            maxWidth: 640,
            margin: '0 auto',
        }}>
            {/* Lock icon */}
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'var(--brand-light)',
                border: '1px solid var(--info-border)',
                marginBottom: '1.25rem',
            }}>
                <Lock className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            </div>

            {/* Heading */}
            <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                Audit &amp; Compliance
            </h2>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                Your current plan
                {planName ? (
                    <strong style={{ color: 'var(--ink-soft)', fontWeight: 600 }}> ({planName})</strong>
                ) : null}
                {' '}does not include Audit &amp; Compliance features.
            </p>
            <p style={{ margin: '0 0 2rem', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                Upgrade to <strong style={{ color: 'var(--brand)' }}>Business</strong> or higher to unlock full audit visibility.
            </p>

            {/* Feature list */}
            <div style={{
                display: 'grid',
                gap: '0.65rem',
                marginBottom: '2rem',
                textAlign: 'left',
            }}>
                {features.map(({ Icon, title, desc }) => (
                    <div key={title} style={{
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'flex-start',
                        padding: '0.75rem 0.9rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: 10,
                    }}>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'var(--brand-light)',
                            flexShrink: 0,
                        }}>
                            <Icon className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                        </span>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.84rem', fontWeight: 700, color: 'var(--ink)' }}>{title}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* CTA */}
            <Link
                href="/billing"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 1.5rem',
                    borderRadius: 9999,
                    background: 'var(--brand)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    textDecoration: 'none',
                    boxShadow: 'var(--shadow-brand)',
                    transition: 'background 0.15s ease',
                }}
            >
                Upgrade to Business
                <ArrowRight className="w-4 h-4" />
            </Link>
            <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                Already upgraded?{' '}
                <Link href="/" style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>
                    Return to dashboard
                </Link>
            </p>
        </div>
    );
}
