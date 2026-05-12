import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/internal-session';
import DesktopPanel from '../components/desktop-panel';

export default async function DesktopPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/desktop');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <Link
                href="/"
                style={{
                    fontSize: '0.8rem',
                    color: 'var(--ink-soft)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    marginBottom: '0.5rem',
                }}
            >
                ← Back to dashboard
            </Link>

            <p
                style={{
                    margin: '0 0 0.25rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-muted)',
                }}
            >
                Automation
            </p>
            <h1 style={{ margin: '0 0 0.35rem' }}>Desktop Agent</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                View and manage desktop profile, browser session, and action history.
            </p>

            <DesktopPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
