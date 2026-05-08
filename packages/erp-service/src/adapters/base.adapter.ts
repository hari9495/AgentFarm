import type { ERPConfig, ERPDocument, ERPQuery, ERPWritePayload, ERPResult, ERPVendor } from '@agentfarm/shared-types';

export abstract class ERPAdapter {
    constructor(protected readonly config: ERPConfig) { }

    abstract getDocument(docType: string, id: string): Promise<ERPResult<ERPDocument>>;
    abstract queryDocuments(query: ERPQuery): Promise<ERPResult<ERPDocument[]>>;
    abstract createDocument(payload: ERPWritePayload): Promise<ERPResult<ERPDocument>>;
    abstract updateDocument(id: string, payload: ERPWritePayload): Promise<ERPResult<ERPDocument>>;
    abstract deleteDocument(docType: string, id: string): Promise<ERPResult<void>>;
    abstract testConnection(): Promise<ERPResult<string>>;

    get vendor(): ERPVendor {
        return this.config.vendor;
    }

    protected bearerHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.config.accessToken ?? ''}`,
            'Content-Type': 'application/json',
        };
    }

    protected basicAuth(): string {
        const user = this.config.username ?? '';
        const pass = this.config.password ?? '';
        return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }
}
