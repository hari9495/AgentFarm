import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    getSkillHandler,
    listRegisteredSkillIds,
    SKILL_HANDLERS,
} from './skill-execution-engine.js';

// ── Registry tests ─────────────────────────────────────────────────────────────

describe('skill-execution-engine: registry', () => {
    const EXPECTED_SKILL_IDS = [
        'pr-reviewer-risk-labels',
        'code-review-summarizer',
        'pr-comment-drafter',
        'issue-autopilot',
        'branch-manager',
        'commit-diff-explainer',
        'test-coverage-reporter',
        'flaky-test-detector',
        'test-generator',
        'ci-failure-explainer',
        'dependency-audit',
        'release-notes-generator',
        'incident-patch-pack',
        'error-trace-analyzer',
        'rollback-advisor',
        'docstring-generator',
        'readme-updater',
        'api-diff-notifier',
        'slack-incident-notifier',
        'jira-issue-linker',
        'pr-description-generator',
    ];

    it('registers all 36 skill handlers', () => {
        const registered = listRegisteredSkillIds();
        assert.equal(registered.length, 36);
    });

    it('has every expected skill ID', () => {
        for (const id of EXPECTED_SKILL_IDS) {
            assert.ok(SKILL_HANDLERS[id], `Missing handler for skill: ${id}`);
        }
    });

    it('getSkillHandler returns undefined for unknown id', () => {
        assert.equal(getSkillHandler('not-a-real-skill'), undefined);
    });

    it('getSkillHandler returns handler for known id', () => {
        const handler = getSkillHandler('pr-reviewer-risk-labels');
        assert.equal(typeof handler, 'function');
    });
});

// ── pr-reviewer-risk-labels ───────────────────────────────────────────────────

describe('skill: pr-reviewer-risk-labels', () => {
    const handler = getSkillHandler('pr-reviewer-risk-labels')!;

    it('classifies high-risk files correctly', () => {
        const result = handler(
            { pr_number: '42', changed_files: ['src/auth/token-service.ts', 'src/config.ts'] },
            Date.now(),
        );
        assert.equal(result.ok, true);
        assert.equal(result.risk_level, 'high');
        assert.equal(result.requires_approval, true);
        assert.equal(result.result['recommended_label'], 'risk:high');
    });

    it('classifies low-risk files correctly', () => {
        const result = handler(
            { pr_number: '5', changed_files: ['src/utils/format.ts', 'src/types.ts'] },
            Date.now(),
        );
        assert.equal(result.risk_level, 'low');
        assert.equal(result.requires_approval, false);
    });

    it('handles empty changed_files', () => {
        const result = handler({ pr_number: '1', changed_files: [] }, Date.now());
        assert.equal(result.ok, true);
        assert.equal(result.risk_level, 'low');
    });
});

// ── code-review-summarizer ────────────────────────────────────────────────────

describe('skill: code-review-summarizer', () => {
    const handler = getSkillHandler('code-review-summarizer')!;

    it('produces a reviewer_summary string', () => {
        const result = handler(
            { pr_number: '10', title: 'Add auth middleware', changed_files: ['src/auth/index.ts'], additions: 80, deletions: 20 },
            Date.now(),
        );
        assert.equal(result.ok, true);
        assert.equal(typeof result.result['reviewer_summary'], 'string');
        assert.ok((result.result['reviewer_summary'] as string).includes('PR #10'));
    });

    it('classifies large change', () => {
        const result = handler(
            { pr_number: '99', title: 'Big refactor', changed_files: [], additions: 600, deletions: 200 },
            Date.now(),
        );
        assert.equal(result.result['change_scope'], 'large change');
    });
});

// ── pr-comment-drafter ────────────────────────────────────────────────────────

describe('skill: pr-comment-drafter', () => {
    const handler = getSkillHandler('pr-comment-drafter')!;

    it('drafts security comment', () => {
        const result = handler(
            { pr_number: '3', file_path: 'src/auth/login.ts', line_number: 42, concern_type: 'security' },
            Date.now(),
        );
        assert.equal(result.ok, true);
        assert.ok((result.result['draft_comment'] as string).includes('Security concern'));
    });

    it('defaults to general concern type', () => {
        const result = handler({ pr_number: '1', file_path: 'src/util.ts', line_number: 10 }, Date.now());
        assert.ok((result.result['draft_comment'] as string).includes('Review note'));
    });
});

// ── issue-autopilot ───────────────────────────────────────────────────────────

describe('skill: issue-autopilot', () => {
    const handler = getSkillHandler('issue-autopilot')!;

    it('generates branch name and PR title', () => {
        const result = handler(
            { issue_number: '55', issue_title: 'Fix login timeout', repo_name: 'agentfarm' },
            Date.now(),
        );
        assert.equal(result.ok, true);
        assert.ok((result.result['branch_name'] as string).includes('issue-55'));
        assert.equal(result.requires_approval, true);
    });

    it('uses feat prefix for non-bug issues', () => {
        const result = handler(
            { issue_number: '10', issue_title: 'Add dark mode' },
            Date.now(),
        );
        assert.ok((result.result['pr_title'] as string).startsWith('feat('));
    });
});

// ── branch-manager ────────────────────────────────────────────────────────────

describe('skill: branch-manager', () => {
    const handler = getSkillHandler('branch-manager')!;

    it('lists branches', () => {
        const result = handler({ action: 'list', existing_branches: ['main', 'feat/x'] }, Date.now());
        assert.equal(result.ok, true);
        assert.equal(result.result['total'], 2);
    });

    it('creates branch', () => {
        const result = handler({ action: 'create', branch_name: 'feat/new', base_branch: 'main' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok(Array.isArray(result.result['git_commands']));
    });

    it('returns error when branch_name missing for create', () => {
        const result = handler({ action: 'create' }, Date.now());
        assert.equal(result.ok, false);
    });

    it('requires approval for delete', () => {
        const result = handler({ action: 'delete', branch_name: 'old-branch' }, Date.now());
        assert.equal(result.requires_approval, true);
    });
});

// ── commit-diff-explainer ─────────────────────────────────────────────────────

describe('skill: commit-diff-explainer', () => {
    const handler = getSkillHandler('commit-diff-explainer')!;

    it('parses diff text for line counts', () => {
        const diff = `diff --git a/src/a.ts b/src/a.ts\n+const x = 1;\n+const y = 2;\n-const z = 3;`;
        const result = handler({ commit_sha: 'abc123def', diff_text: diff, author: 'alice', message: 'fix: thing' }, Date.now());
        assert.equal(result.ok, true);
        assert.equal(result.result['added_lines'], 2);
        assert.equal(result.result['removed_lines'], 1);
    });
});

// ── test-coverage-reporter ────────────────────────────────────────────────────

describe('skill: test-coverage-reporter', () => {
    const handler = getSkillHandler('test-coverage-reporter')!;

    it('passes when above threshold and no regression', () => {
        const result = handler({ pr_number: '1', base_coverage_pct: 85, head_coverage_pct: 87, threshold_pct: 80 }, Date.now());
        assert.equal(result.ok, true);
        assert.equal(result.result['status'], 'pass');
    });

    it('fails when below threshold', () => {
        const result = handler({ pr_number: '2', base_coverage_pct: 75, head_coverage_pct: 70, threshold_pct: 80 }, Date.now());
        assert.equal(result.ok, false);
        assert.equal(result.result['below_threshold'], true);
    });

    it('detects regression', () => {
        const result = handler({ pr_number: '3', base_coverage_pct: 90, head_coverage_pct: 85, threshold_pct: 80 }, Date.now());
        assert.equal(result.result['is_regression'], true);
    });
});

// ── flaky-test-detector ───────────────────────────────────────────────────────

describe('skill: flaky-test-detector', () => {
    const handler = getSkillHandler('flaky-test-detector')!;

    it('identifies flaky test with mixed results', () => {
        const runs = [
            { name: 'auth.test.ts', passed: true },
            { name: 'auth.test.ts', passed: false },
            { name: 'auth.test.ts', passed: true },
            { name: 'stable.test.ts', passed: true },
            { name: 'stable.test.ts', passed: true },
        ];
        const result = handler({ test_runs: runs, flaky_threshold_pct: 20 }, Date.now());
        assert.equal(result.ok, true);
        const flaky = result.result['flaky_tests'] as Array<{ test: string }>;
        assert.ok(flaky.some((f) => f.test === 'auth.test.ts'));
        assert.ok(!flaky.some((f) => f.test === 'stable.test.ts'));
    });

    it('returns no flaky tests when all pass', () => {
        const runs = [
            { name: 'x.test.ts', passed: true },
            { name: 'x.test.ts', passed: true },
        ];
        const result = handler({ test_runs: runs }, Date.now());
        assert.equal((result.result['flaky_count'] as number), 0);
    });
});

// ── test-generator ────────────────────────────────────────────────────────────

describe('skill: test-generator', () => {
    const handler = getSkillHandler('test-generator')!;

    it('generates node:test stub by default', () => {
        const result = handler({ file_path: 'src/utils/format.ts', function_name: 'formatDate' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok((result.result['test_code'] as string).includes("from 'node:test'"));
        assert.ok((result.result['test_code'] as string).includes('formatDate'));
    });

    it('generates jest stub when requested', () => {
        const result = handler({ file_path: 'src/calc.ts', function_name: 'add', test_framework: 'jest' }, Date.now());
        assert.ok((result.result['test_code'] as string).includes("describe('add'"));
    });

    it('uses provided edge cases', () => {
        const result = handler({ file_path: 'src/x.ts', function_name: 'fn', edge_cases: ['handles zero', 'handles negative'] }, Date.now());
        assert.ok((result.result['test_code'] as string).includes('handles zero'));
    });
});

// ── ci-failure-explainer ──────────────────────────────────────────────────────

describe('skill: ci-failure-explainer', () => {
    const handler = getSkillHandler('ci-failure-explainer')!;

    it('detects TypeScript error in log', () => {
        const result = handler(
            { log_text: 'error TS2307: Cannot find module', workflow_name: 'CI', run_id: '999' },
            Date.now(),
        );
        assert.ok((result.result['failure_categories'] as string[]).includes('TypeScript compile error'));
    });

    it('detects timeout in log', () => {
        const result = handler({ log_text: 'step timed out after 30s', workflow_name: 'CI' }, Date.now());
        assert.ok((result.result['failure_categories'] as string[]).includes('Job/step timeout'));
    });

    it('returns no patterns when log is clean', () => {
        const result = handler({ log_text: 'all good', workflow_name: 'CI' }, Date.now());
        assert.equal((result.result['failure_categories'] as string[]).length, 0);
    });
});

// ── dependency-audit ──────────────────────────────────────────────────────────

describe('skill: dependency-audit', () => {
    const handler = getSkillHandler('dependency-audit')!;

    it('flags wildcard versions as risk', () => {
        const result = handler({ dependencies: { somelib: '*' } }, Date.now());
        assert.equal(result.ok, false);
        assert.ok((result.result['risk_count'] as number) > 0);
    });

    it('flags known-outdated packages', () => {
        const result = handler({ dependencies: { moment: '2.29.4' } }, Date.now());
        assert.equal(result.ok, false);
    });

    it('passes clean dependencies', () => {
        const result = handler({ dependencies: { react: '^18.0.0' } }, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── release-notes-generator ───────────────────────────────────────────────────

describe('skill: release-notes-generator', () => {
    const handler = getSkillHandler('release-notes-generator')!;

    it('generates release notes with categories', () => {
        const prs = [
            { number: 1, title: 'feat: add dark mode', labels: [], author: 'alice' },
            { number: 2, title: 'fix: crash on login', labels: [], author: 'bob' },
        ];
        const result = handler({ from_tag: 'v1.0.0', to_tag: 'v1.1.0', merged_prs: prs }, Date.now());
        assert.equal(result.ok, true);
        const notes = result.result['release_notes'] as string;
        assert.ok(notes.includes('New Features'));
        assert.ok(notes.includes('Bug Fixes'));
    });

    it('handles empty PR list', () => {
        const result = handler({ from_tag: 'v0.1.0', to_tag: 'v0.2.0', merged_prs: [] }, Date.now());
        assert.equal(result.result['total_prs'], 0);
    });
});

// ── incident-patch-pack ───────────────────────────────────────────────────────

describe('skill: incident-patch-pack', () => {
    const handler = getSkillHandler('incident-patch-pack')!;

    it('generates patch steps', () => {
        const result = handler({ incident_id: 'INC-42', error_message: 'fatal crash', affected_service: 'agent-runtime', stack_trace: 'Error\n    at foo (src/foo.ts:10)\n    at bar (node_modules/x/index.js:5)' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok((result.result['patch_steps'] as string[]).length > 0);
    });

    it('sets severity to critical for fatal errors', () => {
        const result = handler({ incident_id: 'INC-1', error_message: 'fatal: OOM', affected_service: 'svc' }, Date.now());
        assert.equal(result.result['severity'], 'critical');
        assert.equal(result.requires_approval, true);
    });
});

// ── error-trace-analyzer ──────────────────────────────────────────────────────

describe('skill: error-trace-analyzer', () => {
    const handler = getSkillHandler('error-trace-analyzer')!;

    it('identifies null-reference pattern', () => {
        const result = handler({ error_type: 'TypeError', error_message: 'Cannot read properties of null', stack_trace: 'Error\n    at myFn (src/my.ts:5:10)\n    at node_modules/lib.js:1' }, Date.now());
        assert.ok((result.result['suggested_fix'] as string).includes('null/undefined guard'));
    });

    it('identifies ENOENT pattern', () => {
        const result = handler({ error_type: 'Error', error_message: 'ENOENT: no such file or directory', stack_trace: '' }, Date.now());
        assert.ok((result.result['suggested_fix'] as string).includes('File not found'));
    });
});

// ── rollback-advisor ──────────────────────────────────────────────────────────

describe('skill: rollback-advisor', () => {
    const handler = getSkillHandler('rollback-advisor')!;

    it('marks safe when no migrations and high error rate', () => {
        const result = handler({ deployment_id: 'd-1', current_version: 'v2', target_version: 'v1', has_db_migrations: false, has_infra_changes: false, error_rate_pct: 15 }, Date.now());
        assert.equal(result.result['is_safe'], true);
        assert.equal(result.requires_approval, false);
    });

    it('flags unsafe when DB migrations present', () => {
        const result = handler({ deployment_id: 'd-2', current_version: 'v2', target_version: 'v1', has_db_migrations: true, has_infra_changes: false, error_rate_pct: 20 }, Date.now());
        assert.equal(result.result['is_safe'], false);
        assert.equal(result.requires_approval, true);
    });
});

// ── docstring-generator ───────────────────────────────────────────────────────

describe('skill: docstring-generator', () => {
    const handler = getSkillHandler('docstring-generator')!;

    it('generates TSDoc with param annotations', () => {
        const result = handler({ function_name: 'buildUrl', function_signature: 'buildUrl(host: string, path: string): string', file_path: 'src/utils.ts' }, Date.now());
        assert.equal(result.ok, true);
        const doc = result.result['docstring'] as string;
        assert.ok(doc.includes('@param host'));
        assert.ok(doc.includes('@param path'));
        assert.ok(doc.includes('@returns'));
    });

    it('handles void return type', () => {
        const result = handler({ function_name: 'logError', function_signature: 'logError(msg: string): void' }, Date.now());
        const doc = result.result['docstring'] as string;
        assert.ok(!doc.includes('@returns'));
    });
});

// ── readme-updater ────────────────────────────────────────────────────────────

describe('skill: readme-updater', () => {
    const handler = getSkillHandler('readme-updater')!;

    it('replaces existing section', () => {
        const readme = '# Docs\n\n## Usage\n\nOld content here.\n\n## Contributing\n\nText.';
        const result = handler({ readme_content: readme, section_heading: 'Usage', new_section_content: 'New content.', file_path: 'README.md' }, Date.now());
        assert.equal(result.ok, true);
        assert.ok((result.result['updated_readme'] as string).includes('New content.'));
        assert.equal(result.result['section_found'], true);
    });

    it('appends new section when not found', () => {
        const result = handler({ readme_content: '# README\n', section_heading: 'Changelog', new_section_content: '- v1.0.0 initial', file_path: 'README.md' }, Date.now());
        assert.ok((result.result['updated_readme'] as string).includes('## Changelog'));
    });

    it('returns error when new_section_content missing', () => {
        const result = handler({ readme_content: '# README\n', section_heading: 'Usage' }, Date.now());
        assert.equal(result.ok, false);
    });
});

// ── api-diff-notifier ─────────────────────────────────────────────────────────

describe('skill: api-diff-notifier', () => {
    const handler = getSkillHandler('api-diff-notifier')!;

    it('detects removed endpoint as breaking change', () => {
        const base = { '/users': { returnType: 'User[]', params: [] } };
        const head = {};
        const result = handler({ pr_number: '7', base_api: base, head_api: head }, Date.now());
        assert.equal(result.ok, false);
        assert.equal(result.requires_approval, true);
        assert.ok((result.result['breaking_change_count'] as number) > 0);
    });

    it('detects return type change', () => {
        const base = { '/health': { returnType: 'string', params: [] } };
        const head = { '/health': { returnType: 'object', params: [] } };
        const result = handler({ pr_number: '8', base_api: base, head_api: head }, Date.now());
        assert.equal(result.ok, false);
    });

    it('passes when no changes', () => {
        const api = { '/users': { returnType: 'User[]', params: ['id'] } };
        const result = handler({ pr_number: '9', base_api: api, head_api: api }, Date.now());
        assert.equal(result.ok, true);
    });
});

// ── slack-incident-notifier ───────────────────────────────────────────────────

describe('skill: slack-incident-notifier', () => {
    const handler = getSkillHandler('slack-incident-notifier')!;

    it('formats a Slack message payload', () => {
        const result = handler({ incident_id: 'INC-99', severity: 'critical', summary: 'DB is down', affected_service: 'db', channel: '#incidents', oncall_handle: '@team' }, Date.now());
        assert.equal(result.ok, true);
        const payload = result.result['slack_payload'] as { blocks: unknown[] };
        assert.ok(Array.isArray(payload.blocks));
        assert.ok(payload.blocks.length > 0);
    });

    it('uses correct emoji for severity', () => {
        const result = handler({ incident_id: 'INC-1', severity: 'low', summary: 'Minor issue' }, Date.now());
        assert.ok(result.summary.includes('🟢'));
    });
});

// ── jira-issue-linker ─────────────────────────────────────────────────────────

describe('skill: jira-issue-linker', () => {
    const handler = getSkillHandler('jira-issue-linker')!;

    it('generates Jira API calls for PR link', () => {
        const result = handler({ jira_key: 'PROJ-42', pr_number: '15', transition_to: 'In Review' }, Date.now());
        assert.equal(result.ok, true);
        const calls = result.result['jira_api_calls'] as Array<{ purpose: string }>;
        assert.ok(calls.some((c) => c.purpose.includes('PROJ-42')));
    });

    it('returns error when jira_key missing', () => {
        const result = handler({ pr_number: '10' }, Date.now());
        assert.equal(result.ok, false);
    });
});

// ── pr-description-generator ──────────────────────────────────────────────────

describe('skill: pr-description-generator', () => {
    const handler = getSkillHandler('pr-description-generator')!;

    it('generates a structured PR description', () => {
        const result = handler({ pr_title: 'feat: add search', changed_files: ['src/search.ts'], commits: ['feat: add search endpoint', 'test: search tests'], issue_ref: '#42' }, Date.now());
        assert.equal(result.ok, true);
        const desc = result.result['description'] as string;
        assert.ok(desc.includes('feat: add search'));
        assert.ok(desc.includes('Closes #42'));
        assert.ok(desc.includes('AgentFarm'));
    });

    it('flags breaking changes', () => {
        const result = handler({ pr_title: 'break!: remove API', commits: ['break!: remove legacy endpoint'], changed_files: [] }, Date.now());
        assert.equal(result.result['is_breaking'], true);
        assert.equal(result.requires_approval, true);
    });
});

// ── duration_ms sanity ────────────────────────────────────────────────────────

describe('skill-execution-engine: duration_ms', () => {
    it('every handler returns a non-negative duration_ms', () => {
        const ids = listRegisteredSkillIds();
        for (const id of ids) {
            const handler = getSkillHandler(id)!;
            const result = handler({}, Date.now() - 1);
            assert.ok(result.duration_ms >= 0, `${id}: expected duration_ms >= 0, got ${result.duration_ms}`);
        }
    });

    it('every handler returns a string skill_id matching the registry key', () => {
        for (const [id, handler] of Object.entries(SKILL_HANDLERS)) {
            const result = handler({}, Date.now());
            assert.equal(result.skill_id, id, `Handler for ${id} returned mismatched skill_id "${result.skill_id}"`);
        }
    });
});
