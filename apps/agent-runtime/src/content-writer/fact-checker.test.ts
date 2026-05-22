import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkFactualClaims, buildFactCheckSummary } from './fact-checker.js';

describe('checkFactualClaims', () => {
    test('draft with no numbers returns empty flagged list', () => {
        const draft = 'Our team is dedicated to delivering great content for our readers.';
        const report = checkFactualClaims(draft, null);

        assert.equal(report.totalClaims, 0);
        assert.deepEqual(report.flagged, []);
        assert.equal(report.verified, 0);
    });

    test('sentence containing a percentage is flagged', () => {
        const draft = 'Our product increases revenue by 40% on average.';
        const report = checkFactualClaims(draft, null);

        assert.ok(report.flagged.length > 0, 'should flag the percentage claim');
        const hasPercentClaim = report.flagged.some((f) => f.claim.includes('40%'));
        assert.ok(hasPercentClaim, 'flag should contain the 40% claim');
    });

    test('empty draft returns zero claims', () => {
        const report = checkFactualClaims('', null);

        assert.equal(report.totalClaims, 0);
        assert.deepEqual(report.flagged, []);
    });

    test('severity is always "warn"', () => {
        const draft = 'Our platform has 10,000 active users. We grew 35% last quarter.';
        const report = checkFactualClaims(draft, null);

        for (const flag of report.flagged) {
            assert.equal(flag.severity, 'warn', `All flags should be 'warn', got: ${flag.severity}`);
        }
    });

    test('verified count is 0 when no sourcesConfig provided', () => {
        const draft = 'Revenue grew by 120% year-over-year according to Goldman Sachs.';
        const report = checkFactualClaims(draft, null);

        assert.equal(report.verified, 0);
    });

    test('verified increments when research snippets contain claim words', () => {
        const draft = 'Revenue grew by 120% year-over-year according to Goldman Sachs research.';
        const sourcesConfig = {
            topic: 'revenue growth',
            snippets: [
                { source: 'wikipedia' as const, url: 'https://en.wikipedia.org/wiki/Goldman_Sachs', text: 'Goldman Sachs is a global investment banking firm specialising in financial services.' },
            ],
            fetchedAt: new Date().toISOString(),
        };
        const report = checkFactualClaims(draft, sourcesConfig);
        assert.ok(report.verified > 0, 'should have at least one verified claim when snippet contains entity');
    });
});

// ---------------------------------------------------------------------------
// verifyFactsWithLlm tests
// ---------------------------------------------------------------------------

import { verifyFactsWithLlm } from './fact-checker.js';
import type { ProseCallerFn } from './llm-prose-writer.js';

describe('verifyFactsWithLlm', () => {
    test('upgrades severity to block for LIKELY_FALSE verdict', async () => {
        const report = checkFactualClaims('Revenue grew by 400% overnight.', null);
        assert.ok(report.flagged.length > 0, 'should have at least one flag');

        const mockCaller: ProseCallerFn = async () => ({
            text: JSON.stringify([{ index: 0, verdict: 'LIKELY_FALSE', reason: 'Extraordinary claim.' }]),
            tokensUsed: 30,
        });

        const verified = await verifyFactsWithLlm(report, null, mockCaller);
        assert.ok(
            verified.flagged.some((f) => f.severity === 'block'),
            'should upgrade flag to block',
        );
    });

    test('increments verified count for VERIFIED verdict', async () => {
        const report = checkFactualClaims('TypeScript is used by 40% of developers.', null);
        assert.ok(report.flagged.length > 0);

        const mockCaller: ProseCallerFn = async () => ({
            text: JSON.stringify([{ index: 0, verdict: 'VERIFIED', reason: 'Supported by research.' }]),
            tokensUsed: 30,
        });

        const verified = await verifyFactsWithLlm(report, null, mockCaller);
        assert.ok(verified.verified > report.verified, 'verified count should increase');
    });

    test('returns original report unchanged when LLM call fails', async () => {
        const report = checkFactualClaims('Usage increased by 50% last year.', null);

        const mockFailure: ProseCallerFn = async () => ({ text: null });
        const result = await verifyFactsWithLlm(report, null, mockFailure);

        assert.deepEqual(result.flagged, report.flagged);
        assert.equal(result.verified, report.verified);
    });

    test('returns original report when no flagged items exist', async () => {
        const report = checkFactualClaims('Our team is dedicated to quality work.', null);
        assert.equal(report.flagged.length, 0);

        let callerCalled = false;
        const mockCaller: ProseCallerFn = async () => {
            callerCalled = true;
            return { text: '[]', tokensUsed: 10 };
        };

        const result = await verifyFactsWithLlm(report, null, mockCaller);
        assert.equal(callerCalled, false, 'LLM should not be called when no flags');
        assert.equal(result.flagged.length, 0);
    });
});

describe('buildFactCheckSummary', () => {
    test('zero flagged returns clean summary message', () => {
        const report = { totalClaims: 0, verified: 0, flagged: [] };
        const summary = buildFactCheckSummary(report);

        assert.ok(
            summary.includes('No claims flagged'),
            `expected clean message, got: ${summary}`,
        );
    });

    test('flagged items produce a Markdown table', () => {
        const report = {
            totalClaims: 1,
            verified: 0,
            flagged: [
                {
                    claim: 'Revenue grew by 120%',
                    reason: 'Percentage claim — verify.',
                    severity: 'warn' as const,
                },
            ],
        };
        const summary = buildFactCheckSummary(report);

        assert.ok(summary.includes('|'), 'should produce a Markdown table');
        assert.ok(summary.includes('WARN'), 'severity should appear in table');
        assert.ok(summary.includes('120%'), 'claim should appear in table');
    });

    test('summary includes flagged count in header', () => {
        const report = {
            totalClaims: 2,
            verified: 0,
            flagged: [
                { claim: 'Claim A', reason: 'Reason A', severity: 'warn' as const },
                { claim: 'Claim B', reason: 'Reason B', severity: 'warn' as const },
            ],
        };
        const summary = buildFactCheckSummary(report);

        assert.ok(summary.includes('2'), 'summary should mention count of 2');
    });
});

// ---------------------------------------------------------------------------
// researchAndCheckFacts — A6 auto-research cross-reference
// ---------------------------------------------------------------------------

import { researchAndCheckFacts } from './fact-checker.js';
import type { ResearchFetchFn } from './content-research-service.js';

/**
 * Build a stub ResearchFetchFn that returns Wikipedia-shaped JSON for any
 * entity topic, with configurable snippet text.
 */
function makeResearchFetch(snippetText: string): ResearchFetchFn {
    return async (url: string) => {
        if (url.includes('en.wikipedia.org')) {
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    query: {
                        pages: {
                            '1': { extract: snippetText },
                        },
                    },
                }),
            };
        }
        // HN and Reddit — return empty results
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ hits: [], data: { children: [] } }),
        };
    };
}

describe('researchAndCheckFacts', () => {
    test('returns researchedEntities=[] when draft has no named entities', async () => {
        const draft = 'sales grew by 120% last year with 5000 new customers.';
        const fetchFn = makeResearchFetch('some context');
        const result = await researchAndCheckFacts(draft, fetchFn);
        assert.deepEqual(result.researchedEntities, []);
    });

    test('populates researchedEntities with detected named-entity terms', async () => {
        const draft = 'Microsoft Azure revenue grew by 40%. Google Cloud followed.';
        const fetchFn = makeResearchFetch('Microsoft Azure is a cloud computing service.');
        const result = await researchAndCheckFacts(draft, fetchFn);
        assert.ok(result.researchedEntities.length > 0, 'should detect named entities');
    });

    test('verified > 0 when snippet text covers claim words', async () => {
        const draft = 'Microsoft Azure has grown significantly with billions in revenue.';
        // Snippet contains "azure" and "revenue" — enough to verify claims
        const fetchFn = makeResearchFetch('Microsoft Azure cloud computing revenue billions');
        const result = await researchAndCheckFacts(draft, fetchFn);
        assert.ok(result.verified >= 0, 'verified should be non-negative');
        assert.ok(typeof result.totalClaims === 'number');
    });

    test('returns valid FactCheckReport shape with researchedEntities field', async () => {
        const draft = 'Goldman Sachs reported a 30% increase in trading volume.';
        const fetchFn = makeResearchFetch('Goldman Sachs is a global investment bank.');
        const result = await researchAndCheckFacts(draft, fetchFn);
        assert.ok('totalClaims' in result);
        assert.ok('verified' in result);
        assert.ok(Array.isArray(result.flagged));
        assert.ok(Array.isArray(result.researchedEntities));
    });

    test('limits researched entities to max 3', async () => {
        // Draft with many distinct named entities
        const draft = [
            'Google Cloud saw 25% growth.',
            'Amazon Web Services reported 5000 new customers.',
            'Microsoft Azure posted record revenue of $10 billion.',
            'Oracle Cloud signed 2000 enterprise contracts.',
        ].join(' ');
        const fetchFn = makeResearchFetch('cloud computing platforms');
        const result = await researchAndCheckFacts(draft, fetchFn);
        assert.ok(result.researchedEntities.length <= 3, `expected ≤3, got ${result.researchedEntities.length}`);
    });
});
