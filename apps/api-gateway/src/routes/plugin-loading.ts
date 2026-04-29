import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
    isTrustedPluginPublisher,
    isValidPluginManifest,
    verifyPluginManifestSignature,
    type ExternalPluginManifestContract,
    type TrustedPublisherRule,
} from '@agentfarm/connector-contracts';
import {
    CONTRACT_VERSIONS,
    type ExternalPluginLoadRecord,
    type PluginAuditEvent,
    type PluginCapabilityAllowlist,
    type PluginKillSwitchRecord,
} from '@agentfarm/shared-types';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type RegisterPluginLoadingRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    featureEnabled?: boolean;
    trustedPublishers?: TrustedPublisherRule[];
};

const buildAllowlistKey = (tenantId: string, workspaceId: string, pluginKey: string): string => {
    return `${tenantId}:${workspaceId}:${pluginKey}`;
};

const buildRejectedRecord = (
    tenantId: string,
    workspaceId: string,
    loadedBy: string,
    correlationId: string,
    rejectionReason: string,
    manifest?: ExternalPluginManifestContract,
    nowValue?: number,
): ExternalPluginLoadRecord => {
    return {
        id: randomUUID(),
        contractVersion: CONTRACT_VERSIONS.PLUGIN_LOADING,
        tenantId,
        workspaceId,
        pluginKey: manifest?.plugin_key ?? 'unknown_plugin',
        manifestVersion: manifest?.version ?? 'unknown',
        loadStatus: 'rejected',
        trustLevel: rejectionReason === 'untrusted_publisher' ? 'untrusted' : 'unknown',
        rejectionReason,
        loadedBy,
        correlationId,
        loadedAt: new Date(nowValue ?? Date.now()).toISOString(),
    };
};

export const registerPluginLoadingRoutes = async (
    app: FastifyInstance,
    options: RegisterPluginLoadingRoutesOptions,
): Promise<void> => {
    const pluginState = {
        allowlists: new Map<string, PluginCapabilityAllowlist>(),
        loadRecords: [] as ExternalPluginLoadRecord[],
        killSwitches: new Map<string, PluginKillSwitchRecord>(),
        auditEvents: [] as PluginAuditEvent[],
    };
    const now = options.now ?? (() => Date.now());
    const trustedPublishers = options.trustedPublishers ?? [];
    const featureEnabled = options.featureEnabled ?? false;

    app.post('/v1/plugins/allowlist/upsert', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const pluginKey = typeof body.plugin_key === 'string' ? body.plugin_key.trim() : '';
        const allowedCapabilities = Array.isArray(body.allowed_capabilities)
            ? body.allowed_capabilities.filter((item): item is string => typeof item === 'string')
            : [];

        if (!workspaceId || !pluginKey || allowedCapabilities.length === 0) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'workspace_id, plugin_key, and allowed_capabilities are required.',
            });
        }

        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation', message: 'workspace_id is not in your authenticated session scope.' });
        }

        const row: PluginCapabilityAllowlist = {
            tenantId: session.tenantId,
            workspaceId,
            pluginKey,
            allowedCapabilities,
            updatedBy: session.userId,
            updatedAt: new Date(now()).toISOString(),
        };

        pluginState.allowlists.set(buildAllowlistKey(session.tenantId, workspaceId, pluginKey), row);
        return reply.code(201).send({
            plugin_key: row.pluginKey,
            workspace_id: row.workspaceId,
            allowed_capabilities: row.allowedCapabilities,
            updated_at: row.updatedAt,
        });
    });

    app.post('/v1/plugins/load', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const rawManifest = body.manifest;
        const correlationId = typeof body.correlation_id === 'string' ? body.correlation_id : `plugin_load_${Math.floor(now())}`;

        if (!workspaceId || !rawManifest) {
            return reply.code(400).send({ error: 'invalid_request', message: 'workspace_id and manifest are required.' });
        }

        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation', message: 'workspace_id is not in your authenticated session scope.' });
        }

        if (!featureEnabled) {
            const rejected = buildRejectedRecord(session.tenantId, workspaceId, session.userId, correlationId, 'feature_flag_disabled', undefined, now());
            pluginState.loadRecords.push(rejected);
            return reply.code(409).send(rejected);
        }

        if (!isValidPluginManifest(rawManifest)) {
            const rejected = buildRejectedRecord(session.tenantId, workspaceId, session.userId, correlationId, 'invalid_manifest', undefined, now());
            pluginState.loadRecords.push(rejected);
            return reply.code(400).send(rejected);
        }

        const manifest = rawManifest as ExternalPluginManifestContract;
        if (!verifyPluginManifestSignature(manifest)) {
            const rejected = buildRejectedRecord(session.tenantId, workspaceId, session.userId, correlationId, 'invalid_signature', manifest, now());
            pluginState.loadRecords.push(rejected);
            return reply.code(400).send(rejected);
        }

        const killSwitch = pluginState.killSwitches.get(manifest.plugin_key);
        if (killSwitch?.status === 'active') {
            const rejected = buildRejectedRecord(
                session.tenantId,
                workspaceId,
                session.userId,
                correlationId,
                `plugin_disabled:${killSwitch.reason}`,
                manifest,
                now(),
            );
            pluginState.loadRecords.push(rejected);
            return reply.code(409).send(rejected);
        }

        const trusted = isTrustedPluginPublisher(manifest, trustedPublishers);
        if (!trusted) {
            const rejected = buildRejectedRecord(session.tenantId, workspaceId, session.userId, correlationId, 'untrusted_publisher', manifest, now());
            pluginState.loadRecords.push(rejected);
            return reply.code(403).send(rejected);
        }

        const allowlist = pluginState.allowlists.get(buildAllowlistKey(session.tenantId, workspaceId, manifest.plugin_key));
        if (!allowlist) {
            const rejected = buildRejectedRecord(session.tenantId, workspaceId, session.userId, correlationId, 'missing_allowlist', manifest, now());
            pluginState.loadRecords.push(rejected);
            return reply.code(403).send(rejected);
        }

        const disallowedCapabilities = manifest.capabilities.filter((item) => !allowlist.allowedCapabilities.includes(item));
        if (disallowedCapabilities.length > 0) {
            const rejected = buildRejectedRecord(
                session.tenantId,
                workspaceId,
                session.userId,
                correlationId,
                `capability_not_allowlisted:${disallowedCapabilities.join(',')}`,
                manifest,
                now(),
            );
            pluginState.loadRecords.push(rejected);
            return reply.code(403).send(rejected);
        }

        const loadedAt = new Date(now()).toISOString();
        const record: ExternalPluginLoadRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.PLUGIN_LOADING,
            tenantId: session.tenantId,
            workspaceId,
            pluginKey: manifest.plugin_key,
            manifestVersion: manifest.version,
            loadStatus: 'loaded',
            trustLevel: 'trusted',
            loadedBy: session.userId,
            correlationId,
            loadedAt,
        };

        pluginState.loadRecords.push(record);
        pluginState.auditEvents.push({
            pluginKey: manifest.plugin_key,
            tenantId: session.tenantId,
            workspaceId,
            eventType: 'plugin_load',
            message: 'Plugin loaded',
            correlationId,
            createdAt: loadedAt,
        });

        return reply.code(201).send(record);
    });

    app.post('/v1/plugins/:pluginKey/disable', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const params = request.params as { pluginKey: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'manual_kill_switch';
        const correlationId = typeof body.correlation_id === 'string' ? body.correlation_id : `plugin_disable_${Math.floor(now())}`;

        const record: PluginKillSwitchRecord = {
            pluginKey: params.pluginKey,
            status: 'active',
            reason,
            activatedBy: session.userId,
            activatedAt: new Date(now()).toISOString(),
            correlationId,
        };

        pluginState.killSwitches.set(params.pluginKey, record);
        pluginState.auditEvents.push({
            pluginKey: params.pluginKey,
            tenantId: session.tenantId,
            workspaceId: '*',
            eventType: 'plugin_disable',
            message: `Plugin disabled: ${reason}`,
            correlationId,
            createdAt: record.activatedAt,
        });

        return reply.code(200).send(record);
    });

    app.post('/v1/plugins/:pluginKey/enable', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const params = request.params as { pluginKey: string };
        const killSwitch = pluginState.killSwitches.get(params.pluginKey);
        if (!killSwitch) {
            return reply.code(404).send({ error: 'plugin_not_disabled', message: 'No active kill-switch exists for plugin.' });
        }

        killSwitch.status = 'resolved';
        killSwitch.resolvedAt = new Date(now()).toISOString();
        pluginState.auditEvents.push({
            pluginKey: params.pluginKey,
            tenantId: session.tenantId,
            workspaceId: '*',
            eventType: 'plugin_enable',
            message: 'Plugin re-enabled',
            correlationId: killSwitch.correlationId,
            createdAt: killSwitch.resolvedAt,
        });

        return reply.code(200).send(killSwitch);
    });

    app.get('/v1/plugins/status', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { workspace_id?: string };
        const workspaceId = typeof query.workspace_id === 'string' ? query.workspace_id.trim() : '';
        if (!workspaceId) {
            return reply.code(400).send({ error: 'invalid_request', message: 'workspace_id is required.' });
        }

        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation', message: 'workspace_id is not in your authenticated session scope.' });
        }

        const records = pluginState.loadRecords.filter(
            (row) => row.tenantId === session.tenantId && row.workspaceId === workspaceId,
        );

        return reply.code(200).send({
            workspace_id: workspaceId,
            feature_enabled: featureEnabled,
            load_records: records,
            kill_switches: Array.from(pluginState.killSwitches.values()),
        });
    });

    app.get('/v1/plugins/audit', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { plugin_key?: string };
        const pluginKey = typeof query.plugin_key === 'string' ? query.plugin_key.trim() : '';

        const events = pluginState.auditEvents.filter((event) => {
            if (event.tenantId !== session.tenantId) return false;
            if (pluginKey && event.pluginKey !== pluginKey) return false;
            return true;
        });

        return reply.code(200).send({ events });
    });
};
