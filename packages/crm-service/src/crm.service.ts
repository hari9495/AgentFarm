import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult, CRMVendor, CustomerCRMConfig } from '@agentfarm/shared-types';
import { CRMAdapter } from './adapters/base.adapter.js';
import { SalesforceAdapter } from './adapters/salesforce.adapter.js';
import { HubspotAdapter } from './adapters/hubspot.adapter.js';
import { ZohoAdapter } from './adapters/zoho.adapter.js';
import { DynamicsAdapter } from './adapters/dynamics.adapter.js';
import { PipedriveAdapter } from './adapters/pipedrive.adapter.js';

// ─── Factory ───────────────────────────────────────────────────────────────

export class CRMAdapterFactory {
    static create(config: CRMConfig): CRMAdapter {
        switch (config.vendor) {
            case 'salesforce':
                return new SalesforceAdapter(config);
            case 'hubspot':
                return new HubspotAdapter(config);
            case 'zoho':
                return new ZohoAdapter(config);
            case 'dynamics':
                return new DynamicsAdapter(config);
            case 'pipedrive':
                return new PipedriveAdapter(config);
            default: {
                const exhaustive: never = config.vendor;
                throw new Error(`Unknown CRM vendor: ${exhaustive}`);
            }
        }
    }
}

// ─── Per-customer store ─────────────────────────────────────────────────────

export class CustomerCRMStore {
    private readonly store = new Map<string, CRMConfig>();

    registerCustomer(entry: CustomerCRMConfig): void {
        this.store.set(entry.customerId, entry.config);
    }

    unregisterCustomer(customerId: string): void {
        this.store.delete(customerId);
    }

    getConfig(customerId: string): CRMConfig | undefined {
        return this.store.get(customerId);
    }

    hasCustomer(customerId: string): boolean {
        return this.store.has(customerId);
    }

    listCustomers(): string[] {
        return Array.from(this.store.keys());
    }
}

// ─── Service ────────────────────────────────────────────────────────────────

export class CRMService {
    constructor(private readonly store: CustomerCRMStore) { }

    private adapter(customerId: string): CRMAdapter | null {
        const config = this.store.getConfig(customerId);
        if (!config) return null;
        return CRMAdapterFactory.create(config);
    }

    async getRecord(customerId: string, type: string, id: string): Promise<CRMResult<CRMRecord>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No CRM config for customer ${customerId}`, vendor: 'salesforce' };
        return adapter.getRecord(type, id);
    }

    async queryRecords(customerId: string, query: CRMQuery): Promise<CRMResult<CRMRecord[]>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No CRM config for customer ${customerId}`, vendor: 'salesforce' };
        return adapter.queryRecords(query);
    }

    async createRecord(customerId: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No CRM config for customer ${customerId}`, vendor: 'salesforce' };
        return adapter.createRecord(payload);
    }

    async updateRecord(customerId: string, id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No CRM config for customer ${customerId}`, vendor: 'salesforce' };
        return adapter.updateRecord(id, payload);
    }

    async deleteRecord(customerId: string, type: string, id: string): Promise<CRMResult<void>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No CRM config for customer ${customerId}`, vendor: 'salesforce' };
        return adapter.deleteRecord(type, id);
    }

    async testConnection(customerId: string): Promise<CRMResult<string>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No CRM config for customer ${customerId}`, vendor: 'salesforce' };
        return adapter.testConnection();
    }

    getVendor(customerId: string): CRMVendor | null {
        return this.store.getConfig(customerId)?.vendor ?? null;
    }
}
