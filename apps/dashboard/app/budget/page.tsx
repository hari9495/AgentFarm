import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/internal-session';
import BudgetPolicyPanel from '../components/budget-policy-panel';

export default async function BudgetPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/budget');
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
                Finance
            </p>
            <h1 style={{ margin: '0 0 0.35rem' }}>Budget Policy</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                Monitor and control workspace spending limits and hard stops.
            </p>

            <BudgetPolicyPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
