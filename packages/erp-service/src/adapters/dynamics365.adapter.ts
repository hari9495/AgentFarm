import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult } from '@agentfarm/shared-types';
import { ERPAdapter } from './base.adapter.js';

/** Microsoft Dynamics 365 Finance & Operations OData adapter using Bearer token */
export class Dynamics365Adapter extends ERPAdapter {
    private get base(): string {
        return `${this.config.baseUrl}/data`;
    }

    async getDocument(docType: string, id: string): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${docType}(${id})`, {
                headers: { ...this.bearerHeaders(), 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics365' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id, docType, fields: raw, vendor: 'dynamics365', rawResponse: raw }, vendor: 'dynamics365' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics365' };
        }
    }

    async queryDocuments(query: ERPQuery): Promise<ERPResult<ERPDocument[]>> {
        try {
            const params = new URLSearchParams({ '$top': String(query.limit ?? 50) });
            if (query.fields?.length) params.set('$select', query.fields.join(','));
            const res = await fetch(`${this.base}/${query.docType}?${params.toString()}`, {
                headers: { ...this.bearerHeaders(), 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics365' };
            const raw = await res.json() as { value: Record<string, unknown>[] };
            const docs: ERPDocument[] = (raw.value ?? []).map(r => ({
                id: String(r['RecId'] ?? r['dataAreaId'] ?? ''),
                docType: query.docType,
                fields: r,
                vendor: 'dynamics365' as const,
                rawResponse: r,
            }));
            return { success: true, data: docs, vendor: 'dynamics365' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics365' };
        }
    }

    async createDocument(payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${payload.docType}`, {
                method: 'POST',
                headers: { ...this.bearerHeaders(), 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics365' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id: String(raw['RecId'] ?? ''), docType: payload.docType, fields: raw, vendor: 'dynamics365' }, vendor: 'dynamics365' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics365' };
        }
    }

    async updateDocument(id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${payload.docType}(${id})`, {
                method: 'PATCH',
                headers: { ...this.bearerHeaders(), 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics365' };
            return { success: true, data: { id, docType: payload.docType, fields: payload.fields, vendor: 'dynamics365' }, vendor: 'dynamics365' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics365' };
        }
    }

    async deleteDocument(docType: string, id: string): Promise<ERPResult<void>> {
        try {
            const res = await fetch(`${this.base}/${docType}(${id})`, {
                method: 'DELETE',
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics365' };
            return { success: true, vendor: 'dynamics365' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics365' };
        }
    }

    async testConnection(): Promise<ERPResult<string>> {
        try {
            const res = await fetch(`${this.base}/$metadata`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics365' };
            return { success: true, data: 'Dynamics 365 connection OK', vendor: 'dynamics365' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics365' };
        }
    }
}

export function createDynamics365Adapter(config: ERPConfig): Dynamics365Adapter {
    return new Dynamics365Adapter(config);
}
