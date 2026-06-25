import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExtractedRuleCandidate } from '@agentfarm/shared-types';
import {
    normalizeCandidates,
    ingestPolicyDocument,
    type IngestPolicyDocumentDeps,
} from './policy-doc-ingestion.js';

// --- normalizeCandidates (pure) ----------------------------------------------

test('normalizeCandidates keeps valid rules and assigns ids', () => {
    const out = normalizeCandidates([
        { actionType: 'deploy_production', effect: 'deny', confidence: 0.9, sourceQuote: 'No prod.' },
        { actionType: 'send_email', effect: 'require_approval' },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].id, 'cand_1');
    assert.equal(out[0].effect, 'deny');
    assert.equal(out[1].confidence, 0.5, 'defaults confidence');
});

test('normalizeCandidates drops malformed rules (bad/missing effect or actionType)', () => {
    const out = normalizeCandidates([
        { actionType: 'x', effect: 'maybe' },        // bad effect
        { effect: 'deny' },                          // missing actionType
        'nonsense',
        { actionType: 'merge_pr', effect: 'allow', mode: 'read_only', connector: 'github' },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].actionType, 'merge_pr');
    assert.equal(out[0].connector, 'github');
    assert.equal(out[0].mode, 'read_only');
});

test('normalizeCandidates clamps confidence and is empty for non-arrays', () => {
    assert.deepEqual(normalizeCandidates({ rules: [] } as unknown), []);
    const out = normalizeCandidates([{ actionType: 'a', effect: 'deny', confidence: 5 }]);
    assert.equal(out[0].confidence, 1);
});

// --- ingestPolicyDocument (injected fakes) -----------------------------------

function fakePrisma(initial: Record<string, unknown> | null = null) {
    const calls: { created?: Record<string, unknown> } = {};
    const prisma = {
        policyDocument: {
            findUnique: async () => initial,
            create: async ({ data }: { data: Record<string, unknown> }) => {
                calls.created = data;
                return { id: 'doc_1', ...data };
            },
        },
    };
    return { prisma: prisma as unknown as IngestPolicyDocumentDeps['prisma'], calls };
}

const input = {
    tenantId: 't1',
    fileName: 'sec.pdf',
    mimeType: 'application/pdf',
    sha256: 'abc123',
    buffer: Buffer.from('x'),
    createdBy: 'u1',
};

test('ingest happy path: parsed, embeds, stores markdown + candidates', async () => {
    const { prisma, calls } = fakePrisma();
    let embedded = '';
    const candidates: ExtractedRuleCandidate[] = [
        { id: 'c1', actionType: 'deploy_production', effect: 'deny', confidence: 0.8 },
    ];
    const deps: IngestPolicyDocumentDeps = {
        prisma,
        convertFn: async () => '# Policy\nNo prod deploys.',
        extractRulesFn: async () => candidates,
        embedWriteFn: async (md) => { embedded = md; },
    };
    const r = await ingestPolicyDocument(input, deps);
    assert.equal(r.status, 'parsed');
    assert.equal(r.deduped, false);
    assert.equal(r.candidates.length, 1);
    assert.match(embedded, /No prod deploys/);
    assert.equal((calls.created as { extractedText: string }).extractedText, '# Policy\nNo prod deploys.');
    assert.equal((calls.created as { storageKey: string }).storageKey, 'urn:policydoc:abc123');
});

test('ingest dedups on existing (tenantId, sha256)', async () => {
    const { prisma } = fakePrisma({ id: 'existing', status: 'parsed', extractedRulesJson: [] });
    let converted = false;
    const deps: IngestPolicyDocumentDeps = {
        prisma,
        convertFn: async () => { converted = true; return 'x'; },
        extractRulesFn: async () => [],
    };
    const r = await ingestPolicyDocument(input, deps);
    assert.equal(r.deduped, true);
    assert.equal(r.id, 'existing');
    assert.equal(converted, false, 'no reconversion on dedup');
});

test('ingest marks failed when conversion throws', async () => {
    const { prisma, calls } = fakePrisma();
    const deps: IngestPolicyDocumentDeps = {
        prisma,
        convertFn: async () => { throw new Error('corrupt pdf'); },
        extractRulesFn: async () => [],
    };
    const r = await ingestPolicyDocument(input, deps);
    assert.equal(r.status, 'failed');
    assert.match((calls.created as { failureReason: string }).failureReason, /corrupt pdf/);
});

test('ingest stays parsed when extraction throws (candidates empty)', async () => {
    const { prisma } = fakePrisma();
    const deps: IngestPolicyDocumentDeps = {
        prisma,
        convertFn: async () => 'text',
        extractRulesFn: async () => { throw new Error('llm down'); },
        logger: { warn: () => {} },
    };
    const r = await ingestPolicyDocument(input, deps);
    assert.equal(r.status, 'parsed');
    assert.equal(r.candidates.length, 0);
});

test('ingest stays parsed when embedding throws (non-fatal)', async () => {
    const { prisma } = fakePrisma();
    const deps: IngestPolicyDocumentDeps = {
        prisma,
        convertFn: async () => 'text',
        extractRulesFn: async () => [{ id: 'c1', actionType: 'a', effect: 'deny', confidence: 0.5 }],
        embedWriteFn: async () => { throw new Error('embed down'); },
        logger: { warn: () => {} },
    };
    const r = await ingestPolicyDocument(input, deps);
    assert.equal(r.status, 'parsed');
    assert.equal(r.candidates.length, 1);
});
