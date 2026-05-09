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
