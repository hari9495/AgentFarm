import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult } from '@agentfarm/shared-types';
import { CRMAdapter } from './base.adapter.js';

/** Salesforce REST API v59.0 adapter using Bearer token + instanceUrl */
export class SalesforceAdapter extends CRMAdapter {
    private get apiBase(): string {
        return `${this.config.instanceUrl ?? ''}/services/data/v59.0`;
    }

    async getRecord(type: string, id: string): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${this.apiBase}/sobjects/${type}/${id}`, {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'salesforce' };
            const raw = await res.json() as Record<string, unknown>;
            const record: CRMRecord = {
                id: String(raw['Id'] ?? id),
                type,
                fields: raw,
                vendor: 'salesforce',
                rawResponse: raw,
            };
            return { success: true, data: record, vendor: 'salesforce' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'salesforce' };
        }
    }

    async queryRecords(query: CRMQuery): Promise<CRMResult<CRMRecord[]>> {
        try {
            const fields = (query.fields?.join(',')) ?? 'Id,Name';
            const limit = query.limit ?? 50;
            const soql = encodeURIComponent(`SELECT ${fields} FROM ${query.type} LIMIT ${limit}`);
            const res = await fetch(`${this.apiBase}/query?q=${soql}`, {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'salesforce' };
            const raw = await res.json() as { records: Record<string, unknown>[] };
            const records: CRMRecord[] = (raw.records ?? []).map(r => ({
                id: String(r['Id'] ?? ''),
                type: query.type,
                fields: r,
                vendor: 'salesforce' as const,
                rawResponse: r,
            }));
            return { success: true, data: records, vendor: 'salesforce' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'salesforce' };
        }
    }

    async createRecord(payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${this.apiBase}/sobjects/${payload.type}`, {
                method: 'POST',
                headers: this.bearerHeaders(),
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'salesforce' };
            const raw = await res.json() as { id: string };
            return { success: true, data: { id: raw.id, type: payload.type, fields: payload.fields, vendor: 'salesforce' }, vendor: 'salesforce' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'salesforce' };
        }
    }

    async updateRecord(id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${this.apiBase}/sobjects/${payload.type}/${id}`, {
                method: 'PATCH',
                headers: this.bearerHeaders(),
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'salesforce' };
            return { success: true, data: { id, type: payload.type, fields: payload.fields, vendor: 'salesforce' }, vendor: 'salesforce' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'salesforce' };
        }
    }

    async deleteRecord(type: string, id: string): Promise<CRMResult<void>> {
        try {
            const res = await fetch(`${this.apiBase}/sobjects/${type}/${id}`, {
                method: 'DELETE',
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'salesforce' };
            return { success: true, vendor: 'salesforce' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'salesforce' };
        }
    }

    async testConnection(): Promise<CRMResult<string>> {
        try {
            const res = await fetch(`${this.apiBase}/limits`, { headers: this.bearerHeaders() });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'salesforce' };
            return { success: true, data: 'Salesforce connection OK', vendor: 'salesforce' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'salesforce' };
        }
    }
}

export function createSalesforceAdapter(config: CRMConfig): SalesforceAdapter {
    return new SalesforceAdapter(config);
}
