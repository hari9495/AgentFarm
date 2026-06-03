import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import RoiPageClient from './roi-page-client';

export default async function RoiPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/roi');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Business Value"
                title="ROI Dashboard"
                description="See the value your agents are creating — time saved, cost, and return on investment."
            />
            <RoiPageClient />
        </main>
    );
}
