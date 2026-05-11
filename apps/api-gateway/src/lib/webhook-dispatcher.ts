import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export async function dispatchOutboundWebhooks(
    event: {
        tenantId: string;
        workspaceId: string;
        eventType: string;
        taskId?: string;
        payload?: unknown;
        timestamp: string;
    },
    prisma: PrismaClient,
): Promise<void> {
    const webhooks = await prisma.outboundWebhook.findMany({
        where: {
            tenantId: event.tenantId,
            enabled: true,
        },
        select: { id: true, url: true, secret: true, events: true, workspaceId: true },
    });

    const matching = webhooks.filter(
        (w) =>
            w.events.includes(event.eventType) &&
            (w.workspaceId == null || w.workspaceId === event.workspaceId),
    );

    await Promise.allSettled(matching.map((w) => fireWebhook(w, event, prisma)));
}

async function fireWebhook(
    webhook: { id: string; url: string; secret: string },
    event: {
        tenantId: string;
        eventType: string;
        taskId?: string;
        payload?: unknown;
        timestamp: string;
    },
    prisma: PrismaClient,
): Promise<void> {
    const body = JSON.stringify({
        eventType: event.eventType,
        tenantId: event.tenantId,
        taskId: event.taskId ?? null,
        payload: event.payload ?? null,
        timestamp: event.timestamp,
    });

    const sig = createHmac('sha256', webhook.secret).update(body).digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const startMs = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
        const res = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-AgentFarm-Signature': `sha256=${sig}`,
                'X-AgentFarm-Event': event.eventType,
            },
            body,
            signal: controller.signal,
        });
        responseStatus = res.status;
        responseBody = await res.text().catch(() => null);
        success = res.ok;
    } catch {
        success = false;
    } finally {
        clearTimeout(timeout);
    }

    prisma.outboundWebhookDelivery
        .create({
            data: {
                webhookId: webhook.id,
                tenantId: event.tenantId,
                eventType: event.eventType,
                payload: JSON.parse(body),
                responseStatus,
                responseBody: responseBody?.slice(0, 1000) ?? null,
                durationMs: Date.now() - startMs,
                success,
            },
        })
        .catch((err) => console.error('[webhook-dispatcher] delivery log failed', err));
}
