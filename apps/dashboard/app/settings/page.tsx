import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import ApiKeysPanel from '../components/api-keys-panel';
import CircuitBreakersPanel from '../components/circuit-breakers-panel';
import TaskQueuePanel from '../components/task-queue-panel';

export default async function SettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/settings');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <header style={{ marginBottom: '2rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '0.35rem' }}>
                    Settings &amp; Ops
                </p>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                    Operational Settings
                </h1>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
                    Manage API keys, inspect circuit breaker state, and monitor the task queue.
                </p>
            </header>

            <ApiKeysPanel tenantId={tenantId} />
            <CircuitBreakersPanel tenantId={tenantId} />
            <TaskQueuePanel tenantId={tenantId} />
        </main>
    );
}
