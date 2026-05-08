import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult } from '@agentfarm/shared-types';
import { ERPAdapter } from './base.adapter.js';

/**
 * SAP OData v4 adapter.
 * - GET/PATCH/POST/DELETE requests include X-CSRF-Token handling:
 *   a pre-flight HEAD/GET to /sap/opu/odata4 fetches the token; the token is
 *   included in mutating requests as X-CSRF-Token header.
 * - Auth: Bearer token or Basic when username/password provided.
 */
export class SAPAdapter extends ERPAdapter {
    private get base(): string {
        return `${this.config.baseUrl}/sap/opu/odata4`;
    }

    private authHeader(): string {
        if (this.config.accessToken) return `Bearer ${this.config.accessToken}`;
        return this.basicAuth();
    }

    private async fetchCSRFToken(): Promise<string> {
        const res = await fetch(`${this.base}`, {
            method: 'GET',
            headers: { Authorization: this.authHeader(), 'X-CSRF-Token': 'Fetch' },
        });
        return res.headers.get('x-csrf-token') ?? '';
    }

    async getDocument(docType: string, id: string): Promise<ERPResult<ERPDocument>> {
        try {
            const res = await fetch(`${this.base}/${docType}(${id})`, {
                headers: { Authorization: this.authHeader(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'sap' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id, docType, fields: raw, vendor: 'sap', rawResponse: raw }, vendor: 'sap' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'sap' };
        }
    }

    async queryDocuments(query: ERPQuery): Promise<ERPResult<ERPDocument[]>> {
        try {
            const params = new URLSearchParams({ $top: String(query.limit ?? 50) });
            if (query.fields?.length) params.set('$select', query.fields.join(','));
            const res = await fetch(`${this.base}/${query.docType}?${params.toString()}`, {
                headers: { Authorization: this.authHeader(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'sap' };
            const raw = await res.json() as { value: Record<string, unknown>[] };
            const docs: ERPDocument[] = (raw.value ?? []).map(r => ({
                id: String(r['ID'] ?? r['id'] ?? ''),
                docType: query.docType,
                fields: r,
                vendor: 'sap' as const,
                rawResponse: r,
            }));
            return { success: true, data: docs, vendor: 'sap' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'sap' };
        }
    }

    async createDocument(payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const csrf = await this.fetchCSRFToken();
            const res = await fetch(`${this.base}/${payload.docType}`, {
                method: 'POST',
                headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'sap' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id: String(raw['ID'] ?? raw['id'] ?? ''), docType: payload.docType, fields: raw, vendor: 'sap' }, vendor: 'sap' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'sap' };
        }
    }

    async updateDocument(id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const csrf = await this.fetchCSRFToken();
            const res = await fetch(`${this.base}/${payload.docType}(${id})`, {
                method: 'PATCH',
                headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'sap' };
            return { success: true, data: { id, docType: payload.docType, fields: payload.fields, vendor: 'sap' }, vendor: 'sap' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'sap' };
        }
    }

    async deleteDocument(docType: string, id: string): Promise<ERPResult<void>> {
        try {
            const csrf = await this.fetchCSRFToken();
            const res = await fetch(`${this.base}/${docType}(${id})`, {
                method: 'DELETE',
                headers: { Authorization: this.authHeader(), 'X-CSRF-Token': csrf },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'sap' };
            return { success: true, vendor: 'sap' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'sap' };
        }
    }

    async testConnection(): Promise<ERPResult<string>> {
        try {
            const res = await fetch(`${this.base}`, {
                headers: { Authorization: this.authHeader(), Accept: 'application/json' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'sap' };
            return { success: true, data: 'SAP connection OK', vendor: 'sap' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'sap' };
        }
    }
}

export function createSAPAdapter(config: ERPConfig): SAPAdapter {
    return new SAPAdapter(config);
}
