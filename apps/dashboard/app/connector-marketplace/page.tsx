import { redirect } from 'next/navigation';
import { AgentCapabilitiesPanel } from '../components/agent-capabilities-panel';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';

const API_BASE = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';

type CapabilitiesResponse = {
    sections: unknown[];
    purchasedRoleKeys: string[];
    totalPurchased: number;
    totalAvailable: number;
};

async function fetchCapabilities(authHeader: string): Promise<CapabilitiesResponse | null> {
    try {
        const res = await fetch(`${API_BASE}/v1/connectors/capabilities`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return res.json() as Promise<CapabilitiesResponse>;
    } catch {
        return null;
    }
}

export default async function ConnectorMarketplacePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/connector-marketplace');
    }

    const authHeader = await getInternalSessionAuthHeader();
    const capabilities = authHeader ? await fetchCapabilities(authHeader) : null;

    return (
        <AgentCapabilitiesPanel
            capabilities={capabilities as never}
            error={!capabilities ? 'Unable to load capabilities. Please refresh.' : undefined}
        />
    );
}
