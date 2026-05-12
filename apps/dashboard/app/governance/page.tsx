import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/internal-session';
import { GovernanceWorkflowPanel } from '../components/governance-workflow-panel';

export default async function GovernancePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/governance');
    }

    const workspaceId = session.workspaceIds?.[0] ?? 'ws_1';

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
                    Governance
                </p>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                    Governance Workflows
                </h1>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
                    Monitor org-level governance workflow SLA and review bottlenecks for approvals.
                </p>
            </header>
            <GovernanceWorkflowPanel workspaceId={workspaceId} />
        </main>
    );
}

