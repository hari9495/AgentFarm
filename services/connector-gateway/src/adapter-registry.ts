/**
 * Epic B1A: Adapter Registry (Server + Dashboard Surface)
 * Introduces registry-driven adapter management for runtimes/connectors.
 * 
 * Operations: register, unregister, discover, health-check
 * Registry is audit-logged and tenant-scoped where applicable
 */

import type { AdapterRegistryRecord, AdapterType, AdapterStatus, AdapterCapability } from '@agentfarm/shared-types';
import { randomUUID } from 'crypto';

export interface RegisterAdapterRequest {
    adapterType: AdapterType;
    adapterKey: string;
    displayName: string;
    version: string;
    capabilities: AdapterCapability[];
    tenantId?: string;
    workspaceId?: string;
    correlationId: string;
}

export interface DiscoverAdaptersFilter {
    adapterType?: AdapterType;
    status?: AdapterStatus;
    tenantId?: string;
    workspaceId?: string;
}

export class AdapterRegistry {
    private adapters = new Map<string, AdapterRegistryRecord>();
    private adaptersByKey = new Map<string, AdapterRegistryRecord>();
    private auditLog: Array<{ action: string; adapterId: string; timestamp: string; correlationId: string }> = [];

    /**
     * Register a new adapter
     */
    async registerAdapter(request: RegisterAdapterRequest): Promise<AdapterRegistryRecord> {
        // Check for duplicate registration
        const existing = this.adaptersByKey.get(request.adapterKey);
        if (existing) {
            throw new Error(`Adapter with key '${request.adapterKey}' already registered: ${existing.id}`);
        }

        const record: AdapterRegistryRecord = {
            id: randomUUID(),
            adapterId: randomUUID(),
            adapterType: request.adapterType,
            adapterKey: request.adapterKey,
            displayName: request.displayName,
            status: 'registered',
            version: request.version,
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            capabilities: request.capabilities,
            registeredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            correlationId: request.correlationId,
        };

        this.adapters.set(record.id, record);
        this.adaptersByKey.set(request.adapterKey, record);

        // Log to audit trail
        this.auditLog.push({
            action: 'register',
            adapterId: record.id,
            timestamp: record.registeredAt,
            correlationId: request.correlationId,
        });

        return record;
    }

    /**
     * Unregister an adapter
     */
    async unregisterAdapter(adapterId: string, correlationId: string): Promise<void> {
        const record = this.adapters.get(adapterId);
        if (!record) {
            throw new Error(`Adapter not found: ${adapterId}`);
        }

        record.status = 'unregistered';
        record.updatedAt = new Date().toISOString();

        // Log to audit trail
        this.auditLog.push({
            action: 'unregister',
            adapterId,
            timestamp: new Date().toISOString(),
            correlationId,
        });
    }

    /**
     * Get adapter by ID
     */
    async getAdapter(adapterId: string): Promise<AdapterRegistryRecord | undefined> {
        return this.adapters.get(adapterId);
    }

    /**
     * Get adapter by key
     */
    async getAdapterByKey(adapterKey: string): Promise<AdapterRegistryRecord | undefined> {
        return this.adaptersByKey.get(adapterKey);
    }

    /**
     * Discover adapters matching filter criteria
     */
    async discoverAdapters(filter: DiscoverAdaptersFilter): Promise<AdapterRegistryRecord[]> {
        const results: AdapterRegistryRecord[] = [];

        for (const adapter of this.adapters.values()) {
            if (adapter.status === 'unregistered') continue;

            if (filter.adapterType && adapter.adapterType !== filter.adapterType) continue;
            if (filter.status && adapter.status !== filter.status) continue;
            if (filter.tenantId && adapter.tenantId !== filter.tenantId) continue;
            if (filter.workspaceId && adapter.workspaceId !== filter.workspaceId) continue;

            results.push(adapter);
        }

        return results;
    }

    /**
     * Perform health check on adapter
     */
    async healthCheck(adapterId: string, correlationId: string): Promise<AdapterStatus> {
        const record = this.adapters.get(adapterId);
        if (!record) {
            throw new Error(`Adapter not found: ${adapterId}`);
        }

        // In production, this would call the actual adapter health endpoint
        // For now, we simulate success
        record.lastHealthcheckAt = new Date().toISOString();
        record.lastHealthcheckResult = 'OK';
        record.status = 'healthy';
        record.updatedAt = new Date().toISOString();

        this.auditLog.push({
            action: 'healthcheck',
            adapterId,
            timestamp: record.lastHealthcheckAt,
            correlationId,
        });

        return record.status;
    }

    /**
     * Update adapter capabilities
     */
    async updateCapabilities(
        adapterId: string,
        capabilities: AdapterCapability[],
        correlationId: string
    ): Promise<AdapterRegistryRecord> {
        const record = this.adapters.get(adapterId);
        if (!record) {
            throw new Error(`Adapter not found: ${adapterId}`);
        }

        record.capabilities = capabilities;
        record.updatedAt = new Date().toISOString();

        this.auditLog.push({
            action: 'update_capabilities',
            adapterId,
            timestamp: record.updatedAt,
            correlationId,
        });

        return record;
    }

    /**
     * Get audit log for tenant (if applicable)
     */
    getAuditLog(tenantId?: string): Array<{ action: string; adapterId: string; timestamp: string; correlationId: string }> {
        if (!tenantId) {
            return [...this.auditLog];
        }

        // Filter audit log to adapters in this tenant
        const tenantAdapterIds = new Set<string>();
        for (const adapter of this.adapters.values()) {
            if (adapter.tenantId === tenantId) {
                tenantAdapterIds.add(adapter.id);
            }
        }

        return this.auditLog.filter((entry) => tenantAdapterIds.has(entry.adapterId));
    }

    /**
     * List all registered adapters (for API endpoint)
     */
    async listAdapters(): Promise<AdapterRegistryRecord[]> {
        return Array.from(this.adapters.values()).filter((a) => a.status !== 'unregistered');
    }
}

// Singleton instance for global registry
export const globalAdapterRegistry = new AdapterRegistry();
