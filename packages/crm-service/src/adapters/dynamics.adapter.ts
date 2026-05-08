import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult } from '@agentfarm/shared-types';
import { CRMAdapter } from './base.adapter.js';

/** Microsoft Dynamics 365 CRM adapter using Bearer token + instanceUrl */
export class DynamicsAdapter extends CRMAdapter {
    private get apiBase(): string {
        return `${this.config.instanceUrl ?? ''}/api/data/v9.2`;
    }

    async getRecord(type: string, id: string): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${this.apiBase}/${type}(${id})`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics' };
            const raw = await res.json() as Record<string, unknown>;
            return { success: true, data: { id, type, fields: raw, vendor: 'dynamics', rawResponse: raw }, vendor: 'dynamics' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics' };
        }
    }

    async queryRecords(query: CRMQuery): Promise<CRMResult<CRMRecord[]>> {
        try {
            const top = query.limit ?? 50;
            const select = query.fields?.join(',');
            const params = new URLSearchParams({ $top: String(top) });
            if (select) params.set('$select', select);
            const res = await fetch(`${this.apiBase}/${query.type}?${params.toString()}`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics' };
            const raw = await res.json() as { value: Record<string, unknown>[] };
            const records: CRMRecord[] = (raw.value ?? []).map(r => ({
                id: String(r[`${query.type.toLowerCase()}id`] ?? r['@odata.id'] ?? ''),
                type: query.type,
                fields: r,
                vendor: 'dynamics' as const,
                rawResponse: r,
            }));
            return { success: true, data: records, vendor: 'dynamics' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics' };
        }
    }

    async createRecord(payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${this.apiBase}/${payload.type}`, {
                method: 'POST',
                headers: { ...this.bearerHeaders(), 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics' };
            const raw = await res.json() as Record<string, unknown>;
            const id = String(raw[`${payload.type.toLowerCase()}id`] ?? '');
            return { success: true, data: { id, type: payload.type, fields: raw, vendor: 'dynamics' }, vendor: 'dynamics' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics' };
        }
    }

    async updateRecord(id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(`${this.apiBase}/${payload.type}(${id})`, {
                method: 'PATCH',
                headers: { ...this.bearerHeaders(), 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics' };
            return { success: true, data: { id, type: payload.type, fields: payload.fields, vendor: 'dynamics' }, vendor: 'dynamics' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics' };
        }
    }

    async deleteRecord(type: string, id: string): Promise<CRMResult<void>> {
        try {
            const res = await fetch(`${this.apiBase}/${type}(${id})`, {
                method: 'DELETE',
                headers: this.bearerHeaders(),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics' };
            return { success: true, vendor: 'dynamics' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics' };
        }
    }

    async testConnection(): Promise<CRMResult<string>> {
        try {
            const res = await fetch(`${this.apiBase}/WhoAmI`, {
                headers: { ...this.bearerHeaders(), Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'dynamics' };
            return { success: true, data: 'Dynamics connection OK', vendor: 'dynamics' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'dynamics' };
        }
    }
}

export function createDynamicsAdapter(config: CRMConfig): DynamicsAdapter {
    return new DynamicsAdapter(config);
}
