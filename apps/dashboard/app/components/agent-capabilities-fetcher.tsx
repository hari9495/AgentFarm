'use client';

import { useEffect, useState } from 'react';
import { AgentCapabilitiesPanel } from './agent-capabilities-panel';

// Re-declare only to bridge the type — avoids the "two unrelated types" collision
// by passing `null` when loading and letting the component handle it.

export default function AgentCapabilitiesFetcher({ botId: _botId }: { botId: string }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch('/api/connectors/capabilities')
            .then((res) => res.json())
            .then((body: unknown) => {
                const b = body as { error?: string; message?: string };
                if (b.error ?? b.message) {
                    setError(b.message ?? b.error ?? 'Failed to load capabilities.');
                } else {
                    setData(body);
                }
            })
            .catch(() => setError('Network error loading capabilities.'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3].map((i) => (
                    <div key={i} style={{ height: 40, borderRadius: 8, background: '#f5f5f7' }} />
                ))}
            </div>
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return <AgentCapabilitiesPanel capabilities={data} error={error} />;
}
