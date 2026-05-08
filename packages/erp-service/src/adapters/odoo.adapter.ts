import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult } from '@agentfarm/shared-types';
import { ERPAdapter } from './base.adapter.js';

/**
 * Odoo JSON-RPC adapter.
 * All operations go through POST /jsonrpc.
 * Auth: session-based via authenticate call, or api_key in context.
 */

type OdooRPCResponse<T> = {
    id: number;
    result?: T;
    error?: { code: number; message: string; data?: unknown };
};

export class OdooAdapter extends ERPAdapter {
    private get endpoint(): string {
        return `${this.config.baseUrl}/jsonrpc`;
    }

    private async rpc<T>(service: string, method: string, args: unknown[]): Promise<OdooRPCResponse<T>> {
        const body = {
            jsonrpc: '2.0',
            method: 'call',
            id: Date.now(),
            params: { service, method, args },
        };
        const res = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.json() as Promise<OdooRPCResponse<T>>;
    }

    private db(): string {
        return this.config.companyId ?? '';
    }

    private authArgs(): [string, string, string, unknown[]] {
        return [this.db(), this.config.username ?? '', this.config.password ?? this.config.apiKey ?? '', []];
    }

    async getDocument(docType: string, id: string): Promise<ERPResult<ERPDocument>> {
        try {
            const resp = await this.rpc<unknown[][]>('object', 'execute', [
                this.db(), this.config.username ?? '', this.config.password ?? this.config.apiKey ?? '',
                docType, 'read', [Number(id)],
            ]);
            if (resp.error) return { success: false, error: resp.error.message, vendor: 'odoo' };
            const first = ((resp.result ?? []) as unknown[])[0] as Record<string, unknown> | undefined;
            if (!first) return { success: false, error: 'Record not found', vendor: 'odoo' };
            return { success: true, data: { id, docType, fields: first, vendor: 'odoo', rawResponse: first }, vendor: 'odoo' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'odoo' };
        }
    }

    async queryDocuments(query: ERPQuery): Promise<ERPResult<ERPDocument[]>> {
        try {
            const domain = query.filters ? Object.entries(query.filters).map(([k, v]) => [k, '=', v]) : [];
            const fields = query.fields ?? [];
            const limit = query.limit ?? 50;
            const resp = await this.rpc<Record<string, unknown>[]>('object', 'execute', [
                this.db(), this.config.username ?? '', this.config.password ?? this.config.apiKey ?? '',
                query.docType, 'search_read', domain, fields, 0, limit,
            ]);
            if (resp.error) return { success: false, error: resp.error.message, vendor: 'odoo' };
            const docs: ERPDocument[] = (resp.result ?? []).map(r => ({
                id: String(r['id'] ?? ''),
                docType: query.docType,
                fields: r,
                vendor: 'odoo' as const,
                rawResponse: r,
            }));
            return { success: true, data: docs, vendor: 'odoo' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'odoo' };
        }
    }

    async createDocument(payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const resp = await this.rpc<number>('object', 'execute', [
                this.db(), this.config.username ?? '', this.config.password ?? this.config.apiKey ?? '',
                payload.docType, 'create', payload.fields,
            ]);
            if (resp.error) return { success: false, error: resp.error.message, vendor: 'odoo' };
            const newId = String(resp.result ?? '');
            return { success: true, data: { id: newId, docType: payload.docType, fields: payload.fields, vendor: 'odoo' }, vendor: 'odoo' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'odoo' };
        }
    }

    async updateDocument(id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>> {
        try {
            const resp = await this.rpc<boolean>('object', 'execute', [
                this.db(), this.config.username ?? '', this.config.password ?? this.config.apiKey ?? '',
                payload.docType, 'write', [[Number(id)]], payload.fields,
            ]);
            if (resp.error) return { success: false, error: resp.error.message, vendor: 'odoo' };
            return { success: true, data: { id, docType: payload.docType, fields: payload.fields, vendor: 'odoo' }, vendor: 'odoo' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'odoo' };
        }
    }

    async deleteDocument(docType: string, id: string): Promise<ERPResult<void>> {
        try {
            const resp = await this.rpc<boolean>('object', 'execute', [
                this.db(), this.config.username ?? '', this.config.password ?? this.config.apiKey ?? '',
                docType, 'unlink', [[Number(id)]],
            ]);
            if (resp.error) return { success: false, error: resp.error.message, vendor: 'odoo' };
            return { success: true, vendor: 'odoo' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'odoo' };
        }
    }

    async testConnection(): Promise<ERPResult<string>> {
        try {
            const resp = await this.rpc<number>('common', 'authenticate', [...this.authArgs()]);
            if (resp.error || !resp.result) return { success: false, error: resp.error?.message ?? 'Auth failed', vendor: 'odoo' };
            return { success: true, data: 'Odoo connection OK', vendor: 'odoo' };
        } catch (err) {
            return { success: false, error: String(err), vendor: 'odoo' };
        }
    }
}

export function createOdooAdapter(config: ERPConfig): OdooAdapter {
    return new OdooAdapter(config);
}
