import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import EnvReconcilerPanel from '../components/env-reconciler-panel';

export default async function EnvPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/env');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Infrastructure"
                title="Environment Reconciler"
                description="Monitor toolchain versions and reconcile environment drift."
            />

            <EnvReconcilerPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
