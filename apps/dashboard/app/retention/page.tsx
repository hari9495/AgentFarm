import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import RetentionPolicyPanel from '../components/retention-policy-panel';

export default async function RetentionPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/retention');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Compliance"
                title="Retention Policies"
                description="Define and manage data retention rules across tenant, workspace, and role scopes."
            />
            <RetentionPolicyPanel tenantId={tenantId} />
        </main>
    );
}
