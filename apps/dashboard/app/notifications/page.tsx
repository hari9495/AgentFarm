import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import NotificationsPanel from '../components/notifications-panel';

export default async function NotificationsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/notifications');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Observability"
                title="Notifications"
                description="Monitor notification delivery across all channels."
            />
            <NotificationsPanel />
        </main>
    );
}
