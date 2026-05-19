import { redirect } from 'next/navigation';
import { ConnectorMarketplacePanel } from '../components/connector-marketplace-panel';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';

const API_BASE = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';

async function fetchAgentRoles(authHeader: string): Promise<string[]> {
    try {
        const res = await fetch(`${API_BASE}/v1/agents`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        if (!res.ok) return [];
        const data = await res.json() as { bots?: { role?: string }[] };
        return (data.bots ?? []).map((b) => b.role ?? '').filter(Boolean);
    } catch {
        return [];
    }
}

export default async function ConnectorMarketplacePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/connector-marketplace');
    }

    const authHeader = await getInternalSessionAuthHeader();
    const agentRoles = authHeader ? await fetchAgentRoles(authHeader) : [];

    return <ConnectorMarketplacePanel agentRoles={agentRoles} />;
}
