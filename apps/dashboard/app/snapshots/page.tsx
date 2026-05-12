import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/internal-session';
import CapabilitySnapshotPanel from '../components/capability-snapshot-panel';

type SearchParams = {
    botId?: string;
};

export default async function SnapshotsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/snapshots');
    }

    const params = await searchParams;
    const botId = params.botId?.trim() ?? '';

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
                Agent State
            </p>
            <h1 style={{ margin: '0 0 0.35rem' }}>Capability Snapshots</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                View frozen capability snapshots for each agent.
            </p>

            <CapabilitySnapshotPanel botId={botId} />
        </main>
    );
}
