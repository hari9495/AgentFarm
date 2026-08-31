export const dynamic = 'force-dynamic'

import type { Metadata } from 'next';
import { StatusRefresher } from './StatusRefresher';

export const metadata: Metadata = {
    title: 'AgentFarms System Status — Real-Time Service Health',
    description: 'Real-time status and uptime for all AgentFarms services — API Gateway, Agent Runtime, and Trigger Service. Check current health and active incidents.',
};

type ServiceStatus = 'operational' | 'degraded' | 'outage';

type ServiceEntry = {
    name: string;
    status: ServiceStatus;
    latencyMs?: number;
};

type IncidentEntry = {
    id: string;
    title: string;
    severity: string;
    startedAt: string;
};

type StatusPayload = {
    status: ServiceStatus;
    updatedAt: string;
    services: ServiceEntry[];
    incidents: IncidentEntry[];
};

const STATUS_COLORS: Record<ServiceStatus, string> = {
    operational: 'bg-emerald-500',
    degraded: 'bg-amber-400',
    outage: 'bg-red-500',
};

const STATUS_TEXT: Record<ServiceStatus, string> = {
    operational: 'text-emerald-700',
    degraded: 'text-amber-700',
    outage: 'text-red-700',
};

const STATUS_BANNER_BG: Record<ServiceStatus, string> = {
    operational: 'bg-emerald-50 border-emerald-200',
    degraded: 'bg-amber-50 border-amber-200',
    outage: 'bg-red-50 border-red-200',
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
    operational: 'All systems operational',
    degraded: 'Partial service degradation',
    outage: 'Service outage in progress',
};

async function fetchStatus(): Promise<StatusPayload> {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    try {
        const res = await fetch(`${base}/status`, {
            next: { revalidate: 0 },
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as StatusPayload;
    } catch {
        return {
            status: 'outage',
            updatedAt: new Date().toISOString(),
            services: [],
            incidents: [],
        };
    }
}

export default async function StatusPage() {
    const data = await fetchStatus();
    const isUnknown = data.services.length === 0;
    const overallStatus: ServiceStatus = isUnknown ? 'outage' : data.status;
    const bannerLabel = isUnknown ? 'Unable to fetch status' : STATUS_LABEL[overallStatus];
    const lastUpdated = new Date(data.updatedAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    return (
        <main className="min-h-screen bg-[var(--op-paper)] text-[var(--op-ink)]">
            {/* Auto-refresh every 60s */}
            <StatusRefresher />

            {/* Header */}
            <section className="max-w-3xl mx-auto px-6 pt-20 pb-10">
                <p className="op-eyebrow mb-3">System status</p>
                <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.03em] text-[var(--op-ink)] mb-2">
                    System Status
                </h1>
                <p className="text-[var(--op-muted)] text-sm">
                    Last updated: <span className="text-[var(--op-ink-soft)]">{lastUpdated}</span>
                </p>
            </section>

            {/* Overall status banner */}
            <section className="max-w-3xl mx-auto px-6 mb-10">
                <div
                    className={`flex items-center gap-4 rounded-2xl border px-6 py-5 ${STATUS_BANNER_BG[overallStatus]}`}
                >
                    <span
                        className={`inline-block w-3.5 h-3.5 rounded-full flex-shrink-0 ${STATUS_COLORS[overallStatus]} ${overallStatus === 'operational' ? 'animate-pulse' : ''}`}
                    />
                    <span className={`text-lg font-semibold ${STATUS_TEXT[overallStatus]}`}>
                        {bannerLabel}
                    </span>
                </div>
            </section>

            {/* Services table */}
            <section className="max-w-3xl mx-auto px-6 mb-12">
                <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--op-muted)] mb-4">
                    Services
                </h2>

                {data.services.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--op-line)] bg-[var(--op-paper)] px-6 py-8 text-center text-[var(--op-muted)] text-sm">
                        Unable to retrieve service status.
                    </div>
                ) : (
                    <div className="rounded-2xl border border-[var(--op-line)] bg-[var(--op-paper)] overflow-hidden divide-y divide-[var(--op-line)]">
                        {data.services.map((svc) => (
                            <div
                                key={svc.name}
                                className="flex items-center justify-between px-6 py-4"
                            >
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[svc.status]}`}
                                    />
                                    <span className="text-sm font-medium text-[var(--op-ink)]">
                                        {svc.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    {svc.latencyMs !== undefined && (
                                        <span className="text-[var(--op-muted)] tabular-nums">
                                            {svc.latencyMs}ms
                                        </span>
                                    )}
                                    <span
                                        className={`font-semibold capitalize ${STATUS_TEXT[svc.status]}`}
                                    >
                                        {svc.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Incidents section */}
            <section className="max-w-3xl mx-auto px-6 mb-20">
                <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--op-muted)] mb-4">
                    Active Incidents
                </h2>

                {data.incidents.length === 0 ? (
                    <div className="rounded-2xl border border-[var(--op-line)] bg-[var(--op-paper)] px-6 py-8 text-center text-[var(--op-muted)] text-sm">
                        No incidents reported.
                    </div>
                ) : (
                    <div className="rounded-2xl border border-[var(--op-line)] bg-[var(--op-paper)] overflow-hidden divide-y divide-[var(--op-line)]">
                        {data.incidents.map((incident) => (
                            <div key={incident.id} className="px-6 py-4">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold text-[var(--op-ink)]">
                                        {incident.title}
                                    </span>
                                    <span className="text-xs uppercase tracking-wide font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                        {incident.severity}
                                    </span>
                                </div>
                                <p className="text-xs text-[var(--op-muted)]">
                                    Started{' '}
                                    {new Date(incident.startedAt).toLocaleString('en-US', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                    })}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
