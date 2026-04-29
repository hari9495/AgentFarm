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
import { ObservabilityEventStore } from '@agentfarm/observability';
import { randomUUID } from 'node:crypto';

export interface PluginLoaderOptions {
    trustedPublishers?: TrustedPublisherRule[];
    featureEnabled?: boolean;
    events?: ObservabilityEventStore;
    now?: () => number;
}

export interface PluginLoadRequest {
    tenantId: string;
    workspaceId: string;
    loadedBy: string;
    correlationId: string;
    manifest: unknown;
}

const buildAllowlistKey = (tenantId: string, workspaceId: string, pluginKey: string): string => {
    return `${tenantId}::${workspaceId}::${pluginKey}`;
};

export class ExternalPluginLoader {
    private allowlists = new Map<string, PluginCapabilityAllowlist>();
    private loadRecords: ExternalPluginLoadRecord[] = [];
    private killSwitches = new Map<string, PluginKillSwitchRecord>();
    private auditEvents: PluginAuditEvent[] = [];
    private trustedPublishers: TrustedPublisherRule[];
    private featureEnabled: boolean;
    private events: ObservabilityEventStore;
    private now: () => number;

    constructor(options: PluginLoaderOptions = {}) {
        this.trustedPublishers = options.trustedPublishers ?? [];
        this.featureEnabled = options.featureEnabled ?? false;
        this.events = options.events ?? new ObservabilityEventStore();
        this.now = options.now ?? (() => Date.now());
    }

    setFeatureEnabled(value: boolean): void {
        this.featureEnabled = value;
    }

    setTrustedPublishers(rules: TrustedPublisherRule[]): void {
        this.trustedPublishers = [...rules];
    }

    upsertAllowlist(allowlist: Omit<PluginCapabilityAllowlist, 'updatedAt'>): PluginCapabilityAllowlist {
        const row: PluginCapabilityAllowlist = {
            ...allowlist,
            updatedAt: new Date(this.now()).toISOString(),
        };

        this.allowlists.set(buildAllowlistKey(row.tenantId, row.workspaceId, row.pluginKey), row);
        return row;
    }

    loadPlugin(request: PluginLoadRequest): ExternalPluginLoadRecord {
        if (!this.featureEnabled) {
            return this.buildRejectedRecord(request, 'feature_flag_disabled');
        }

        if (!isValidPluginManifest(request.manifest)) {
            return this.buildRejectedRecord(request, 'invalid_manifest');
        }

        const manifest = request.manifest as ExternalPluginManifestContract;
        if (!verifyPluginManifestSignature(manifest)) {
            return this.buildRejectedRecord(request, 'invalid_signature', manifest);
        }

        const activeSwitch = this.killSwitches.get(manifest.plugin_key);
        if (activeSwitch?.status === 'active') {
            return this.buildRejectedRecord(request, `plugin_disabled:${activeSwitch.reason}`, manifest);
        }

        const trusted = isTrustedPluginPublisher(manifest, this.trustedPublishers);
        if (!trusted) {
            return this.buildRejectedRecord(request, 'untrusted_publisher', manifest);
        }

        const allowlist = this.allowlists.get(buildAllowlistKey(request.tenantId, request.workspaceId, manifest.plugin_key));
        if (!allowlist) {
            return this.buildRejectedRecord(request, 'missing_allowlist', manifest);
        }

        const disallowedCapabilities = manifest.capabilities.filter((item) => !allowlist.allowedCapabilities.includes(item));
        if (disallowedCapabilities.length > 0) {
            return this.buildRejectedRecord(
                request,
                `capability_not_allowlisted:${disallowedCapabilities.join(',')}`,
                manifest,
            );
        }

        const loadedAt = new Date(this.now()).toISOString();
        const record: ExternalPluginLoadRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.PLUGIN_LOADING,
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            pluginKey: manifest.plugin_key,
            manifestVersion: manifest.version,
            loadStatus: 'loaded',
            trustLevel: 'trusted',
            loadedBy: request.loadedBy,
            correlationId: request.correlationId,
            loadedAt,
        };

        this.loadRecords.push(record);
        this.emitAudit(request.tenantId, request.workspaceId, manifest.plugin_key, 'plugin_load', 'Plugin loaded', request.correlationId);
        return record;
    }

    disablePluginGlobally(pluginKey: string, activatedBy: string, reason: string, correlationId: string): PluginKillSwitchRecord {
        const killSwitch: PluginKillSwitchRecord = {
            pluginKey,
            status: 'active',
            reason,
            activatedBy,
            activatedAt: new Date(this.now()).toISOString(),
            correlationId,
        };
        this.killSwitches.set(pluginKey, killSwitch);

        this.emitAudit('*', '*', pluginKey, 'plugin_disable', `Plugin disabled: ${reason}`, correlationId);
        return killSwitch;
    }

    enablePluginGlobally(pluginKey: string, correlationId: string): PluginKillSwitchRecord | undefined {
        const killSwitch = this.killSwitches.get(pluginKey);
        if (!killSwitch) {
            return undefined;
        }

        killSwitch.status = 'resolved';
        killSwitch.resolvedAt = new Date(this.now()).toISOString();
        this.emitAudit('*', '*', pluginKey, 'plugin_enable', 'Plugin re-enabled', correlationId);
        return killSwitch;
    }

    listLoadRecords(tenantId?: string, workspaceId?: string): ExternalPluginLoadRecord[] {
        return this.loadRecords.filter((row) => {
            if (tenantId && row.tenantId !== tenantId) return false;
            if (workspaceId && row.workspaceId !== workspaceId) return false;
            return true;
        });
    }

    listKillSwitches(): PluginKillSwitchRecord[] {
        return Array.from(this.killSwitches.values());
    }

    listAuditEvents(pluginKey?: string): PluginAuditEvent[] {
        if (!pluginKey) {
            return [...this.auditEvents];
        }
        return this.auditEvents.filter((event) => event.pluginKey === pluginKey);
    }

    private buildRejectedRecord(
        request: PluginLoadRequest,
        reason: string,
        manifest?: ExternalPluginManifestContract,
    ): ExternalPluginLoadRecord {
        const loadedAt = new Date(this.now()).toISOString();
        const pluginKey = manifest?.plugin_key ?? 'unknown_plugin';
        const record: ExternalPluginLoadRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.PLUGIN_LOADING,
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            pluginKey,
            manifestVersion: manifest?.version ?? 'unknown',
            loadStatus: 'rejected',
            trustLevel: reason === 'untrusted_publisher' ? 'untrusted' : 'unknown',
            rejectionReason: reason,
            loadedBy: request.loadedBy,
            correlationId: request.correlationId,
            loadedAt,
        };

        this.loadRecords.push(record);
        this.emitAudit(request.tenantId, request.workspaceId, pluginKey, 'plugin_reject', `Plugin rejected: ${reason}`, request.correlationId);
        return record;
    }

    private emitAudit(
        tenantId: string,
        workspaceId: string,
        pluginKey: string,
        eventType: PluginAuditEvent['eventType'],
        message: string,
        correlationId: string,
    ): void {
        const createdAt = new Date(this.now()).toISOString();
        const event: PluginAuditEvent = {
            pluginKey,
            tenantId,
            workspaceId,
            eventType,
            message,
            correlationId,
            createdAt,
        };

        this.auditEvents.push(event);
        this.events.emit({
            source: 'connector-gateway.plugin-loader',
            eventType,
            severity: eventType === 'plugin_reject' ? 'warn' : 'info',
            message,
            correlationId,
            metadata: {
                pluginKey,
                tenantId,
                workspaceId,
            },
        });
    }
}
