'use client';

import { useEffect, useState } from 'react';
import { AgentMemoryPatternPanel } from './agent-memory-pattern-panel';

type LearnedPattern = {
    id: string;
    pattern: string;
    confidence: number;
    observedCount: number;
    lastSeen: string;
};

export default function AgentMemoryPatternFetcher({ botId }: { botId: string }) {
    const [patterns, setPatterns] = useState<LearnedPattern[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!botId) return;
        setLoading(true);
        fetch('/api/memory/patterns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId, limit: 20 }),
        })
            .then((res) => res.json())
            .then((body: unknown) => {
                const b = body as { patterns?: LearnedPattern[]; records?: LearnedPattern[]; error?: string; message?: string };
                if (b.error ?? b.message) {
                    setError(b.message ?? b.error ?? 'Failed to load patterns.');
                } else {
                    setPatterns(b.patterns ?? b.records ?? []);
                }
            })
            .catch(() => setError('Network error loading memory patterns.'))
            .finally(() => setLoading(false));
    }, [botId]);

    if (loading) {
        return (
            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map((i) => (
                    <div key={i} style={{ height: 36, borderRadius: 8, background: 'var(--bg)' }} />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>
                {error}
            </div>
        );
    }

    if (patterns.length === 0) {
        return (
            <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: 0 }}>
                No learned patterns yet for this agent.
            </p>
        );
    }

    return <AgentMemoryPatternPanel patterns={patterns} />;
}
