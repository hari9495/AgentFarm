import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import OutboundWebhooksPanel from '../components/outbound-webhooks-panel';

export default async function WebhooksOpsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/webhooks-ops');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Webhook Ops"
                title="Outbound Webhook Operations"
                description="Inspect the dead-letter queue, replay past deliveries, and browse the event catalog."
            />
            <OutboundWebhooksPanel tenantId={tenantId} />
        </main>
    );
}
