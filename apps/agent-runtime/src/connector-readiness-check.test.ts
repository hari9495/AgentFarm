import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkConnectorReadiness, CONNECTOR_REQUIREMENTS } from './connector-readiness-check.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockOptions = {
    gatewayUrl: 'http://localhost:3000',
    sessionToken: 'test-session-token',
    workspaceId: 'ws-1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkConnectorReadiness', () => {
    it('returns ready=true for actions with no connector requirement', async () => {
        const result = await checkConnectorReadiness('run_tests', mockOptions);
        assert.equal(result.ready, true);
        assert.deepEqual(result.missing, []);
        assert.equal(result.guidance, '');
    });

    it('returns ready=true for actions not in CONNECTOR_REQUIREMENTS', async () => {
        const result = await checkConnectorReadiness('workspace_grep', mockOptions);
        assert.equal(result.ready, true);
        assert.deepEqual(result.missing, []);
    });

    it('returns ready=false when token resolution fails for required connector', async () => {
        // 'git_push' requires 'github' — but our mock gateway is not running,
        // so resolveAllConnectorTokens will fail → treated as all missing
        const result = await checkConnectorReadiness('git_push', {
            ...mockOptions,
            gatewayUrl: 'http://does-not-exist.invalid',
        });
        assert.equal(result.ready, false);
        assert.ok(result.missing.includes('github'));
        assert.ok(result.guidance.includes('GitHub'));
        assert.ok(result.guidance.includes('Settings'));
    });

    it('returns ready=false with guidance for jira actions', async () => {
        const result = await checkConnectorReadiness('create_issue', {
            ...mockOptions,
            gatewayUrl: 'http://does-not-exist.invalid',
        });
        assert.equal(result.ready, false);
        assert.ok(result.missing.includes('jira'));
        assert.ok(result.guidance.includes('Jira'));
    });

    it('CONNECTOR_REQUIREMENTS has expected entries', () => {
        assert.ok('git_push' in CONNECTOR_REQUIREMENTS);
        assert.ok('create_pr' in CONNECTOR_REQUIREMENTS);
        assert.ok('create_issue' in CONNECTOR_REQUIREMENTS);
        assert.ok(CONNECTOR_REQUIREMENTS['git_push'].includes('github'));
        assert.ok(CONNECTOR_REQUIREMENTS['create_issue'].includes('jira'));
    });

    it('returns guidance with re-submit instruction', async () => {
        const result = await checkConnectorReadiness('workspace_github_create_pr', {
            ...mockOptions,
            gatewayUrl: 'http://does-not-exist.invalid',
        });
        assert.ok(result.guidance.includes('re-submit'));
    });
});
