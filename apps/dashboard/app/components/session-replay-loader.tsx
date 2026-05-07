'use client';

import { useEffect, useState } from 'react';
import { SessionReplayTimeline } from './session-replay-timeline';

type ReplayItem = {
    id: string;
    actionType: string;
    target: string;
    screenshotBeforeUrl: string;
    screenshotAfterUrl: string;
    diffImageUrl: string | null;
    assertions: Array<{ id: string; description: string; passed: boolean }>;
    networkRequests: Array<{ method: string; url: string; status?: number }>;
    verified: boolean;
    domSnapshotHash: string | null;
    evidenceBundle: {
        screenshotBefore?: { url?: string; provider?: string };
        screenshotAfter?: { url?: string; provider?: string };
        domCheckpoint?: { url?: string } | null;
        domSnapshotStored?: boolean;
    } | null;
    riskLevel: string;
    success: boolean;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string;
    durationMs: number;
};

export function SessionReplayLoader({ sessionId }: { sessionId: string }) {
    const [items, setItems] = useState<ReplayItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const load = async () => {
            setLoading(true);
            setErrorMessage(null);

            try {
                const response = await fetch(`/api/audit/session-replay/${encodeURIComponent(sessionId)}`, {
                    cache: 'no-store',
                });
                const payload = (await response.json().catch(() => ({}))) as {
                    items?: ReplayItem[];
                    message?: string;
                    error?: string;
                };

                if (!active) {
                    return;
                }

                if (!response.ok) {
                    setItems([]);
                    setErrorMessage(payload.message ?? payload.error ?? 'Unable to load session replay.');
                    return;
                }

                setItems(Array.isArray(payload.items) ? payload.items : []);
            } catch {
                if (active) {
                    setItems([]);
                    setErrorMessage('Unable to load session replay.');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            active = false;
        };
    }, [sessionId]);

    if (loading) {
        return <p className="muted">Loading session replay...</p>;
    }

    if (errorMessage) {
        return <div className="status-panel warning">{errorMessage}</div>;
    }

    return <SessionReplayTimeline sessionId={sessionId} items={items} />;
}
