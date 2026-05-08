import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult } from '@agentfarm/shared-types';
import { ERPAdapter } from './base.adapter.js';

/** NetSuite REST Record API adapter using Bearer (Token-Based Auth) */
export class NetSuiteAdapter extends ERPAdapter {
    private get base(): string {
        return `${this.config.baseUrl}/services/rest/record/v1`;
    }

    async getDocument(docType: string, id: string): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${docType}/${id}`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'netsuite' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id, docType, fields: raw, vendor: 'netsuite', rawResponse: raw }, vendor: 'netsuite' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'netsuite' };
        }
    }

    async queryDocuments(query: ERPQuery): Promise<ERPResult<ERPDocument[]>> {
        try {
            const params = new URLSearchParams({ limit: String(query.limit ?? 50) });
            if (query.fields?.length) params.set('fields', query.fields.join(','));
            const res = await fetch(`${this.base}/${query.docType}?${params.toString()}`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'netsuite' };
            const raw = await res.json() as { items: Record<string, unknown>[] };
            const docs: ERPDocument[] = (raw.items ?? []).map(r => ({
                id: String(r['id'] ?? ''),
                docType: query.docType,
                fields: r,
                vendor: 'netsuite' as const,
                rawResponse: r,
            }));
            return { success: true, data: docs, vendor: 'netsuite' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'netsuite' };
        }
    }

    async createDocument(payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${payload.docType}`, {
                method: 'POST',
                headers: { ...this.bearerHeaders(), Prefer: 'respond-async' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'netsuite' };
            // NetSuite POST returns 204 with Location header
            const location = res.headers.get('Location') ?? '';
            const id = location.split('/').pop() ?? '';
            return { success: true, data: { id, docType: payload.docType, fields: payload.fields, vendor: 'netsuite' }, vendor: 'netsuite' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'netsuite' };
        }
    }

    async updateDocument(id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${payload.docType}/${id}`, {
                method: 'PATCH',
                headers: this.bearerHeaders(),
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'netsuite' };
            return { success: true, data: { id, docType: payload.docType, fields: payload.fields, vendor: 'netsuite' }, vendor: 'netsuite' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'netsuite' };
        }
    }

    async deleteDocument(docType: string, id: string): Promise<ERPResult<void>> {
        try {
            const res = await fetch(`${this.base}/${docType}/${id}`, {
                method: 'DELETE',
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'netsuite' };
            return { success: true, vendor: 'netsuite' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'netsuite' };
        }
    }

    async testConnection(): Promise<ERPResult<string>> {
        try {
            const res = await fetch(`${this.base}/customer?limit=1`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'netsuite' };
            return { success: true, data: 'NetSuite connection OK', vendor: 'netsuite' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'netsuite' };
        }
    }
}

export function createNetSuiteAdapter(config: ERPConfig): NetSuiteAdapter {
    return new NetSuiteAdapter(config);
}
