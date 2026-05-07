import assert from 'node:assert/strict';
import test from 'node:test';
import {
    verifyDomDiff,
    verifyScreenshotDiff,
    runAssertions,
    buildVerificationFailure,
} from './diff-verifier.js';

test('verifyDomDiff passes when expected fragment appears after action', () => {
    const result = verifyDomDiff(
        '{"nodes":["loading"]}',
        '{"nodes":["loading","confirmation"]}',
        {
            description: 'confirmation should appear',
            expectedFragment: 'confirmation',
        },
    );

    assert.equal(result.passed, true);
    assert.equal(result.beforeMatched, false);
    assert.equal(result.afterMatched, true);
});

test('verifyScreenshotDiff marks changed images', async () => {
    const before = Buffer.from('before');
    const after = Buffer.from('after');
    const result = await verifyScreenshotDiff(before, after);

    assert.equal(result.changed, true);
    assert.equal(typeof result.diffImage, 'string');
});

test('runAssertions returns false when one assertion fails', async () => {
    const outcome = await runAssertions([
        { id: 'a1', description: 'pass', evaluate: async () => true },
        { id: 'a2', description: 'fail', evaluate: async () => false },
    ]);

    assert.equal(outcome.passed, false);
    assert.equal(outcome.results.length, 2);
});

test('buildVerificationFailure returns assertion failure event', () => {
    const failure = buildVerificationFailure({
        assertionResults: [
            { id: 'a1', description: 'must pass', passed: false },
        ],
    });

    assert.equal(failure?.reason, 'assertion_failed');
});
