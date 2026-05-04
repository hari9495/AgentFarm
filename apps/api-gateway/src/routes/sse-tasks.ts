/**
 * Feature #3: Async SSE Task Queue + Auto-Recovery
 *
 * Provides a server-sent events stream for task progress updates.
 * Supports auto-recovery via Last-Event-ID header — reconnecting clients
 * receive all buffered events they missed since their last known event ID.
 *
 * Architecture:
 *   SseTaskQueue (pure, no I/O) — in-process ring buffer per channel key
 *   registerSseTaskRoutes       — wires the queue into a Fastify instance
 */

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// ── Event model ───────────────────────────────────────────────────────────────

export type SseEventType =
    | 'task_queued'
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'task_cancelled'
    | 'heartbeat';

export interface SseTaskEvent {
    /** Globally unique, monotonically increasing ID within the channel. */
    eventId: string;
    type: SseEventType;
    tenantId: string;
    workspaceId: string;
    taskId?: string;
    payload?: Record<string, unknown>;
    timestamp: string;
}

// ── Ring buffer ───────────────────────────────────────────────────────────────

export const SSE_BUFFER_SIZE = 200;

/**
 * In-process event buffer shared per (tenantId, workspaceId) channel.
 * Keeps the last SSE_BUFFER_SIZE events so reconnecting clients can replay
 * events they missed during a transient disconnection.
 */
export class SseTaskQueue {
    private buffer: SseTaskEvent[] = [];
    /** Monotonically increasing sequence number — never resets, survives reconnects. */
    private seq = 0;
    private readonly maxSize: number;

    constructor(maxSize = SSE_BUFFER_SIZE) {
        this.maxSize = maxSize;
    }

    /**
     * Push a new event into the ring buffer.
     * Returns the event with an assigned eventId.
     */
    push(partial: Omit<SseTaskEvent, 'eventId' | 'timestamp'>): SseTaskEvent {
        this.seq += 1;
        const event: SseTaskEvent = {
            ...partial,
            eventId: String(this.seq),
            timestamp: new Date().toISOString(),
        };
        this.buffer.push(event);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
        return event;
    }

    /**
     * Returns all events with eventId > lastEventId (exclusive).
     * Passing null or undefined returns the entire buffer (initial connect).
     * Enables auto-recovery: reconnecting clients supply Last-Event-ID header.
     */
    sliceSince(lastEventId: string | null | undefined): SseTaskEvent[] {
        if (!lastEventId) return [...this.buffer];
        const last = Number(lastEventId);
        if (isNaN(last)) return [...this.buffer];
        return this.buffer.filter((e) => Number(e.eventId) > last);
    }

    /** Current buffer length (for testing). */
    size(): number {
        return this.buffer.length;
    }

    /** Current sequence counter (for testing). */
    currentSeq(): number {
        return this.seq;
    }
}

// ── Channel map ───────────────────────────────────────────────────────────────

/** Global map of channel key → queue (one per tenant+workspace). */
export const sseQueues = new Map<string, SseTaskQueue>();

export function channelKey(tenantId: string, workspaceId: string): string {
    return `${tenantId}::${workspaceId}`;
}

export function getOrCreateQueue(tenantId: string, workspaceId: string): SseTaskQueue {
    const key = channelKey(tenantId, workspaceId);
    let q = sseQueues.get(key);
    if (!q) {
        q = new SseTaskQueue();
        sseQueues.set(key, q);
    }
    return q;
}

// ── Fastify SSE format helper ─────────────────────────────────────────────────

export function formatSseEvent(event: SseTaskEvent): string {
    const lines: string[] = [
        `id: ${event.eventId}`,
        `event: ${event.type}`,
        `data: ${JSON.stringify(event)}`,
        '', // blank line terminates the SSE event
        '',
    ];
    return lines.join('\n');
}

// ── Route dependencies ────────────────────────────────────────────────────────

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export interface SseTaskRouteDeps {
    getSession: (req: FastifyRequest) => SessionContext | null;
    /** Override for testing — allows injecting a pre-populated queue. */
    getQueue?: (tenantId: string, workspaceId: string) => SseTaskQueue;
}

// ── Route registration ────────────────────────────────────────────────────────

/**
 * Registers GET /sse/tasks endpoint.
 *
 * Query params:
 *   workspaceId — required
 *
 * Headers:
 *   Last-Event-ID — optional; resumes event stream from that point
 *
 * The connection is kept open with periodic heartbeat events every 25 s.
 * When the client disconnects the connection cleanup runs automatically
 * via Node's 'close' event on the underlying socket.
 */
export async function registerSseTaskRoutes(
    app: FastifyInstance,
    deps: SseTaskRouteDeps,
): Promise<void> {
    const resolveQueue = deps.getQueue ?? getOrCreateQueue;

    app.get<{ Querystring: { workspaceId?: string } }>(
        '/sse/tasks',
        async (req, reply) => {
            const session = deps.getSession(req);
            if (!session || session.expiresAt < Date.now()) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const workspaceId = req.query.workspaceId;
            if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({ error: 'Workspace access denied' });
            }

            const lastEventId = (req.headers['last-event-id'] as string | undefined) ?? null;
            const queue = resolveQueue(session.tenantId, workspaceId);
            const missed = queue.sliceSince(lastEventId);

            reply.raw.setHeader('Content-Type', 'text/event-stream');
            reply.raw.setHeader('Cache-Control', 'no-cache');
            reply.raw.setHeader('Connection', 'keep-alive');
            reply.raw.setHeader('X-Accel-Buffering', 'no');
            reply.raw.flushHeaders();

            // Replay missed events immediately on (re)connect
            for (const evt of missed) {
                reply.raw.write(formatSseEvent(evt));
            }

            // Heartbeat to keep the connection alive and prevent proxy timeouts
            const heartbeat = setInterval(() => {
                const hb = queue.push({
                    type: 'heartbeat',
                    tenantId: session.tenantId,
                    workspaceId,
                });
                reply.raw.write(formatSseEvent(hb));
            }, 25_000);

            req.socket.on('close', () => {
                clearInterval(heartbeat);
            });

            // Keep Fastify from closing the reply automatically
            await new Promise<void>((resolve) => {
                req.socket.on('close', resolve);
            });
        },
    );

    /**
     * Internal POST /sse/tasks/push — allows services to emit task events.
     * In production this would be behind an internal-only auth check.
     */
    app.post<{
        Body: { tenantId: string; workspaceId: string; type: SseEventType; taskId?: string; payload?: Record<string, unknown> };
    }>(
        '/sse/tasks/push',
        async (req, reply) => {
            const { tenantId, workspaceId, type, taskId, payload } = req.body ?? {};
            if (!tenantId || !workspaceId || !type) {
                return reply.code(400).send({ error: 'tenantId, workspaceId, and type are required' });
            }
            const queue = resolveQueue(tenantId, workspaceId);
            const event = queue.push({ type, tenantId, workspaceId, taskId, payload });
            return reply.code(200).send({ eventId: event.eventId });
        },
    );
}
