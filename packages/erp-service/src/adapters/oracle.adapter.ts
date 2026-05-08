import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult } from '@agentfarm/shared-types';
import { ERPAdapter } from './base.adapter.js';

/** Oracle Fusion REST API adapter using Basic auth */
export class OracleAdapter extends ERPAdapter {
    private get base(): string {
        return `${this.config.baseUrl}/fscmRestApi/resources/11.13.18.05`;
    }

    async getDocument(docType: string, id: string): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${docType}/${id}`, {
                headers: { Authorization: this.basicAuth(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'oracle' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id, docType, fields: raw, vendor: 'oracle', rawResponse: raw }, vendor: 'oracle' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'oracle' };
        }
    }

    async queryDocuments(query: ERPQuery): Promise<ERPResult<ERPDocument[]>> {
        try {
            const params = new URLSearchParams({ limit: String(query.limit ?? 50) });
            if (query.fields?.length) params.set('fields', query.fields.join(','));
            const res = await fetch(`${this.base}/${query.docType}?${params.toString()}`, {
                headers: { Authorization: this.basicAuth(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'oracle' };
            const raw = await res.json() as { items: Record<string, unknown>[] };
            const docs: ERPDocument[] = (raw.items ?? []).map(r => ({
                id: String(r['Id'] ?? r['id'] ?? ''),
                docType: query.docType,
                fields: r,
                vendor: 'oracle' as const,
                rawResponse: r,
            }));
            return { success: true, data: docs, vendor: 'oracle' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'oracle' };
        }
    }

    async createDocument(payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${payload.docType}`, {
                method: 'POST',
                headers: { Authorization: this.basicAuth(), 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'oracle' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id: String(raw['Id'] ?? raw['id'] ?? ''), docType: payload.docType, fields: raw, vendor: 'oracle' }, vendor: 'oracle' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'oracle' };
        }
    }

    async updateDocument(id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${payload.docType}/${id}`, {
                method: 'PATCH',
                headers: { Authorization: this.basicAuth(), 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'oracle' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id, docType: payload.docType, fields: raw, vendor: 'oracle' }, vendor: 'oracle' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'oracle' };
        }
    }

    async deleteDocument(docType: string, id: string): Promise<ERPResult<void>> {
        try {
            const res = await fetch(`${this.base}/${docType}/${id}`, {
                method: 'DELETE',
                headers: { Authorization: this.basicAuth() },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'oracle' };
            return { success: true, vendor: 'oracle' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'oracle' };
        }
    }

    async testConnection(): Promise<ERPResult<string>> {
        try {
            const res = await fetch(`${this.base}/commonComponents?limit=1`, {
                headers: { Authorization: this.basicAuth(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'oracle' };
            return { success: true, data: 'Oracle connection OK', vendor: 'oracle' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'oracle' };
        }
    }
}

export function createOracleAdapter(config: ERPConfig): OracleAdapter {
    return new OracleAdapter(config);
}
