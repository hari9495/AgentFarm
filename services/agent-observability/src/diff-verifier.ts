import { createHash } from 'node:crypto';

export interface DomExpectation {
    description: string;
    expectedFragment: string;
}

export interface AssertionDefinition {
    id: string;
    description: string;
    evaluate: () => Promise<boolean>;
}

export interface DomDiffResult {
    passed: boolean;
    expected: string;
    beforeMatched: boolean;
    afterMatched: boolean;
}

export interface ScreenshotDiffResult {
    changed: boolean;
    ratio: number;
    diffImage?: string;
}

export interface AssertionResult {
    id: string;
    description: string;
    passed: boolean;
}

export interface VerificationFailureEvent {
    reason: 'dom_diff_mismatch' | 'screenshot_diff_mismatch' | 'assertion_failed';
    message: string;
    assertionFailures?: AssertionResult[];
}

const hashBuffer = (value: Buffer): string => createHash('sha256').update(value).digest('hex');

export const verifyDomDiff = (
    beforeDomSnapshot: string,
    afterDomSnapshot: string,
    expectation: DomExpectation,
): DomDiffResult => {
    const beforeMatched = beforeDomSnapshot.includes(expectation.expectedFragment);
    const afterMatched = afterDomSnapshot.includes(expectation.expectedFragment);
    return {
        passed: !beforeMatched && afterMatched,
        expected: expectation.description,
        beforeMatched,
        afterMatched,
    };
};

export const verifyScreenshotDiff = async (
    beforeImage: Buffer,
    afterImage: Buffer,
): Promise<ScreenshotDiffResult> => {
    if (beforeImage.length === 0 || afterImage.length === 0) {
        return { changed: false, ratio: 0 };
    }

    if (beforeImage.equals(afterImage)) {
        return { changed: false, ratio: 0 };
    }

    const beforeHash = hashBuffer(beforeImage);
    const afterHash = hashBuffer(afterImage);
    const changed = beforeHash !== afterHash;
    return {
        changed,
        ratio: changed ? 1 : 0,
        diffImage: changed
            ? `data:text/plain;base64,${Buffer.from(`before:${beforeHash}|after:${afterHash}`).toString('base64')}`
            : undefined,
    };
};

export const runAssertions = async (
    assertions: AssertionDefinition[],
): Promise<{ passed: boolean; results: AssertionResult[] }> => {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
        let passed = false;
        try {
            passed = await assertion.evaluate();
        } catch {
            passed = false;
        }

        results.push({
            id: assertion.id,
            description: assertion.description,
            passed,
        });
    }

    return {
        passed: results.every((result) => result.passed),
        results,
    };
};

export const buildVerificationFailure = (input: {
    domDiff?: DomDiffResult;
    screenshotDiff?: ScreenshotDiffResult;
    assertionResults?: AssertionResult[];
}): VerificationFailureEvent | null => {
    if (input.domDiff && !input.domDiff.passed) {
        return {
            reason: 'dom_diff_mismatch',
            message: `DOM verification failed: ${input.domDiff.expected}`,
        };
    }

    if (input.screenshotDiff && !input.screenshotDiff.changed) {
        return {
            reason: 'screenshot_diff_mismatch',
            message: 'Screenshot verification failed: no visible change detected.',
        };
    }

    const assertionFailures = (input.assertionResults ?? []).filter((item) => !item.passed);
    if (assertionFailures.length > 0) {
        return {
            reason: 'assertion_failed',
            message: `Assertion verification failed for ${assertionFailures.length} checks.`,
            assertionFailures,
        };
    }

    return null;
};
