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
        const correlationId = `audit_${Date.now()}`;
        await params.prisma.auditEvent.create({
            data: {
                tenantId: params.tenantId,
                workspaceId: params.workspaceId ?? '',
                botId: params.botId ?? '',
                eventType: params.eventType as never,
                severity: severity as never,
                summary: params.summary,
                sourceSystem: 'api-gateway',
                correlationId,
            },
        });

        // Azure Blob upload — only fires when connection string is configured
        if (process.env['AZURE_BLOB_CONNECTION_STRING'] && process.env['AZURE_BLOB_CONTAINER_NAME']) {
            try {
                const { BlobServiceClient } = await import('@azure/storage-blob');
                const blobServiceClient = BlobServiceClient.fromConnectionString(
                    process.env['AZURE_BLOB_CONNECTION_STRING'],
                );
                const containerClient = blobServiceClient.getContainerClient(
                    process.env['AZURE_BLOB_CONTAINER_NAME'],
                );
                const blobName = `audit/${correlationId}.json`;
                const content = JSON.stringify({
                    tenantId: params.tenantId,
                    workspaceId: params.workspaceId,
                    botId: params.botId,
                    eventType: params.eventType,
                    severity,
                    summary: params.summary,
                    correlationId,
                });
                await containerClient
                    .getBlockBlobClient(blobName)
                    .upload(content, Buffer.byteLength(content), {
                        blobHTTPHeaders: { blobContentType: 'application/json' },
                    });
            } catch (blobErr) {
                // Blob upload is best-effort — audit is already stored in DB
                console.error('[audit-writer] Azure Blob upload failed — audit stored in DB, Blob skipped:', blobErr);
            }
        }
    } catch (err) {
        console.error('[audit-writer]', err);
    }
}
