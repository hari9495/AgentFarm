import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const DLQ_THRESHOLD = 5;

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
        select: { id: true, url: true, secret: true, events: true, workspaceId: true, failureCount: true },
    });

    const matching = webhooks.filter(
        (w) =>
            w.events.includes(event.eventType) &&
            (w.workspaceId == null || w.workspaceId === event.workspaceId),
    );

    await Promise.allSettled(
        matching.map(async (w) => {
            const result = await fireWebhook(w, event, prisma);
            if (result.success) {
                await prisma.outboundWebhook.update({
                    where: { id: w.id },
                    data: { failureCount: 0 },
                });
            } else {
                await prisma.outboundWebhook.update({
                    where: { id: w.id },
                    data: { failureCount: { increment: 1 } },
                });
                const updated = await prisma.outboundWebhook.findUnique({
                    where: { id: w.id },
                    select: { failureCount: true },
                });
                if ((updated?.failureCount ?? 0) >= DLQ_THRESHOLD) {
                    await prisma.outboundWebhook.update({
                        where: { id: w.id },
                        data: { enabled: false, dlqAt: new Date() },
                    });
                    await prisma.webhookDlqEntry.create({
                        data: {
                            webhookId: w.id,
                            tenantId: event.tenantId,
                            reason: `${DLQ_THRESHOLD} consecutive failures`,
                            lastPayload: (event.payload ?? {}) as object,
                            lastEventType: event.eventType,
                        },
                    });
                }
            }
        }),
    );
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
): Promise<{ success: boolean; responseStatus: number | null }> {
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

    return { success, responseStatus };
}

export async function replayDelivery(
    deliveryId: string,
    tenantId: string,
    prisma: PrismaClient,
): Promise<{ success: boolean; status?: number }> {
    const delivery = await prisma.outboundWebhookDelivery.findFirst({
        where: { id: deliveryId, tenantId },
    });
    if (!delivery) {
        throw new Error('delivery not found');
    }

    const webhook = await prisma.outboundWebhook.findUnique({
        where: { id: delivery.webhookId },
    });
    if (!webhook) {
        throw new Error('delivery not found');
    }

    const storedPayload = delivery.payload as Record<string, unknown>;
    const result = await fireWebhook(
        { id: webhook.id, url: webhook.url, secret: webhook.secret },
        {
            tenantId,
            eventType: delivery.eventType,
            taskId: typeof storedPayload['taskId'] === 'string' ? storedPayload['taskId'] : undefined,
            payload: storedPayload['payload'],
            timestamp:
                typeof storedPayload['timestamp'] === 'string'
                    ? storedPayload['timestamp']
                    : new Date().toISOString(),
        },
        prisma,
    );

    return { success: result.success, status: result.responseStatus ?? undefined };
}
