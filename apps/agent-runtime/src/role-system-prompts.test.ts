import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRoleSystemPrompt, ROLE_SYSTEM_PROMPTS } from './role-system-prompts.js';

test('getRoleSystemPrompt returns a non-default prompt for a known role', () => {
    const prompt = getRoleSystemPrompt('developer');
    assert.ok(typeof prompt === 'string' && prompt.length > 0, 'prompt should be non-empty');
    assert.ok(!prompt.startsWith('You are a strict JSON'), 'should not return fallback for a known role');
    assert.ok(prompt.includes('developer') || prompt.includes('Developer'), 'should reference the developer role');
});

test('getRoleSystemPrompt returns the default fallback for an unknown role', () => {
    const prompt = getRoleSystemPrompt('totally_unknown_role_xyz');
    assert.strictEqual(prompt, 'You are a strict JSON classification engine for task routing.');
});

test('getRoleSystemPrompt returns the default fallback for an empty string', () => {
    const prompt = getRoleSystemPrompt('');
    assert.strictEqual(prompt, 'You are a strict JSON classification engine for task routing.');
});

test('getRoleSystemPrompt is a function', () => {
    assert.strictEqual(typeof getRoleSystemPrompt, 'function');
});

test('ROLE_SYSTEM_PROMPTS covers all 12 expected roles', () => {
    const expectedRoles = [
        'recruiter',
        'developer',
        'fullstack_developer',
        'tester',
        'business_analyst',
        'technical_writer',
        'content_writer',
        'sales_rep',
        'marketing_specialist',
        'corporate_assistant',
        'customer_support_executive',
        'project_manager_product_owner_scrum_master',
    ];
    for (const role of expectedRoles) {
        assert.ok(Object.prototype.hasOwnProperty.call(ROLE_SYSTEM_PROMPTS, role), `missing role: ${role}`);
        assert.ok(typeof ROLE_SYSTEM_PROMPTS[role] === 'string' && ROLE_SYSTEM_PROMPTS[role].length > 0);
    }
});

// ── Langfuse prompt override (build #5) ──────────────────────────────────────
import { __setLangfuseClientForTests, resetLangfuseForTests, type LangfuseLike } from '@agentfarm/llm-trace';
import { getRoleSystemPrompt as getRolePrompt, resetRolePromptOverridesForTests } from './role-system-prompts.js';

test('getRoleSystemPrompt prefers a Langfuse-registered prompt when available', async () => {
    const client: LangfuseLike = {
        trace() { return { id: 't', generation() { return { end() {}, update() {} }; }, update() {} }; },
        async flushAsync() {}, async shutdownAsync() {},
        async getPrompt() { return { prompt: 'LANGFUSE DEV OVERRIDE', compile: () => 'LANGFUSE DEV OVERRIDE' }; },
    };
    resetLangfuseForTests();
    resetRolePromptOverridesForTests();
    __setLangfuseClientForTests(client);
    try {
        // First call returns the code default and triggers a background refresh.
        const first = getRolePrompt('developer');
        assert.ok(!first.includes('LANGFUSE DEV OVERRIDE'));
        // Poll for the background refresh to populate the override cache.
        let resolved = '';
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 5));
            resolved = getRolePrompt('developer');
            if (resolved.includes('LANGFUSE DEV OVERRIDE')) break;
        }
        assert.equal(resolved, 'LANGFUSE DEV OVERRIDE');
    } finally {
        __setLangfuseClientForTests(null);
        resetRolePromptOverridesForTests();
        resetLangfuseForTests();
    }
});

test('getRoleSystemPrompt is unaffected when Langfuse is disabled', () => {
    resetLangfuseForTests();
    resetRolePromptOverridesForTests();
    __setLangfuseClientForTests(null);
    const prompt = getRolePrompt('developer');
    assert.ok(prompt.length > 0 && !prompt.includes('LANGFUSE'));
    resetLangfuseForTests();
});
