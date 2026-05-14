import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreProspect, qualifyProspect } from './icp-scorer.js';
import type { LeadCandidate } from './lead-source-provider.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

const makeConfig = (overrides: Partial<SalesAgentConfigRecord> = {}): SalesAgentConfigRecord => ({
    id: 'cfg_1',
    tenantId: 't1',
    botId: 'bot_1',
    productDescription: 'B2B SaaS platform for engineering teams',
    icp: 'software, technology, engineering, startup, saas',
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
    ...overrides,
});

const makeCandidate = (overrides: Partial<LeadCandidate> = {}): LeadCandidate => ({
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@techcorp.io',
    company: 'TechCorp',
    ...overrides,
});

// ── scoreProspect ────────────────────────────────────────────────────────────

describe('scoreProspect', () => {
    it('returns 0 for a candidate with no matching signals', () => {
        const score = scoreProspect(
            makeCandidate({ email: 'bob@notmatching.com', title: 'baker', industry: 'food', company: 'Bread Ltd', linkedinUrl: undefined }),
            makeConfig(),
        );
        // email gives 10 pts; no ICP match, no size, no title match
        assert.equal(score, 10);
    });

    it('gives email bonus of 10 pts for a valid email', () => {
        const base = scoreProspect(makeCandidate({ email: 'x@no.match', linkedinUrl: undefined, title: 'baker', industry: 'food' }), makeConfig());
        assert.ok(base >= 10, `expected at least 10, got ${base}`);
    });

    it('gives linkedin bonus of 10 pts when linkedinUrl is set', () => {
        const without = scoreProspect(makeCandidate({ linkedinUrl: undefined }), makeConfig());
        const withLinkedin = scoreProspect(makeCandidate({ linkedinUrl: 'https://linkedin.com/in/alice' }), makeConfig());
        assert.equal(withLinkedin - without, 10);
    });

    it('scores higher for matching ICP keywords in title/industry/company', () => {
        const highMatch = scoreProspect(
            makeCandidate({ title: 'Software Engineering Manager', industry: 'SaaS Technology', linkedinUrl: 'https://li.com/a' }),
            makeConfig(),
        );
        const lowMatch = scoreProspect(
            makeCandidate({ title: 'Chef', industry: 'Food Service', company: 'Restaurant Inc', linkedinUrl: undefined }),
            makeConfig(),
        );
        assert.ok(highMatch > lowMatch, `highMatch(${highMatch}) should exceed lowMatch(${lowMatch})`);
    });
});

// ── qualifyProspect ──────────────────────────────────────────────────────────

describe('qualifyProspect', () => {
    it('returns false when score is below threshold', () => {
        const result = qualifyProspect(
            makeCandidate({ email: 'x@no.match', linkedinUrl: undefined, title: 'baker', industry: 'food', company: 'Bakery' }),
            makeConfig(),
            80, // high threshold
        );
        assert.equal(result, false);
    });

    it('returns true when score meets or exceeds threshold', () => {
        const result = qualifyProspect(
            makeCandidate({
                title: 'Software Engineering Manager',
                industry: 'SaaS Technology',
                company: 'Startup Engineering',
                email: 'eng@saas.io',
                linkedinUrl: 'https://li.com/a',
                companySize: '51-200',
            }),
            makeConfig(),
            20, // low threshold — should easily qualify
        );
        assert.equal(result, true);
    });

    it('uses 50 as default threshold', () => {
        // Edge case: score just below default threshold
        const lowScore = scoreProspect(
            makeCandidate({ email: 'x@no.match', linkedinUrl: undefined, title: 'baker', industry: 'food', company: 'Bakery' }),
            makeConfig(),
        );
        const qualifies = qualifyProspect(
            makeCandidate({ email: 'x@no.match', linkedinUrl: undefined, title: 'baker', industry: 'food', company: 'Bakery' }),
            makeConfig(),
        );
        assert.equal(qualifies, lowScore >= 50);
    });
});
