import { redirect } from 'next/navigation';
import { PageHeader } from '../../components/page-header';
import { getSessionPayload } from '../../lib/internal-session';
import InboundWebhooksPanel from '../../components/inbound-webhooks-panel';

export default async function InboundWebhooksPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/webhooks/inbound');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Integrations"
                title="Inbound Webhooks"
                description="Register sources, view received events, and test delivery."
            />
            <InboundWebhooksPanel />
        </main>
    );
}
