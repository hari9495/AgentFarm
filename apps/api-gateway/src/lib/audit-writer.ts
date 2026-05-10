import type { PrismaClient } from '@prisma/client';

export type PrismaLike = Pick<PrismaClient, 'auditEvent'>;

/**
 * Write an audit record to the AuditEvent table.
 * Never throws — errors are swallowed and logged to stderr.
 * Callers may fire-and-forget (void) or await — both are safe.
 */
export async function writeAuditEvent(params: {
    prisma: PrismaLike;
    tenantId: string;
    workspaceId?: string;
    botId?: string;
    userId?: string;
    eventType: string;
    severity?: string;
    summary: string;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    try {
        // Map 'warning' → 'warn' to match the AuditSeverity enum (info, warn, error, critical)
        const severity = params.severity === 'warning' ? 'warn' : (params.severity ?? 'info');
        await params.prisma.auditEvent.create({
            data: {
                tenantId: params.tenantId,
                workspaceId: params.workspaceId ?? '',
                botId: params.botId ?? '',
                eventType: params.eventType as never,
                severity: severity as never,
                summary: params.summary,
                sourceSystem: 'api-gateway',
                correlationId: `audit_${Date.now()}`,
            },
        });
    } catch (err) {
        console.error('[audit-writer]', err);
    }
}
