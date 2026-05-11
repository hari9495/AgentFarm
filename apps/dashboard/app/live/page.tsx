'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LiveTaskFeed } from '../components/live-task-feed';

export default function LivePage() {
    const [workspaceId, setWorkspaceId] = useState('');

    return (
        <main style={{
            minHeight: '100vh',
            padding: '40px 32px',
            maxWidth: 900,
            margin: '0 auto',
            fontFamily: 'inherit',
        }}>
            <Link
                href="/"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#94a3b8',
                    textDecoration: 'none',
                    fontSize: 14,
                    marginBottom: 32,
                }}
            >
                ← Dashboard
            </Link>

            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
                Live Task Feed
            </h1>
            <p style={{ color: '#94a3b8', marginBottom: 28, marginTop: 0, fontSize: 14 }}>
                Real-time task events streamed from the AgentFarm runtime.
            </p>

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
