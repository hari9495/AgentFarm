/**
 * axiom-audit-mirror.ts — best-effort mirror of audit events to an Axiom
 * dataset for long-term, searchable forensic audit logs.
 *
 * The DB (AuditEvent) stays the system of record; this is an additional sink.
 * Each event carries tenantId so audit logs are filterable per customer in
 * Axiom (important for the per-customer-VM model). Never throws; no-op when
 * AXIOM_TOKEN is unset.
 */

export type AxiomAuditEvent = {
    tenantId: string;
    workspaceId?: string;
    botId?: string;
    userId?: string;
    eventType: string;
    severity: string;
    summary: string;
    sourceSystem: string;
    correlationId: string;
};

type AxiomConfig = { url: string; token: string; dataset: string };

const resolveAxiomConfig = (env: NodeJS.ProcessEnv): AxiomConfig | null => {
    const token = env['AXIOM_TOKEN']?.trim();
    if (!token) return null;
    const url = (env['AXIOM_URL']?.trim() || 'https://api.axiom.co').replace(/\/+$/, '');
    const dataset = env['AXIOM_DATASET_AUDIT']?.trim() || 'axiom-audit';
    return { url, token, dataset };
};

/**
 * Send one audit event to Axiom. Injectable fetch + env for tests. Resolves to
 * true on success, false on no-op/failure — but never throws.
 */
export async function mirrorAuditEventToAxiom(
    event: AxiomAuditEvent,
    deps?: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv },
): Promise<boolean> {
    const env = deps?.env ?? process.env;
    const fetchImpl = deps?.fetchImpl ?? fetch;
    const cfg = resolveAxiomConfig(env);
    if (!cfg) return false;

    try {
        const body = [{
            _time: new Date().toISOString(),
            // VM/customer attribution — dot-free so it stays a flat, queryable
            // APL field (a dotted "tenant.id" is treated as nested by Axiom).
            // The collector stamps the same tenant_id on container telemetry.
            tenant_id: event.tenantId,
            tenantId: event.tenantId,
            workspaceId: event.workspaceId ?? '',
            botId: event.botId ?? '',
            userId: event.userId ?? '',
            eventType: event.eventType,
            severity: event.severity,
            summary: event.summary,
            sourceSystem: event.sourceSystem,
            correlationId: event.correlationId,
        }];

        const res = await fetchImpl(`${cfg.url}/v1/datasets/${encodeURIComponent(cfg.dataset)}/ingest`, {
            method: 'POST',
            headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5_000),
        });
        return res.ok;
    } catch {
        // mirror is best-effort — audit is already in the DB
        return false;
    }
}
