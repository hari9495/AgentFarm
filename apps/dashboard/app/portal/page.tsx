import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPortalSessionPayload } from '../lib/portal-session-client';

export default async function PortalHomePage() {
    const session = await getPortalSessionPayload();
    if (!session) redirect('/portal/login');

    const greeting = session.displayName
        ? `Welcome back, ${session.displayName}`
        : `Welcome, ${session.email}`;

    return (
        <main style={{
            minHeight: 'calc(100vh - 52px)', background: 'var(--bg)',
            padding: '2.5rem 1.5rem', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.3rem' }}>
                        {greeting}
                    </h1>
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)' }}>
                        Tenant: <code style={{ background: 'var(--line)', padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.82rem' }}>{session.tenantId}</code>
                    </p>
                </div>

                {/* Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                    <PortalCard
                        href="/portal/support"
                        icon="💬"
                        title="Support Chat"
                        description="Chat with our AI agent to diagnose and fix platform issues instantly."
                        cta="Open Chat"
                        accent="#2563eb"
                    />
                    <PortalCard
                        href="/portal/support?tab=voice"
                        icon="📞"
                        title="Voice Support"
                        description="Call our AI voice assistant in Hindi, Tamil, Telugu, or English."
                        cta="Begin Call"
                        accent="#7c3aed"
                    />
                    <PortalCard
                        href="/portal/support/history"
                        icon="📋"
                        title="Ticket History"
                        description="View all your past support tickets and their resolution status."
                        cta="View History"
                        accent="#059669"
                    />
                    <PortalCard
                        href="/portal/account"
                        icon="⚙️"
                        title="Account"
                        description="Manage your profile, change your password, and sign out."
                        cta="Manage Account"
                        accent="#d97706"
                    />
                </div>

                {/* Status notice */}
                <div style={{
                    marginTop: '2rem', padding: '0.9rem 1.1rem',
                    background: 'var(--info-bg)', border: '1px solid var(--info-border)',
                    borderRadius: 8, fontSize: '0.84rem', color: 'var(--info)',
                }}>
                    <strong>Platform Monitoring</strong> — Our AI support agent monitors your platform 24/7.
                    If a critical issue is detected, we will automatically diagnose and apply fixes.
                </div>
            </div>
        </main>
    );
}

function PortalCard({
    href, icon, title, description, cta, accent, comingSoon = false,
}: {
    href: string; icon: string; title: string; description: string;
    cta: string; accent: string; comingSoon?: boolean;
}) {
    return (
        <div style={{
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
            padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
            opacity: comingSoon ? 0.6 : 1,
        }}>
            <div style={{ fontSize: '1.6rem' }}>{icon}</div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{title}</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', lineHeight: 1.5, flex: 1 }}>{description}</p>
            {comingSoon ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>Coming soon</span>
            ) : (
                <Link
                    href={href}
                    style={{
                        display: 'inline-block', marginTop: '0.25rem',
                        padding: '0.35rem 0.8rem', borderRadius: 5,
                        background: accent, color: 'var(--card)',
                        fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
                    }}
                >
                    {cta} →
                </Link>
            )}
        </div>
    );
}
