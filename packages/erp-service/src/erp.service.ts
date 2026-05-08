import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult, ERPVendor, CustomerERPConfig } from '@agentfarm/shared-types';
import { ERPAdapter } from './adapters/base.adapter.js';
import { SAPAdapter } from './adapters/sap.adapter.js';
import { OracleAdapter } from './adapters/oracle.adapter.js';
import { Dynamics365Adapter } from './adapters/dynamics365.adapter.js';
import { NetSuiteAdapter } from './adapters/netsuite.adapter.js';
import { OdooAdapter } from './adapters/odoo.adapter.js';

// ─── Factory ───────────────────────────────────────────────────────────────

export class ERPAdapterFactory {
    static create(config: ERPConfig): ERPAdapter {
        switch (config.vendor) {
            case 'sap':
                return new SAPAdapter(config);
            case 'oracle':
                return new OracleAdapter(config);
            case 'dynamics365':
                return new Dynamics365Adapter(config);
            case 'netsuite':
                return new NetSuiteAdapter(config);
            case 'odoo':
                return new OdooAdapter(config);
            default: {
                const exhaustive: never = config.vendor;
                throw new Error(`Unknown ERP vendor: ${exhaustive}`);
            }
        }
    }
}

// ─── Per-customer store ─────────────────────────────────────────────────────

export class CustomerERPStore {
    private readonly store = new Map<string, ERPConfig>();

    registerCustomer(entry: CustomerERPConfig): void {
        this.store.set(entry.customerId, entry.config);
    }

    unregisterCustomer(customerId: string): void {
        this.store.delete(customerId);
    }

    getConfig(customerId: string): ERPConfig | undefined {
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

export class ERPService {
    constructor(private readonly store: CustomerERPStore) { }

    private adapter(customerId: string): ERPAdapter | null {
        const config = this.store.getConfig(customerId);
        if (!config) return null;
        return ERPAdapterFactory.create(config);
    }

    async getDocument(customerId: string, docType: string, id: string): Promise<ERPResult<ERPDocument>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No ERP config for customer ${customerId}`, vendor: 'sap' };
        return adapter.getDocument(docType, id);
    }

    async queryDocuments(customerId: string, query: ERPQuery): Promise<ERPResult<ERPDocument[]>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No ERP config for customer ${customerId}`, vendor: 'sap' };
        return adapter.queryDocuments(query);
    }

    async createDocument(customerId: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No ERP config for customer ${customerId}`, vendor: 'sap' };
        return adapter.createDocument(payload);
    }

    async updateDocument(customerId: string, id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No ERP config for customer ${customerId}`, vendor: 'sap' };
        return adapter.updateDocument(id, payload);
    }

    async deleteDocument(customerId: string, docType: string, id: string): Promise<ERPResult<void>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No ERP config for customer ${customerId}`, vendor: 'sap' };
        return adapter.deleteDocument(docType, id);
    }

    async testConnection(customerId: string): Promise<ERPResult<string>> {
        const adapter = this.adapter(customerId);
        if (!adapter) return { success: false, error: `No ERP config for customer ${customerId}`, vendor: 'sap' };
        return adapter.testConnection();
    }

    getVendor(customerId: string): ERPVendor | null {
        return this.store.getConfig(customerId)?.vendor ?? null;
    }
}
