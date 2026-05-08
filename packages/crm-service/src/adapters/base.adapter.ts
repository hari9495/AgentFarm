import type { CRMConfig, CRMRecord, CRMQuery, CRMWritePayload, CRMResult, CRMVendor } from '@agentfarm/shared-types';

export abstract class CRMAdapter {
    constructor(protected readonly config: CRMConfig) { }

    abstract getRecord(type: string, id: string): Promise<CRMResult<CRMRecord>>;
    abstract queryRecords(query: CRMQuery): Promise<CRMResult<CRMRecord[]>>;
    abstract createRecord(payload: CRMWritePayload): Promise<CRMResult<CRMRecord>>;
    abstract updateRecord(id: string, payload: CRMWritePayload): Promise<CRMResult<CRMRecord>>;
    abstract deleteRecord(type: string, id: string): Promise<CRMResult<void>>;
    abstract testConnection(): Promise<CRMResult<string>>;

    get vendor(): CRMVendor {
        return this.config.vendor;
    }

    protected bearerHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.config.accessToken ?? ''}`,
            'Content-Type': 'application/json',
        };
    }
}
