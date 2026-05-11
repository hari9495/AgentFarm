'use client';

import { useEffect, useRef, useState } from 'react';

// ── Types — field names match SseTaskEvent from sse-tasks.ts exactly ──────────

type SseEventType =
    | 'task_queued'
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'task_cancelled'
    | 'heartbeat';

export type TaskEvent = {
    eventId: string;
    type: SseEventType;
    tenantId: string;
    workspaceId: string;
    taskId?: string;
    payload?: Record<string, unknown>;
    timestamp: string;
};

export type LiveTaskFeedProps = {
    workspaceId?: string;
    maxEvents?: number;
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<SseEventType, string> = {
    task_started:    '#2563eb', // blue
    task_queued:     '#d97706', // yellow/amber
    task_completed:  '#16a34a', // green
    task_failed:     '#dc2626', // red
    task_cancelled:  '#6b7280', // grey
    heartbeat:       '#6b7280', // grey
};

const STATUS_LABELS: Record<SseEventType, string> = {
    task_started:   'started',
    task_queued:    'queued',
    task_completed: 'completed',
    task_failed:    'failed',
    task_cancelled: 'cancelled',
    heartbeat:      'heartbeat',
};

function StatusBadge({ type }: { type: SseEventType }) {
    const color = STATUS_COLORS[type] ?? '#6b7280';
    const label = STATUS_LABELS[type] ?? type;
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: color,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            minWidth: 72,
            textAlign: 'center',
        }}>
            {label}
        </span>
    );
}

// ── Known event types that carry actual task data ─────────────────────────────
// The gateway emits named SSE events (event: task_queued etc.) so
// EventSource.onmessage does NOT fire for them — must use addEventListener.

const TASK_EVENT_TYPES: SseEventType[] = [
    'task_queued',
    'task_started',
    'task_completed',
    'task_failed',
    'task_cancelled',
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveTaskFeed({ workspaceId, maxEvents = 50 }: LiveTaskFeedProps) {
    const [events, setEvents] = useState<TaskEvent[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Keep a ref to the current maxEvents so the handler closure stays fresh
    const maxEventsRef = useRef(maxEvents);
    maxEventsRef.current = maxEvents;

    useEffect(() => {
        const url = new URL('/api/sse/tasks', window.location.origin);
        if (workspaceId) {
            url.searchParams.set('workspaceId', workspaceId);
        }

        const evtSource = new EventSource(url.toString());

        evtSource.onopen = () => {
            setConnected(true);
            setError(null);
        };

        evtSource.onerror = () => {
            setConnected(false);
            setError('Connection lost. Retrying...');
            // EventSource auto-reconnects — do not manually reconnect
        };

        // Handler shared by all task event types
        const handleTaskEvent = (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data as string) as TaskEvent;
                setEvents((prev) => [data, ...prev].slice(0, maxEventsRef.current));
            } catch {
                // malformed event — skip silently
            }
        };

        for (const type of TASK_EVENT_TYPES) {
            evtSource.addEventListener(type, handleTaskEvent as EventListener);
        }

        // Heartbeat: use to confirm connection is still alive
        evtSource.addEventListener('heartbeat', () => {
            setConnected(true);
        });

        return () => {
            for (const type of TASK_EVENT_TYPES) {
                evtSource.removeEventListener(type, handleTaskEvent as EventListener);
            }
            evtSource.close();
        };
    }, [workspaceId]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={{ fontFamily: 'inherit', fontSize: 14 }}>
            {/* Connection status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: connected ? '#16a34a' : '#dc2626',
                    display: 'inline-block',
                    flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, color: connected ? '#16a34a' : '#dc2626' }}>
                    {connected ? 'Live' : 'Reconnecting...'}
                </span>
                {events.length > 0 && (
                    <span style={{ color: '#6b7280', marginLeft: 8 }}>
                        {events.length} event{events.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Empty / error states */}
            {events.length === 0 && connected && (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    Waiting for task events...
                </p>
            )}
            {events.length === 0 && error && (
                <p style={{ color: '#dc2626' }}>{error}</p>
            )}

            {/* Event rows — newest first (already prepended) */}
            {events.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.map((evt) => (
                        <div
                            key={evt.eventId}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '8px 12px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                fontSize: 13,
                            }}
                        >
                            <StatusBadge type={evt.type} />
                            <span style={{ fontFamily: 'monospace', color: '#e2e8f0', minWidth: 96 }}>
                                {(evt.taskId ?? '—').slice(0, 12)}
                            </span>
                            <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {evt.workspaceId}
                            </span>
                            <span style={{ color: '#64748b', fontSize: 11, flexShrink: 0 }}>
                                {new Date(evt.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
