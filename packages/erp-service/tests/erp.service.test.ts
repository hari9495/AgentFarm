import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { CustomerERPStore, ERPService, ERPAdapterFactory } from '../src/erp.service.js';
import { loadERPConfigFromEnv } from '../src/config/erp-config.js';
import type { ERPConfig } from '@agentfarm/shared-types';

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}): void {
    (globalThis.fetch as unknown as MockInstance).mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
        json: async () => body,
        headers: {
            get: (name: string) => headers[name.toLowerCase()] ?? null,
        },
    } as unknown as Response);
}

// ─── CustomerERPStore tests ──────────────────────────────────────────────────

describe('CustomerERPStore', () => {
    it('registers and retrieves config', () => {
        const store = new CustomerERPStore();
        const cfg: ERPConfig = { vendor: 'sap', baseUrl: 'https://sap.example.com', accessToken: 'tok' };
        store.registerCustomer({ customerId: 'c1', config: cfg });
        expect(store.getConfig('c1')).toEqual(cfg);
    });

    it('returns undefined for unknown customer', () => {
        const store = new CustomerERPStore();
        expect(store.getConfig('unknown')).toBeUndefined();
    });

    it('unregisters customer', () => {
        const store = new CustomerERPStore();
        store.registerCustomer({ customerId: 'c1', config: { vendor: 'oracle', baseUrl: 'https://oracle.test' } });
        store.unregisterCustomer('c1');
        expect(store.hasCustomer('c1')).toBe(false);
    });

    it('lists all registered customers', () => {
        const store = new CustomerERPStore();
        store.registerCustomer({ customerId: 'a', config: { vendor: 'sap', baseUrl: 'https://s.test' } });
        store.registerCustomer({ customerId: 'b', config: { vendor: 'odoo', baseUrl: 'https://o.test' } });
        expect(store.listCustomers()).toEqual(expect.arrayContaining(['a', 'b']));
    });
});

// ─── ERPAdapterFactory tests ──────────────────────────────────────────────────

describe('ERPAdapterFactory', () => {
    it.each(['sap', 'oracle', 'dynamics365', 'netsuite', 'odoo'] as const)('creates %s adapter', vendor => {
        const cfg: ERPConfig = { vendor, baseUrl: 'https://erp.test', accessToken: 'tok' };
        const adapter = ERPAdapterFactory.create(cfg);
        expect(adapter.vendor).toBe(vendor);
    });

    it('throws on unknown vendor', () => {
        expect(() => ERPAdapterFactory.create({ vendor: 'unknown' as never, baseUrl: 'x' })).toThrow();
    });
});

// ─── ERPService tests (mocked fetch) ─────────────────────────────────────────

describe('ERPService', () => {
    let store: CustomerERPStore;
    let service: ERPService;
    let fetchSpy: MockInstance<typeof fetch>;

    beforeEach(() => {
        store = new CustomerERPStore();
        service = new ERPService(store);
        fetchSpy = vi.spyOn(globalThis, 'fetch') as MockInstance<typeof fetch>;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns error when customer not registered', async () => {
        const result = await service.getDocument('missing', 'SalesOrder', '1');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/No ERP config/);
    });

    it('getVendor returns null for unregistered customer', () => {
        expect(service.getVendor('none')).toBeNull();
    });

    it('getVendor returns vendor for registered customer', () => {
        store.registerCustomer({ customerId: 'c1', config: { vendor: 'sap', baseUrl: 'https://sap.test' } });
        expect(service.getVendor('c1')).toBe('sap');
    });

    // ── SAP ───────────────────────────────────────────────────────────────────

    describe('SAP', () => {
        beforeEach(() => {
            store.registerCustomer({ customerId: 'sap', config: { vendor: 'sap', baseUrl: 'https://sap.test', accessToken: 'sap_tok' } });
        });

        it('getDocument success', async () => {
            mockFetch({ ID: 'so1', OrderType: 'OR' });
            const result = await service.getDocument('sap', 'SalesOrder', 'so1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('so1');
            expect(result.vendor).toBe('sap');
        });

        it('getDocument error on non-ok response', async () => {
            mockFetch('Not Found', 404);
            const result = await service.getDocument('sap', 'SalesOrder', 'bad');
            expect(result.success).toBe(false);
        });

        it('queryDocuments success', async () => {
            mockFetch({ value: [{ ID: 's1' }, { ID: 's2' }] });
            const result = await service.queryDocuments('sap', { docType: 'SalesOrder', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createDocument — fetches CSRF token then POSTs', async () => {
            // First call: CSRF fetch
            mockFetch({}, 200, { 'x-csrf-token': 'csrf_abc' });
            // Second call: actual POST
            mockFetch({ ID: 'new_so', OrderType: 'OR' });
            const result = await service.createDocument('sap', { docType: 'SalesOrder', fields: { OrderType: 'OR' } });
            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            const [, secondCallOpts] = fetchSpy.mock.calls[1] as [string, RequestInit];
            expect((secondCallOpts.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf_abc');
        });

        it('updateDocument — fetches CSRF token then PATCHes', async () => {
            mockFetch({}, 200, { 'x-csrf-token': 'csrf_upd' });
            mockFetch({}, 204);
            const result = await service.updateDocument('sap', 'so1', { docType: 'SalesOrder', fields: { Status: 'C' } });
            expect(result.success).toBe(true);
        });

        it('deleteDocument — fetches CSRF token then DELETEs', async () => {
            mockFetch({}, 200, { 'x-csrf-token': 'csrf_del' });
            mockFetch({}, 204);
            const result = await service.deleteDocument('sap', 'SalesOrder', 'so1');
            expect(result.success).toBe(true);
        });

        it('testConnection success', async () => {
            mockFetch({});
            const result = await service.testConnection('sap');
            expect(result.success).toBe(true);
            expect(result.data).toMatch(/OK/);
        });

        it('handles fetch rejection', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('network error'));
            const result = await service.getDocument('sap', 'SalesOrder', 'so1');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/network error/);
        });
    });

    // ── Oracle ────────────────────────────────────────────────────────────────

    describe('Oracle', () => {
        beforeEach(() => {
            store.registerCustomer({
                customerId: 'ora',
                config: { vendor: 'oracle', baseUrl: 'https://oracle.test', username: 'u', password: 'p' },
            });
        });

        it('getDocument success', async () => {
            mockFetch({ Id: 'inv1', InvoiceNumber: '1001' });
            const result = await service.getDocument('ora', 'invoices', 'inv1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('inv1');
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('oracle.test'),
                expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining('Basic ') }) }),
            );
        });

        it('queryDocuments success', async () => {
            mockFetch({ items: [{ Id: 'i1' }, { Id: 'i2' }] });
            const result = await service.queryDocuments('ora', { docType: 'invoices', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createDocument success', async () => {
            mockFetch({ Id: 'new_inv' });
            const result = await service.createDocument('ora', { docType: 'invoices', fields: { InvoiceNumber: '1002' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('new_inv');
        });

        it('testConnection success', async () => {
            mockFetch({ items: [] });
            const result = await service.testConnection('ora');
            expect(result.success).toBe(true);
        });
    });

    // ── Dynamics 365 ─────────────────────────────────────────────────────────

    describe('Dynamics365', () => {
        beforeEach(() => {
            store.registerCustomer({
                customerId: 'd365',
                config: { vendor: 'dynamics365', baseUrl: 'https://d365.test', accessToken: 'd365_tok' },
            });
        });

        it('getDocument success', async () => {
            mockFetch({ RecId: '100', AccountNum: 'CUST001' });
            const result = await service.getDocument('d365', 'CustTable', '100');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('100');
        });

        it('queryDocuments success', async () => {
            mockFetch({ value: [{ RecId: 'r1' }, { RecId: 'r2' }] });
            const result = await service.queryDocuments('d365', { docType: 'CustTable', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('testConnection success', async () => {
            mockFetch('<edmx:Edmx />', 200);
            const result = await service.testConnection('d365');
            expect(result.success).toBe(true);
        });
    });

    // ── NetSuite ──────────────────────────────────────────────────────────────

    describe('NetSuite', () => {
        beforeEach(() => {
            store.registerCustomer({
                customerId: 'ns',
                config: { vendor: 'netsuite', baseUrl: 'https://ns.test', accessToken: 'ns_tok' },
            });
        });

        it('getDocument success', async () => {
            mockFetch({ id: 'ns1', entityId: 'CUST001' });
            const result = await service.getDocument('ns', 'customer', 'ns1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('ns1');
        });

        it('queryDocuments success', async () => {
            mockFetch({ items: [{ id: 'n1' }, { id: 'n2' }] });
            const result = await service.queryDocuments('ns', { docType: 'customer', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createDocument parses Location header for id', async () => {
            // NetSuite returns 204 + Location header
            mockFetch(null, 204, { location: 'https://ns.test/services/rest/record/v1/customer/new_ns1' });
            const result = await service.createDocument('ns', { docType: 'customer', fields: { entityId: 'NEW' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('new_ns1');
        });

        it('testConnection success', async () => {
            mockFetch({ items: [] });
            const result = await service.testConnection('ns');
            expect(result.success).toBe(true);
        });
    });

    // ── Odoo ──────────────────────────────────────────────────────────────────

    describe('Odoo', () => {
        beforeEach(() => {
            store.registerCustomer({
                customerId: 'oo',
                config: { vendor: 'odoo', baseUrl: 'https://oo.test', username: 'admin', password: 'pass', companyId: 'mydb' },
            });
        });

        it('getDocument success via JSON-RPC read', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: [{ id: 1, name: 'Partner A' }] });
            const result = await service.getDocument('oo', 'res.partner', '1');
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('1');
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('jsonrpc'),
                expect.objectContaining({ method: 'POST' }),
            );
        });

        it('getDocument returns error when record not found', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: [] });
            const result = await service.getDocument('oo', 'res.partner', '999');
            expect(result.success).toBe(false);
        });

        it('queryDocuments success via JSON-RPC search_read', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: [{ id: 1 }, { id: 2 }] });
            const result = await service.queryDocuments('oo', { docType: 'res.partner', limit: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
        });

        it('createDocument success via JSON-RPC create', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: 42 });
            const result = await service.createDocument('oo', { docType: 'res.partner', fields: { name: 'New Co' } });
            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('42');
        });

        it('updateDocument success via JSON-RPC write', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: true });
            const result = await service.updateDocument('oo', '1', { docType: 'res.partner', fields: { name: 'Updated' } });
            expect(result.success).toBe(true);
        });

        it('deleteDocument success via JSON-RPC unlink', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: true });
            const result = await service.deleteDocument('oo', 'res.partner', '1');
            expect(result.success).toBe(true);
        });

        it('testConnection success via JSON-RPC authenticate', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, result: 1 });
            const result = await service.testConnection('oo');
            expect(result.success).toBe(true);
        });

        it('handles RPC error response', async () => {
            mockFetch({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Access Denied', data: {} } });
            const result = await service.testConnection('oo');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Access Denied/);
        });
    });
});

// ─── loadERPConfigFromEnv tests ───────────────────────────────────────────────

describe('loadERPConfigFromEnv', () => {
    it('returns undefined when ERP_VENDOR not set', () => {
        expect(loadERPConfigFromEnv({})).toBeUndefined();
    });

    it('returns undefined when ERP_BASE_URL not set', () => {
        expect(loadERPConfigFromEnv({ ERP_VENDOR: 'sap' })).toBeUndefined();
    });

    it('builds config from env', () => {
        const cfg = loadERPConfigFromEnv({
            ERP_VENDOR: 'oracle',
            ERP_BASE_URL: 'https://oracle.test',
            ERP_USERNAME: 'u',
            ERP_PASSWORD: 'p',
        });
        expect(cfg?.vendor).toBe('oracle');
        expect(cfg?.baseUrl).toBe('https://oracle.test');
        expect(cfg?.username).toBe('u');
        expect(cfg?.password).toBe('p');
    });

    it('does not include undefined keys in returned config', () => {
        const cfg = loadERPConfigFromEnv({ ERP_VENDOR: 'netsuite', ERP_BASE_URL: 'https://ns.test', ERP_ACCESS_TOKEN: 'tok' });
        expect(cfg).not.toHaveProperty('username');
        expect(cfg?.accessToken).toBe('tok');
    });
});
