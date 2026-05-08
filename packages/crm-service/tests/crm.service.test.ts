import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { CustomerCRMStore, CRMService, CRMAdapterFactory } from '../src/crm.service.js';
import type { CRMConfig } from '@agentfarm/shared-types';

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): void {
    (globalThis.fetch as unknown as MockInstance).mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(body),
        json: async () => body,
        status,
    } as Response);
}

// ─── CustomerCRMStore tests ──────────────────────────────────────────────────

describe('CustomerCRMStore', () => {
    it('registers and retrieves config', () => {
        const store = new CustomerCRMStore();
        const cfg: CRMConfig = { vendor: 'salesforce', accessToken: 'tok', instanceUrl: 'https://sf.example.com' };
        store.registerCustomer({ customerId: 'c1', config: cfg });
        expect(store.getConfig('c1')).toEqual(cfg);
    });

    it('returns undefined for unknown customer', () => {
        const store = new CustomerCRMStore();
        expect(store.getConfig('unknown')).toBeUndefined();
    });

    it('unregisters customer', () => {
        const store = new CustomerCRMStore();
        store.registerCustomer({ customerId: 'c1', config: { vendor: 'hubspot', accessToken: 't' } });
        store.unregisterCustomer('c1');
        expect(store.hasCustomer('c1')).toBe(false);
    });

    it('lists all registered customers', () => {
        const store = new CustomerCRMStore();
        store.registerCustomer({ customerId: 'a', config: { vendor: 'zoho', accessToken: 'z' } });
        store.registerCustomer({ customerId: 'b', config: { vendor: 'pipedrive', apiKey: 'p' } });
        expect(store.listCustomers()).toEqual(expect.arrayContaining(['a', 'b']));
    });
});

// ─── CRMAdapterFactory tests ─────────────────────────────────────────────────

describe('CRMAdapterFactory', () => {
    it.each(['salesforce', 'hubspot', 'zoho', 'dynamics', 'pipedrive'] as const)('creates %s adapter', vendor => {
        const cfg: CRMConfig = {
            vendor,
            accessToken: 'tok',
            instanceUrl: 'https://example.com',
            apiKey: 'k',
        };
        const adapter = CRMAdapterFactory.create(cfg);
        expect(adapter.vendor).toBe(vendor);
    });

    it('throws on unknown vendor', () => {
        expect(() => CRMAdapterFactory.create({ vendor: 'unknown' as never })).toThrow();
    });
});

// ─── CRMService tests (mocked fetch) ────────────────────────────────────────

describe('CRMService', () => {
    let store: CustomerCRMStore;
    let service: CRMService;
    let fetchSpy: MockInstance<typeof fetch>;

    beforeEach(() => {
        store = new CustomerCRMStore();
        service = new CRMService(store);
        fetchSpy = vi.spyOn(globalThis, 'fetch') as MockInstance<typeof fetch>;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns error when customer not registered', async () => {
        const result = await service.getRecord('missing', 'Account', '001');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/No CRM config/);
    });

    it('getVendor returns null for unregistered customer', () => {
        expect(service.getVendor('none')).toBeNull();
    });

    it('getVendor returns vendor for registered customer', () => {
        store.registerCustomer({ customerId: 'c1', config: { vendor: 'salesforce', accessToken: 'tok', instanceUrl: 'https://sf.test' } });
        expect(service.getVendor('c1')).toBe('salesforce');
    });

    // ── Salesforce ────────────────────────────────────────────────────────────

    describe('Salesforce', () => {
        beforeEach(() => {
            store.registerCustomer({
                customerId: 'sf',
                config: { vendor: 'salesforce', accessToken: 'sf_tok', instanceUrl: 'https://sf.test' },
            });
        });

        it('getRecord success', async () => {
            mockFetch({ Id: '001', Name: 'Acme' });
            const result = await service.getRecord('sf', 'Account', '001');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('001');
            expect(result.vendor).toBe('salesforce');
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('sobjects/Account/001'),
                expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sf_tok' }) }),
            );
        });

        it('getRecord error on non-ok response', async () => {
            mockFetch('Not Found', 404);
            const result = await service.getRecord('sf', 'Account', 'bad');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('queryRecords success', async () => {
            mockFetch({ records: [{ Id: 'a', Name: 'Alpha' }, { Id: 'b', Name: 'Beta' }] });
            const result = await service.queryRecords('sf', { type: 'Account', fields: ['Id', 'Name'], limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createRecord success', async () => {
            mockFetch({ id: 'new001', success: true });
            const result = await service.createRecord('sf', { type: 'Account', fields: { Name: 'New Co' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('new001');
        });

        it('updateRecord success', async () => {
            mockFetch({});
            const result = await service.updateRecord('sf', '001', { type: 'Account', fields: { Name: 'Updated' } });
            expect(result.success).toBe(true);
        });

        it('deleteRecord success', async () => {
            mockFetch({}, 204);
            const result = await service.deleteRecord('sf', 'Account', '001');
            expect(result.success).toBe(true);
        });

        it('testConnection success', async () => {
            mockFetch({ MaxDailyApiRequests: { Max: 15000, Remaining: 14000 } });
            const result = await service.testConnection('sf');
            expect(result.success).toBe(true);
            expect(result.data).toMatch(/OK/);
        });

        it('handles fetch rejection', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('network error'));
            const result = await service.getRecord('sf', 'Account', '001');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/network error/);
        });
    });

    // ── HubSpot ───────────────────────────────────────────────────────────────

    describe('HubSpot', () => {
        beforeEach(() => {
            store.registerCustomer({ customerId: 'hs', config: { vendor: 'hubspot', accessToken: 'hs_tok' } });
        });

        it('getRecord success', async () => {
            mockFetch({ id: '11', properties: { name: 'HubCo' } });
            const result = await service.getRecord('hs', 'contacts', '11');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('11');
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('hubapi.com'),
                expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer hs_tok' }) }),
            );
        });

        it('queryRecords success', async () => {
            mockFetch({ results: [{ id: '1', properties: {} }, { id: '2', properties: {} }] });
            const result = await service.queryRecords('hs', { type: 'contacts', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createRecord success', async () => {
            mockFetch({ id: '99', properties: { name: 'New' } });
            const result = await service.createRecord('hs', { type: 'contacts', fields: { name: 'New' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('99');
        });

        it('updateRecord success', async () => {
            mockFetch({ id: '11', properties: { name: 'Updated' } });
            const result = await service.updateRecord('hs', '11', { type: 'contacts', fields: { name: 'Updated' } });
            expect(result.success).toBe(true);
        });

        it('deleteRecord success', async () => {
            mockFetch({}, 204);
            const result = await service.deleteRecord('hs', 'contacts', '11');
            expect(result.success).toBe(true);
        });

        it('testConnection success', async () => {
            mockFetch({ results: [] });
            const result = await service.testConnection('hs');
            expect(result.success).toBe(true);
        });
    });

    // ── Zoho ──────────────────────────────────────────────────────────────────

    describe('Zoho', () => {
        beforeEach(() => {
            store.registerCustomer({ customerId: 'zo', config: { vendor: 'zoho', accessToken: 'zo_tok' } });
        });

        it('getRecord success', async () => {
            mockFetch({ data: [{ id: 'z1', Account_Name: 'ZohoTest' }] });
            const result = await service.getRecord('zo', 'Accounts', 'z1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('z1');
        });

        it('queryRecords success', async () => {
            mockFetch({ data: [{ id: 'z1' }, { id: 'z2' }] });
            const result = await service.queryRecords('zo', { type: 'Accounts', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createRecord success', async () => {
            mockFetch({ data: [{ code: 'SUCCESS', details: { id: 'new_z', Created_Time: '2024-01-01' } }] });
            const result = await service.createRecord('zo', { type: 'Accounts', fields: { Account_Name: 'New' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('new_z');
        });
    });

    // ── Dynamics ──────────────────────────────────────────────────────────────

    describe('Dynamics', () => {
        beforeEach(() => {
            store.registerCustomer({
                customerId: 'dy',
                config: { vendor: 'dynamics', accessToken: 'dy_tok', instanceUrl: 'https://dy.test' },
            });
        });

        it('getRecord success', async () => {
            mockFetch({ accountid: 'dy1', name: 'DynCo' });
            const result = await service.getRecord('dy', 'accounts', 'dy1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('dy1');
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('dy.test'),
                expect.any(Object),
            );
        });

        it('queryRecords success', async () => {
            mockFetch({ value: [{ accountid: 'a1', name: 'A1' }] });
            const result = await service.queryRecords('dy', { type: 'accounts', limit: 1 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
        });

        it('testConnection success', async () => {
            mockFetch({ UserId: 'some-guid' });
            const result = await service.testConnection('dy');
            expect(result.success).toBe(true);
        });
    });

    // ── Pipedrive ─────────────────────────────────────────────────────────────

    describe('Pipedrive', () => {
        beforeEach(() => {
            store.registerCustomer({ customerId: 'pd', config: { vendor: 'pipedrive', apiKey: 'pd_api' } });
        });

        it('getRecord success — api_token in URL', async () => {
            mockFetch({ data: { id: 1, title: 'Deal A' } });
            const result = await service.getRecord('pd', 'deals', '1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('1');
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('api_token=pd_api'),
                expect.any(Object),
            );
        });

        it('queryRecords — null data treated as empty array', async () => {
            mockFetch({ data: null });
            const result = await service.queryRecords('pd', { type: 'deals' });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it('createRecord success', async () => {
            mockFetch({ data: { id: 55, title: 'New Deal' } });
            const result = await service.createRecord('pd', { type: 'deals', fields: { title: 'New Deal' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('55');
        });

        it('testConnection success', async () => {
            mockFetch({ data: { id: 1, name: 'User', email: 'u@test.com' } });
            const result = await service.testConnection('pd');
            expect(result.success).toBe(true);
        });
    });
});
