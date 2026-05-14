import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findAndSaveProspects } from './prospect-finder.js';
import type { ILeadSourceProvider, LeadCandidate } from './lead-source-provider.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

const makeConfig = (): SalesAgentConfigRecord => ({
    id: 'cfg_1',
    tenantId: 't1',
    botId: 'bot_1',
    productDescription: 'B2B SaaS platform',
    icp: 'software, technology, engineering',
    leadSourceProvider: 'apollo',
    emailProvider: 'gmail',
    crmProvider: 'hubspot',
    calendarProvider: 'google_calendar',
    signatureProvider: 'docusign',
    emailTone: 'conversational',
    followUpDays: [3, 7, 14],
    maxProspectsPerDay: 50,
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
});

const makeProvider = (candidates: LeadCandidate[]): ILeadSourceProvider => ({
    search: async () => candidates,
    enrich: async () => null,
});

const makePrisma = (upsertSpy?: () => void) => ({
    prospect: {
        upsert: async () => {
            if (upsertSpy) upsertSpy();
            return {};
        },
    },
}) as never;

// ── findAndSaveProspects ─────────────────────────────────────────────────────

describe('findAndSaveProspects', () => {
    it('saves valid leads and returns correct counts', async () => {
        const candidates: LeadCandidate[] = [
            { firstName: 'Alice', lastName: 'Smith', email: 'alice@tech.io', company: 'Tech Inc', title: 'Engineer' },
            { firstName: 'Bob', lastName: 'Jones', email: 'bob@saas.io', company: 'Saas Co', title: 'CTO' },
        ];
        let upsertCalls = 0;
        const result = await findAndSaveProspects({
            prisma: makePrisma(() => { upsertCalls++; }),
            config: makeConfig(),
            searchParams: {},
            provider: makeProvider(candidates),
        });
        assert.equal(result.found, 2);
        assert.equal(result.saved, 2);
        assert.equal(result.skipped, 0);
        assert.equal(upsertCalls, 2);
    });

    it('skips candidates without a valid email', async () => {
        const candidates: LeadCandidate[] = [
            { firstName: 'NoEmail', lastName: 'Guy', email: '', company: 'X Corp' },
            { firstName: 'BadEmail', lastName: 'Gal', email: 'notanemail', company: 'Y Corp' },
            { firstName: 'Valid', lastName: 'User', email: 'valid@corp.io', company: 'Corp' },
        ];
        const result = await findAndSaveProspects({
            prisma: makePrisma(),
            config: makeConfig(),
            searchParams: {},
            provider: makeProvider(candidates),
        });
        assert.equal(result.found, 3);
        assert.equal(result.saved, 1);
        assert.equal(result.skipped, 2);
    });

    it('counts skipped when upsert throws', async () => {
        const candidates: LeadCandidate[] = [
            { firstName: 'Alice', lastName: 'Smith', email: 'alice@tech.io', company: 'Tech' },
        ];
        const errorPrisma = {
            prospect: {
                upsert: async () => { throw new Error('DB error'); },
            },
        } as never;
        const result = await findAndSaveProspects({
            prisma: errorPrisma,
            config: makeConfig(),
            searchParams: {},
            provider: makeProvider(candidates),
        });
        assert.equal(result.found, 1);
        assert.equal(result.saved, 0);
        assert.equal(result.skipped, 1);
    });

    it('respects the limit from config.maxProspectsPerDay via searchParams', async () => {
        let calledLimit: number | undefined;
        const provider: ILeadSourceProvider = {
            search: async (params) => { calledLimit = params.limit; return []; },
            enrich: async () => null,
        };
        await findAndSaveProspects({
            prisma: makePrisma(),
            config: makeConfig(),
            searchParams: {},
            provider,
        });
        assert.equal(calledLimit, 50); // defaults to maxProspectsPerDay
    });
});
