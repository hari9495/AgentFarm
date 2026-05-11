import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/internal-session';
import AbTestsPanel from '../components/ab-tests-panel';

export default async function AbTestsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/ab-tests');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <header style={{ marginBottom: '2rem' }}>
                <Link
                    href="/"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.8rem',
                        color: 'var(--ink-muted)',
                        textDecoration: 'none',
                        marginBottom: '0.75rem',
                    }}
                >
                    ← Dashboard
                </Link>
                <p
                    style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-muted)',
                        marginBottom: '0.35rem',
                    }}
                >
                    A/B Testing
                </p>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                    A/B Tests
                </h1>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
                    Manage A/B test experiments, view variant results, and conclude tests.
                </p>
            </header>
            <div style={{ marginTop: '2rem' }}>
                <AbTestsPanel tenantId={tenantId} />
            </div>
        </main>
    );
}
