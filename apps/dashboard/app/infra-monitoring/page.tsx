/**
 * Infrastructure Monitoring — per-customer Docker logs, container metrics, and
 * audit events from Axiom. Each customer runs their own VM + Docker stack; the
 * OpenTelemetry Collector on each VM stamps telemetry with tenant.id, so this
 * page can scope monitoring by customer. Data is read through the tenant-scoped
 * gateway proxy (/v1/observability/infra-logs) — the Axiom query token stays
 * server-side. VM host health (CPU/mem/uptime) lives in Azure Monitor.
 */

import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import { PageHeader } from '../components/page-header';
import { InfraMonitoringPanel } from '../components/infra-monitoring-panel';

export default async function InfraMonitoringPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/infra-monitoring');

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Platform Observability"
                title="Infrastructure Monitoring"
                description="Per-customer Docker container logs, container metrics, and audit events from Axiom. Filter by customer (tenant id). VM host health is in Azure Monitor."
            />
            <InfraMonitoringPanel />
        </main>
    );
}
