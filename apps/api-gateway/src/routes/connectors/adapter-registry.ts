/**
 * Epic B1A: Adapter Registry Routes (Server + Dashboard Surface)
 *
 * POST   /v1/adapters                  — Register an adapter (tenant-scoped)
 * GET    /v1/adapters                  — List adapters (filterable by type, status, workspace_id)
 * GET    /v1/adapters/discover         — Capability discovery endpoint for orchestrator/runtime lookups
 * GET    /v1/adapters/:id             — Get adapter details
 * POST   /v1/adapters/:id/health-check — Trigger health check and update status
 * DELETE /v1/adapters/:id             — Deregister adapter (soft delete)
 *
 * Registry operations are audit-logged and tenant-scoped where applicable.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
    type AdapterRegistryRecord,
    type AdapterType,
    type AdapterCapability,
} from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type RegisterAdapterRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    store?: AdapterRegistryStore;
};

export type AdapterAuditEntry = {
    action: 'register' | 'unregister' | 'health_check';
    adapterId: string;
    tenantId?: string;
    actorId: string;
    timestamp: string;
    correlationId: string;
};

// ── In-memory store ──────────────────────────────────────────────────────────

export class AdapterRegistryStore {
    private byId = new Map<string, AdapterRegistryRecord>();
    private byKey = new Map<string, AdapterRegistryRecord>();
    readonly auditLog: AdapterAuditEntry[] = [];

    register(
        req: {
            adapterKey: string;
            adapterType: AdapterType;
            displayName: string;
            version: string;
            capabilities: AdapterCapability[];
            tenantId?: string;
            workspaceId?: string;
            correlationId: string;
        },
        actorId: string,
    ): AdapterRegistryRecord {
        if (this.byKey.has(req.adapterKey)) {
            const existing = this.byKey.get(req.adapterKey)!;
            throw new Error(`Adapter key '${req.adapterKey}' already registered: ${existing.id}`);
        }

        const now = new Date().toISOString();
        const record: AdapterRegistryRecord = {
            id: randomUUID(),
            adapterId: randomUUID(),
            adapterType: req.adapterType,
            adapterKey: req.adapterKey,
            displayName: req.displayName,
            status: 'registered',
            version: req.version,
            tenantId: req.tenantId,
            workspaceId: req.workspaceId,
            capabilities: req.capabilities,
            registeredAt: now,
            updatedAt: now,
            correlationId: req.correlationId,
        };

        this.byId.set(record.id, record);
        this.byKey.set(req.adapterKey, record);

        this.auditLog.push({
            action: 'register',
            adapterId: record.id,
            tenantId: req.tenantId,
            actorId,
            timestamp: now,
            correlationId: req.correlationId,
        });

        return record;
    }

    get(id: string): AdapterRegistryRecord | undefined {
        return this.byId.get(id);
    }

    getByKey(adapterKey: string): AdapterRegistryRecord | undefined {
        return this.byKey.get(adapterKey);
    }

    list(filter?: { adapterType?: string; status?: string; tenantId?: string; workspaceId?: string }): AdapterRegistryRecord[] {
        const results: AdapterRegistryRecord[] = [];
        for (const record of this.byId.values()) {
            if (record.status === 'unregistered') continue;
            if (filter?.adapterType && record.adapterType !== filter.adapterType) continue;
            if (filter?.status && record.status !== filter.status) continue;
            if (filter?.tenantId && record.tenantId !== filter.tenantId) continue;
            if (filter?.workspaceId && record.workspaceId !== filter.workspaceId) continue;
            results.push(record);
        }
        return results;
    }

    healthCheck(id: string, actorId: string, correlationId: string): AdapterRegistryRecord {
        const record = this.byId.get(id);
        if (!record) throw new Error(`Adapter not found: ${id}`);

        const now = new Date().toISOString();
        record.status = 'healthy';
        record.lastHealthcheckAt = now;
        record.lastHealthcheckResult = 'OK';
        record.updatedAt = now;

        this.auditLog.push({ action: 'health_check', adapterId: id, tenantId: record.tenantId, actorId, timestamp: now, correlationId });
        return record;
    }

    unregister(id: string, actorId: string, correlationId: string): void {
        const record = this.byId.get(id);
        if (!record) throw new Error(`Adapter not found: ${id}`);

        const now = new Date().toISOString();
        record.status = 'unregistered';
        record.updatedAt = now;

        this.auditLog.push({ action: 'unregister', adapterId: id, tenantId: record.tenantId, actorId, timestamp: now, correlationId });
    }
}

// Module-level default store (shared across requests within the process)
const defaultStore = new AdapterRegistryStore();

const VALID_ADAPTER_TYPES = new Set<AdapterType>(['connector', 'runtime', 'provider']);

// ── Route registration ───────────────────────────────────────────────────────

export function registerAdapterRegistryRoutes(
    app: FastifyInstance,
    options?: RegisterAdapterRoutesOptions,
): void {
    const store = options?.store ?? defaultStore;
    const getSession = options?.getSession ?? (() => null);

    type AdapterParams = { id: string };
    type RegisterBody = {
        adapter_key?: string;
        adapter_type?: string;
        display_name?: string;
        version?: string;
        capabilities?: AdapterCapability[];
        tenant_id?: string;
        workspace_id?: string;
        correlation_id?: string;
    };

    // ── POST /v1/adapters — Register ─────────────────────────────────────────
    app.post<{ Body: RegisterBody }>(
        '/v1/adapters',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const body = request.body ?? {};
            const adapterKey = body.adapter_key?.trim() ?? '';
            const adapterType = body.adapter_type?.trim() ?? '';
            const displayName = body.display_name?.trim() ?? '';
            const version = body.version?.trim() ?? '';

            if (!adapterKey || !adapterType || !displayName || !version) {
                return reply.code(400).send({ error: 'adapter_key, adapter_type, display_name, and version are required' });
            }
            if (!VALID_ADAPTER_TYPES.has(adapterType as AdapterType)) {
                return reply.code(400).send({ error: `adapter_type must be one of: ${[...VALID_ADAPTER_TYPES].join(', ')}` });
            }

            // Tenant scoping: use explicit tenant_id or session tenant
            const tenantId = body.tenant_id?.trim() || session.tenantId;
            const workspaceId = body.workspace_id?.trim() || undefined;
            if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({ error: 'workspace_id not in session scope' });
            }

            try {
                const record = store.register({
                    adapterKey,
                    adapterType: adapterType as AdapterType,
                    displayName,
                    version,
                    capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
                    tenantId,
                    workspaceId,
                    correlationId: body.correlation_id?.trim() || randomUUID(),
                }, session.userId);

                return reply.code(201).send(record);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return reply.code(409).send({ error: 'conflict', message });
            }
        },
    );

    // ── GET /v1/adapters — List ───────────────────────────────────────────────
    app.get('/v1/adapters', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const query = request.query as { adapter_type?: string; status?: string; workspace_id?: string };
        const workspaceId = query.workspace_id?.trim() ?? '';
        if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_id not in session scope' });
        }

        const adapters = store.list({
            adapterType: query.adapter_type?.trim() || undefined,
            status: query.status?.trim() || undefined,
            tenantId: session.tenantId,
            workspaceId: workspaceId || undefined,
        });

        return reply.send({ adapters, total: adapters.length });
    });

    // ── GET /v1/adapters/discover — Capability discovery (orchestrator/runtime) ──
    app.get('/v1/adapters/discover', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const query = request.query as { adapter_key?: string; adapter_type?: string; workspace_id?: string };

        // Key-based lookup (for orchestrator registry key resolution)
        if (query.adapter_key?.trim()) {
            const record = store.getByKey(query.adapter_key.trim());
            if (!record || record.status === 'unregistered') {
                return reply.code(404).send({ error: 'adapter_not_found', adapter_key: query.adapter_key });
            }
            return reply.send({
                adapter_id: record.id,
                adapter_key: record.adapterKey,
                adapter_type: record.adapterType,
                display_name: record.displayName,
                status: record.status,
                capabilities: record.capabilities,
            });
        }

        // Filter-based capability discovery
        const adapters = store.list({
            adapterType: query.adapter_type?.trim() || undefined,
            tenantId: session.tenantId,
        });

        return reply.send({
            adapters: adapters.map((a) => ({
                adapter_id: a.id,
                adapter_key: a.adapterKey,
                adapter_type: a.adapterType,
                display_name: a.displayName,
                status: a.status,
                capabilities: a.capabilities,
            })),
            total: adapters.length,
        });
    });

    // ── GET /v1/adapters/:id — Get details ───────────────────────────────────
    app.get<{ Params: AdapterParams }>(
        '/v1/adapters/:id',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const record = store.get(request.params.id);
            if (!record || record.status === 'unregistered') {
                return reply.code(404).send({ error: 'not_found' });
            }
            // Tenant isolation
            if (record.tenantId && record.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'tenant_scope_violation' });
            }

            return reply.send(record);
        },
    );

    // ── POST /v1/adapters/:id/health-check ───────────────────────────────────
    app.post<{ Params: AdapterParams }>(
        '/v1/adapters/:id/health-check',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            try {
                const record = store.healthCheck(request.params.id, session.userId, randomUUID());
                if (record.tenantId && record.tenantId !== session.tenantId) {
                    return reply.code(403).send({ error: 'tenant_scope_violation' });
                }
                return reply.send({
                    adapter_id: record.id,
                    status: record.status,
                    last_healthcheck_at: record.lastHealthcheckAt,
                    last_healthcheck_result: record.lastHealthcheckResult,
                    updated_at: record.updatedAt,
                });
            } catch {
                return reply.code(404).send({ error: 'not_found' });
            }
        },
    );

    // ── DELETE /v1/adapters/:id — Deregister ─────────────────────────────────
    app.delete<{ Params: AdapterParams }>(
        '/v1/adapters/:id',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const record = store.get(request.params.id);
            if (!record) return reply.code(404).send({ error: 'not_found' });
            if (record.tenantId && record.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'tenant_scope_violation' });
            }

            store.unregister(request.params.id, session.userId, randomUUID());
            return reply.code(204).send();
        },
    );
}
