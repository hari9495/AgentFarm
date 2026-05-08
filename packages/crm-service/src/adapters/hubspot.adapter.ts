import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult } from '@agentfarm/shared-types';
import { CRMAdapter } from './base.adapter.js';

const HUBSPOT_BASE = 'https://api.hubapi.com/crm/v3/objects';

/** HubSpot CRM v3 adapter using Bearer access token */
export class HubspotAdapter extends CRMAdapter {
    async getRecord(type: string, id: string): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${HUBSPOT_BASE}/${type}/${id}`, {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'hubspot' };
            const raw = await res.json() as { id: string; properties: Record<string, unknown> };
            return {
                success: true,
                data: { id: raw.id, type, fields: raw.properties, vendor: 'hubspot', rawResponse: raw },
                vendor: 'hubspot',
            };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'hubspot' };
        }
    }

    async queryRecords(query: CRMQuery): Promise<CRMResult<CRMRecord[]>> {
        try {
            const limit = query.limit ?? 50;
            const props = query.fields?.join(',') ?? 'hs_object_id';
            const res = await fetch(`${HUBSPOT_BASE}/${query.type}?limit=${limit}&properties=${props}`, {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'hubspot' };
            const raw = await res.json() as { results: Array<{ id: string; properties: Record<string, unknown> }> };
            const records: CRMRecord[] = (raw.results ?? []).map(r => ({
                id: r.id,
                type: query.type,
                fields: r.properties,
                vendor: 'hubspot' as const,
                rawResponse: r,
            }));
            return { success: true, data: records, vendor: 'hubspot' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'hubspot' };
        }
    }

    async createRecord(payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${HUBSPOT_BASE}/${payload.type}`, {
                method: 'POST',
                headers: this.bearerHeaders(),
                body: JSON.stringify({ properties: payload.fields }),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'hubspot' };
            const raw = await res.json() as { id: string; properties: Record<string, unknown> };
            return { success: true, data: { id: raw.id, type: payload.type, fields: raw.properties, vendor: 'hubspot' }, vendor: 'hubspot' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'hubspot' };
        }
    }

    async updateRecord(id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${HUBSPOT_BASE}/${payload.type}/${id}`, {
                method: 'PATCH',
                headers: this.bearerHeaders(),
                body: JSON.stringify({ properties: payload.fields }),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'hubspot' };
            const raw = await res.json() as { id: string; properties: Record<string, unknown> };
            return { success: true, data: { id: raw.id, type: payload.type, fields: raw.properties, vendor: 'hubspot' }, vendor: 'hubspot' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'hubspot' };
        }
    }

    async deleteRecord(type: string, id: string): Promise<CRMResult<void>> {
        try {
            const res = await fetch(`${HUBSPOT_BASE}/${type}/${id}`, {
                method: 'DELETE',
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'hubspot' };
            return { success: true, vendor: 'hubspot' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'hubspot' };
        }
    }

    async testConnection(): Promise<CRMResult<string>> {
        try {
            const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'hubspot' };
            return { success: true, data: 'HubSpot connection OK', vendor: 'hubspot' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'hubspot' };
        }
    }
}

export function createHubspotAdapter(config: CRMConfig): HubspotAdapter {
    return new HubspotAdapter(config);
}
