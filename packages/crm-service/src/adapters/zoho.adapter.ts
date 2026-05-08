import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult } from '@agentfarm/shared-types';
import { CRMAdapter } from './base.adapter.js';

const ZOHO_BASE = 'https://www.zohoapis.com/crm/v2';

/** Zoho CRM v2 adapter using Bearer access token */
export class ZohoAdapter extends CRMAdapter {
    async getRecord(type: string, id: string): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${ZOHO_BASE}/${type}/${id}`, {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'zoho' };
            const raw = await res.json() as { data: Record<string, unknown>[] };
            const first = raw.data?.[0] ?? {};
            return {
                success: true,
                data: { id: String(first['id'] ?? id), type, fields: first, vendor: 'zoho', rawResponse: raw },
                vendor: 'zoho',
            };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'zoho' };
        }
    }

    async queryRecords(query: CRMQuery): Promise<CRMResult<CRMRecord[]>> {
        try {
            const limit = query.limit ?? 50;
            const params = new URLSearchParams({ per_page: String(limit) });
            if (query.fields?.length) params.set('fields', query.fields.join(','));
            const res = await fetch(`${ZOHO_BASE}/${query.type}/search?${params.toString()}`, {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'zoho' };
            const raw = await res.json() as { data: Record<string, unknown>[] };
            const records: CRMRecord[] = (raw.data ?? []).map(r => ({
                id: String(r['id'] ?? ''),
                type: query.type,
                fields: r,
                vendor: 'zoho' as const,
                rawResponse: r,
            }));
            return { success: true, data: records, vendor: 'zoho' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'zoho' };
        }
    }

    async createRecord(payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${ZOHO_BASE}/${payload.type}`, {
                method: 'POST',
                headers: this.bearerHeaders(),
                body: JSON.stringify({ data: [payload.fields] }),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'zoho' };
            const raw = await res.json() as { data: Array<{ details: Record<string, unknown>; code: string }> };
            const created = raw.data?.[0]?.details ?? {};
            return { success: true, data: { id: String(created['id'] ?? ''), type: payload.type, fields: created, vendor: 'zoho' }, vendor: 'zoho' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'zoho' };
        }
    }

    async updateRecord(id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${ZOHO_BASE}/${payload.type}/${id}`, {
                method: 'PUT',
                headers: this.bearerHeaders(),
                body: JSON.stringify({ data: [{ ...payload.fields, id }] }),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'zoho' };
            return { success: true, data: { id, type: payload.type, fields: payload.fields, vendor: 'zoho' }, vendor: 'zoho' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'zoho' };
        }
    }

    async deleteRecord(type: string, id: string): Promise<CRMResult<void>> {
        try {
            const res = await fetch(`${ZOHO_BASE}/${type}/${id}`, {
                method: 'DELETE',
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'zoho' };
            return { success: true, vendor: 'zoho' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'zoho' };
        }
    }

    async testConnection(): Promise<CRMResult<string>> {
        try {
            const res = await fetch(`${ZOHO_BASE}/org`, { headers: this.bearerHeaders() });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'zoho' };
            return { success: true, data: 'Zoho connection OK', vendor: 'zoho' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'zoho' };
        }
    }
}

export function createZohoAdapter(config: CRMConfig): ZohoAdapter {
    return new ZohoAdapter(config);
}
