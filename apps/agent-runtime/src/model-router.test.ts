import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeModelForTask, resolveModelProfileForTask } from './model-router.js';

describe('routeModelForTask', () => {
    it('routes code_edit to anthropic quality_first', () => {
        const result = routeModelForTask('code_edit', 'openai', 'cost_balanced');
        assert.equal(result.provider, 'anthropic');
        assert.equal(result.profile, 'quality_first');
        assert.equal(result.overridden, true);
    });

    it('routes workspace_generate_test to anthropic quality_first', () => {
        const result = routeModelForTask('workspace_generate_test', 'agentfarm', 'cost_balanced');
        assert.equal(result.provider, 'anthropic');
        assert.equal(result.profile, 'quality_first');
    });

    it('routes workspace_security_scan to openai quality_first', () => {
        const result = routeModelForTask('workspace_security_scan', 'anthropic', 'cost_balanced');
        assert.equal(result.provider, 'openai');
        assert.equal(result.profile, 'quality_first');
        assert.equal(result.overridden, true);
    });

    it('routes workspace_grep to workspace provider with speed_first', () => {
        const result = routeModelForTask('workspace_grep', 'agentfarm', 'quality_first');
        assert.equal(result.provider, 'agentfarm');
        assert.equal(result.profile, 'speed_first');
        assert.equal(result.overridden, true);
    });

    it('does not override for workspace_list_files with speed_first already set', () => {
        const result = routeModelForTask('workspace_list_files', 'openai', 'speed_first');
        assert.equal(result.provider, 'openai');
        assert.equal(result.profile, 'speed_first');
        assert.equal(result.overridden, false);
    });

    it('returns workspace default for unclassified actions', () => {
        const result = routeModelForTask('run_tests', 'anthropic', 'cost_balanced');
        assert.equal(result.provider, 'anthropic');
        assert.equal(result.profile, 'cost_balanced');
        assert.equal(result.overridden, false);
    });

    it('always includes a reason string', () => {
        const result = routeModelForTask('code_edit_patch', 'openai', 'cost_balanced');
        assert.ok(result.reason.length > 0);
    });

    it('routes workspace_autonomous_plan_execute to anthropic', () => {
        const result = routeModelForTask('workspace_autonomous_plan_execute', 'openai', 'cost_balanced');
        assert.equal(result.provider, 'anthropic');
        assert.equal(result.profile, 'quality_first');
    });
});

describe('resolveModelProfileForTask', () => {
    it('returns quality_first for code actions', () => {
        assert.equal(resolveModelProfileForTask('workspace_fix_test_failures', 'cost_balanced'), 'quality_first');
    });

    it('returns speed_first for cheap actions', () => {
        assert.equal(resolveModelProfileForTask('workspace_read_file', 'quality_first'), 'speed_first');
    });

    it('returns workspace profile for unknown actions', () => {
        assert.equal(resolveModelProfileForTask('unknown_action', 'cost_balanced'), 'cost_balanced');
    });
});
