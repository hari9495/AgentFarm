import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import CircuitBreakersPanel from '../components/circuit-breakers-panel';

export default async function CircuitBreakersPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/circuit-breakers');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Observability"
                title="Circuit Breakers"
                description="Monitor automatic protection state for LLM providers, connectors, and external APIs. Reset tripped circuits to resume service."
            />
            <CircuitBreakersPanel tenantId={session.tenantId} />
        </main>
    );
}
