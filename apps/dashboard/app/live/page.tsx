'use client';

import { useState } from 'react';
import { PageHeader } from '../components/page-header';
import { LiveTaskFeed } from '../components/live-task-feed';

export default function LivePage() {
    const [workspaceId, setWorkspaceId] = useState('');

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Operations"
                title="Live Task Feed"
                description="Real-time task events streamed from the AgentFarm runtime."
            />

            <input
                type="text"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder="Workspace ID (optional)"
                style={{
                    width: '100%',
                    maxWidth: 360,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'inherit',
                    fontSize: 14,
                    marginBottom: 28,
                    outline: 'none',
                    boxSizing: 'border-box',
                }}
            />

            <LiveTaskFeed workspaceId={workspaceId || undefined} />
        </main>
    );
}
