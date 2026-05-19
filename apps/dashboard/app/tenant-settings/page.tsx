import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import TenantSettingsPanel from '../components/tenant-settings-panel';

export default async function TenantSettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/tenant-settings');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Configuration"
                title="Tenant Settings"
                description="Manage language preferences and MCP server integrations for this tenant."
            />
            <TenantSettingsPanel />
        </main>
    );
}
