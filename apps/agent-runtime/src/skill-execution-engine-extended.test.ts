import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    getSkillHandler,
    listRegisteredSkillIds,
    SKILL_HANDLERS,
} from './skill-execution-engine.js';

// ── Registry: 38 skills ────────────────────────────────────────────────────

describe('skill-execution-engine: 38-skill registry', () => {
    const ALL_SKILL_IDS = [
        // Original 21
        'pr-reviewer-risk-labels', 'code-review-summarizer', 'pr-comment-drafter',
        'issue-autopilot', 'branch-manager', 'commit-diff-explainer',
        'test-coverage-reporter', 'flaky-test-detector', 'test-generator',
        'ci-failure-explainer', 'dependency-audit', 'release-notes-generator',
        'incident-patch-pack', 'error-trace-analyzer', 'rollback-advisor',
        'docstring-generator', 'readme-updater', 'api-diff-notifier',
        'slack-incident-notifier', 'jira-issue-linker', 'pr-description-generator',
        // Skills 22-36
        'stale-pr-detector', 'test-name-reviewer', 'migration-risk-scorer',
        'changelog-diff-validator', 'env-var-auditor', 'openapi-spec-linter',
        'monorepo-dep-graph', 'dead-code-detector', 'code-churn-analyzer',
        'pr-size-enforcer', 'commit-message-linter', 'accessibility-checker',
        'type-coverage-reporter', 'license-compliance-check', 'docker-image-scanner',
        // Skills 37-38
        'secrets-scanner', 'refactor-advisor',
    ];

    it('registers exactly 38 skill handlers', () => {
        assert.equal(listRegisteredSkillIds().length, 38);
    });

    it('has a handler for every expected skill id', () => {
        for (const id of ALL_SKILL_IDS) {
            assert.ok(SKILL_HANDLERS[id], `Missing handler for skill: ${id}`);
        }
    });

    it('returns undefined for unknown skill', () => {
        assert.equal(getSkillHandler('ghost-skill'), undefined);
    });
});

// ── stale-pr-detector ──────────────────────────────────────────────────────

describe('skill: stale-pr-detector', () => {
    const handler = getSkillHandler('stale-pr-detector')!;

    it('detects stale PRs when days > threshold', () => {
        // The handler scans fake PRs with days_since_update > stale_threshold_days
        // Default threshold is 14 days; fake PRs have 18, 22, 7 days
        const result = handler({ stale_threshold_days: 14 }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(Array.isArray(result.result['stale_prs']), 'stale_prs should be an array');
        assert.ok((result.result['stale_prs'] as unknown[]).length >= 2, 'should detect 2 stale PRs with 14-day threshold');
    });

    it('not stale when threshold is higher than all PR ages', () => {
        // With threshold=30, all fake PRs (18, 22, 7 days) are within threshold
        const result = handler({ stale_threshold_days: 30 }, Date.now());
        assert.ok(Array.isArray(result.result['stale_prs']));
        assert.equal((result.result['stale_prs'] as unknown[]).length, 0);
    });

    it('returns summary string', () => {
        const result = handler({}, Date.now());
        assert.equal(typeof result.summary, 'string');
        assert.ok(result.summary.length > 0);
    });
});

// ── test-name-reviewer ─────────────────────────────────────────────────────

describe('skill: test-name-reviewer', () => {
    const handler = getSkillHandler('test-name-reviewer')!;

    it('flags bad test names', () => {
        const result = handler({ test_names: ['test1', 'foo', 'doSomething'] }, Date.now());
        assert.equal(result.ok, true);
        // result.issues contains all evaluated names; result.failing is the count with issues
        assert.ok(Array.isArray(result.result['issues']), 'issues should be an array');
        assert.ok((result.result['failing'] as number) >= 1, 'should flag at least one bad name');
    });

    it('accepts well-named tests', () => {
        const result = handler({ test_names: ['returns 200 when valid input', 'throws when token is expired'] }, Date.now());
        assert.equal(result.ok, true);
    });

    it('handles empty list', () => {
        const result = handler({ test_names: [] }, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── migration-risk-scorer ─────────────────────────────────────────────────

describe('skill: migration-risk-scorer', () => {
    const handler = getSkillHandler('migration-risk-scorer')!;

    it('scores high for destructive migrations', () => {
        const result = handler({ migration_content: 'DROP TABLE users; ALTER TABLE accounts' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(typeof result.result['score'] === 'number');
        assert.ok((result.result['score'] as number) >= 40, 'DROP should score high');
    });

    it('scores low for simple additive migrations', () => {
        const result = handler({ migration_content: 'CREATE TABLE new_feature_flags (id INT PRIMARY KEY)' }, Date.now());
        const score = result.result['score'] as number;
        assert.ok(score < 30, `Expected score < 30, got ${score}`);
    });

    it('returns risk_level string', () => {
        const result = handler({}, Date.now());
        assert.equal(typeof result.result['risk_level'], 'string');
    });
});

// ── changelog-diff-validator ──────────────────────────────────────────────

describe('skill: changelog-diff-validator', () => {
    const handler = getSkillHandler('changelog-diff-validator')!;

    it('validates changelog exists when updated', () => {
        const result = handler({ changelog_updated: true, commits: ['chore: bump version to 1.2.0', 'fix: null ptr'] }, Date.now());
        assert.equal(result.ok, true);
    });

    it('flags missing changelog update when version-bump commits present', () => {
        const result = handler({ changelog_updated: false, commits: ['chore: bump version to 1.2.0'] }, Date.now());
        assert.equal(result.ok, false, 'should fail when version bump commit found but changelog not updated');
        assert.ok(result.result['needs_update'] === true);
    });
});

// ── env-var-auditor ───────────────────────────────────────────────────────

describe('skill: env-var-auditor', () => {
    const handler = getSkillHandler('env-var-auditor')!;

    it('detects missing required vars', () => {
        const result = handler({
            required_vars: ['DATABASE_URL', 'SECRET_KEY', 'API_TOKEN'],
            present_vars: ['DATABASE_URL'],
            service: 'api-gateway',
        }, Date.now());
        assert.equal(result.ok, false, 'should fail when required vars are missing');
        assert.ok(Array.isArray(result.result['missing']));
        assert.ok((result.result['missing'] as string[]).length >= 2);
    });

    it('passes when all required vars are present', () => {
        const result = handler({
            required_vars: ['DATABASE_URL'],
            present_vars: ['DATABASE_URL', 'EXTRA_VAR'],
            service: 'agent-runtime',
        }, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── openapi-spec-linter ───────────────────────────────────────────────────

describe('skill: openapi-spec-linter', () => {
    const handler = getSkillHandler('openapi-spec-linter')!;

    it('returns lint results for a spec path', () => {
        const result = handler({ spec_path: 'openapi.yaml' }, Date.now());
        assert.equal(result.ok, true);
        assert.equal(typeof result.summary, 'string');
    });

    it('handles missing spec gracefully', () => {
        const result = handler({}, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── monorepo-dep-graph ────────────────────────────────────────────────────

describe('skill: monorepo-dep-graph', () => {
    const handler = getSkillHandler('monorepo-dep-graph')!;

    it('returns a dep graph structure', () => {
        const result = handler({ root_dir: '.' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(typeof result.result === 'object');
    });
});

// ── dead-code-detector ────────────────────────────────────────────────────

describe('skill: dead-code-detector', () => {
    const handler = getSkillHandler('dead-code-detector')!;

    it('returns dead_symbols array', () => {
        const result = handler({ target_dir: 'src/' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(Array.isArray(result.result['dead_symbols']), 'dead_symbols should be an array');
    });
});

// ── code-churn-analyzer ───────────────────────────────────────────────────

describe('skill: code-churn-analyzer', () => {
    const handler = getSkillHandler('code-churn-analyzer')!;

    it('returns churn metrics', () => {
        const result = handler({ repo: 'org/repo', days: 30 }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(typeof result.result === 'object');
    });

    it('handles missing repo gracefully', () => {
        const result = handler({}, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── pr-size-enforcer ──────────────────────────────────────────────────────

describe('skill: pr-size-enforcer', () => {
    const handler = getSkillHandler('pr-size-enforcer')!;

    it('flags oversized PRs', () => {
        const result = handler({ lines_changed: 800, files_changed: 5, max_lines: 500 }, Date.now());
        assert.equal(result.ok, false, 'oversized PR should have ok=false');
        assert.equal(result.result['oversized'], true);
    });

    it('passes appropriately-sized PRs', () => {
        const result = handler({ lines_changed: 100, files_changed: 3, max_lines: 500 }, Date.now());
        assert.equal(result.result['oversized'], false);
    });

    it('uses default threshold when max_lines not provided', () => {
        const result = handler({ lines_changed: 50, files_changed: 2 }, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── commit-message-linter ─────────────────────────────────────────────────

describe('skill: commit-message-linter', () => {
    const handler = getSkillHandler('commit-message-linter')!;

    it('passes conventional commit format', () => {
        const result = handler({ messages: ['feat(auth): add OAuth2 support'] }, Date.now());
        assert.equal(result.ok, true);
        const results = result.result['results'] as Array<{ valid: boolean }>;
        assert.ok(Array.isArray(results));
        assert.equal(results[0].valid, true);
    });

    it('fails non-conventional message', () => {
        const result = handler({ messages: ['fixed stuff'] }, Date.now());
        const results = result.result['results'] as Array<{ valid: boolean }>;
        assert.equal(results[0].valid, false);
    });

    it('handles empty messages array', () => {
        const result = handler({ messages: [] }, Date.now());
        assert.equal(result.ok, true);
        assert.equal(result.result['total'], 0);
    });
});

// ── accessibility-checker ─────────────────────────────────────────────────

describe('skill: accessibility-checker', () => {
    const handler = getSkillHandler('accessibility-checker')!;

    it('returns a11y audit results', () => {
        const result = handler({ url: 'http://localhost:3000', page: '/' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(typeof result.result === 'object');
    });
});

// ── type-coverage-reporter ────────────────────────────────────────────────

describe('skill: type-coverage-reporter', () => {
    const handler = getSkillHandler('type-coverage-reporter')!;

    it('returns coverage_pct as a number', () => {
        const result = handler({ target_dir: 'src/' }, Date.now());
        assert.equal(result.ok, false); // estimatedCoverage=87.4 < default minCoveragePct=90
        assert.ok(typeof result.result['coverage_pct'] === 'number', 'coverage_pct should be a number');
    });
});

// ── license-compliance-check ──────────────────────────────────────────────

describe('skill: license-compliance-check', () => {
    const handler = getSkillHandler('license-compliance-check')!;

    it('returns compliance report', () => {
        const result = handler({ project_root: '.' }, Date.now());
        // The handler always scans fake packages including gpl-lib (GPL-3.0) which violates MIT/Apache allowlist
        assert.ok(typeof result.result === 'object');
        assert.ok(typeof result.result['packages_checked'] === 'number');
    });
});

// ── docker-image-scanner ──────────────────────────────────────────────────

describe('skill: docker-image-scanner', () => {
    const handler = getSkillHandler('docker-image-scanner')!;

    it('scans an image reference', () => {
        const result = handler({ image_name: 'node:20-alpine' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(typeof result.result === 'object');
        assert.ok(typeof result.result['image'] === 'string');
    });

    it('returns findings array', () => {
        const result = handler({ image_name: 'ubuntu:22.04' }, Date.now());
        assert.ok(Array.isArray(result.result['vulnerabilities']) || typeof result.result['vulnerabilities_count'] === 'number');
    });
});
