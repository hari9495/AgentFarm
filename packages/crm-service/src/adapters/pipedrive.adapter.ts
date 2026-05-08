import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult } from '@agentfarm/shared-types';
import { CRMAdapter } from './base.adapter.js';

const PIPEDRIVE_BASE = 'https://api.pipedrive.com/v1';

/** Pipedrive CRM v1 adapter — auth via `api_token` query parameter */
export class PipedriveAdapter extends CRMAdapter {
    private apiToken(): string {
        return this.config.apiKey ?? this.config.accessToken ?? '';
    }

    private url(path: string, extra?: Record<string, string>): string {
        const params = new URLSearchParams({ api_token: this.apiToken(), ...extra });
        return `${PIPEDRIVE_BASE}${path}?${params.toString()}`;
    }

    async getRecord(type: string, id: string): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(this.url(`/${type}/${id}`), { headers: { Accept: 'application/json' } });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'pipedrive' };
            const raw = await res.json() as { data: Record<string, unknown> };
            return {
                success: true,
                data: { id: String(raw.data?.['id'] ?? id), type, fields: raw.data ?? {}, vendor: 'pipedrive', rawResponse: raw },
                vendor: 'pipedrive',
            };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'pipedrive' };
        }
    }

    async queryRecords(query: CRMQuery): Promise<CRMResult<CRMRecord[]>> {
        try {
            const limit = String(query.limit ?? 50);
            const res = await fetch(this.url(`/${query.type}`, { limit }), { headers: { Accept: 'application/json' } });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'pipedrive' };
            const raw = await res.json() as { data: Record<string, unknown>[] | null };
            const records: CRMRecord[] = (raw.data ?? []).map(r => ({
                id: String(r['id'] ?? ''),
                type: query.type,
                fields: r,
                vendor: 'pipedrive' as const,
                rawResponse: r,
            }));
            return { success: true, data: records, vendor: 'pipedrive' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'pipedrive' };
        }
    }

    async createRecord(payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(this.url(`/${payload.type}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'pipedrive' };
            const raw = await res.json() as { data: Record<string, unknown> };
            return { success: true, data: { id: String(raw.data?.['id'] ?? ''), type: payload.type, fields: raw.data ?? {}, vendor: 'pipedrive' }, vendor: 'pipedrive' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'pipedrive' };
        }
    }

    async updateRecord(id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>> {
        try {
            const res = await fetch(this.url(`/${payload.type}/${id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload.fields),
            });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'pipedrive' };
            const raw = await res.json() as { data: Record<string, unknown> };
            return { success: true, data: { id, type: payload.type, fields: raw.data ?? {}, vendor: 'pipedrive' }, vendor: 'pipedrive' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'pipedrive' };
        }
    }

    async deleteRecord(type: string, id: string): Promise<CRMResult<void>> {
        try {
            const res = await fetch(this.url(`/${type}/${id}`), { method: 'DELETE' });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'pipedrive' };
            return { success: true, vendor: 'pipedrive' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'pipedrive' };
        }
    }

    async testConnection(): Promise<CRMResult<string>> {
        try {
            const res = await fetch(this.url('/users/me'), { headers: { Accept: 'application/json' } });
            if (!res.ok) return { success: false, error: await res.text(), vendor: 'pipedrive' };
            return { success: true, data: 'Pipedrive connection OK', vendor: 'pipedrive' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'pipedrive' };
        }
    }
}

export function createPipedriveAdapter(config: CRMConfig): PipedriveAdapter {
    return new PipedriveAdapter(config);
}
