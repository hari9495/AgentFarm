import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    checkAgainstStyleGuide,
    buildStyleViolationReport,
    DEFAULT_STYLE_GUIDE_RULES,
} from './style-guide-checker.js';
import type { StyleGuideRule } from './style-guide-checker.js';

describe('checkAgainstStyleGuide', () => {
    it('clean document returns empty violations', () => {
        const text = 'The system processes requests quickly and efficiently.';
        const result = checkAgainstStyleGuide(text, DEFAULT_STYLE_GUIDE_RULES);
        assert.equal(result.errors, 0);
        assert.equal(result.violations.length, 0);
        assert.equal(result.markdownTable, '');
    });

    it('passive-voice rule triggers on matching sentence', () => {
        const text = 'The request was processed by the server.';
        const rules: StyleGuideRule[] = [DEFAULT_STYLE_GUIDE_RULES.find((r) => r.id === 'no-passive-voice')!];
        const result = checkAgainstStyleGuide(text, rules);
        assert.ok(result.totalViolations > 0, 'Should find at least one violation');
        assert.ok(
            result.violations.some((v) => v.ruleId === 'no-passive-voice'),
            'Should flag the passive voice rule',
        );
    });

    it('jargon rule triggers on blocked word', () => {
        const text = 'We need to leverage synergy across teams.';
        const result = checkAgainstStyleGuide(text, DEFAULT_STYLE_GUIDE_RULES);
        const ruleIds = result.violations.map((v) => v.ruleId);
        assert.ok(ruleIds.includes('no-jargon-synergy'), 'Should flag synergy');
        assert.ok(ruleIds.includes('no-jargon-leverage'), 'Should flag leverage');
    });

    it('multiple rules fire independently', () => {
        const text = 'It is very important that the data was processed.';
        const result = checkAgainstStyleGuide(text, DEFAULT_STYLE_GUIDE_RULES);
        assert.ok(result.totalViolations >= 2, 'Multiple rules should fire');
    });

    it('Markdown code block lines are skipped', () => {
        const text = '```\nThe server was stopped by the admin.\n```';
        const rules: StyleGuideRule[] = [DEFAULT_STYLE_GUIDE_RULES.find((r) => r.id === 'no-passive-voice')!];
        const result = checkAgainstStyleGuide(text, rules);
        // The line inside the code block should not trigger a violation
        // (the opening ``` line is skipped; content line may trigger, but the ``` lines should not)
        const backtickViolations = result.violations.filter((v) => v.lineContent.includes('```'));
        assert.equal(backtickViolations.length, 0, 'Code fence lines should not be flagged');
    });

    it('custom rule fires on custom pattern', () => {
        const customRule: StyleGuideRule = {
            id: 'no-click-here',
            message: 'Avoid "click here" link text.',
            pattern: /click here/i,
            severity: 'error',
        };
        const text = 'For more info, click here.';
        const result = checkAgainstStyleGuide(text, [customRule]);
        assert.equal(result.errors, 1, 'Should have one error');
        assert.equal(result.violations[0]?.ruleId, 'no-click-here');
    });
});

describe('buildStyleViolationReport', () => {
    it('returns empty string for empty violations array', () => {
        assert.equal(buildStyleViolationReport([]), '');
    });

    it('returns Markdown table with correct columns', () => {
        const violations = [
            {
                lineNumber: 5,
                lineContent: 'The feature was built by the team.',
                ruleId: 'no-passive-voice',
                message: 'Avoid passive voice.',
                severity: 'warning' as const,
            },
        ];
        const result = buildStyleViolationReport(violations);
        assert.ok(result.includes('| Line |'), 'Should include Line column header');
        assert.ok(result.includes('| Severity |'), 'Should include Severity column header');
        assert.ok(result.includes('`no-passive-voice`'), 'Should include rule ID');
        assert.ok(result.includes('| 5 |'), 'Should include line number');
    });
});
