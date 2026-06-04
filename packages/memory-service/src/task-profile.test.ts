import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMemoryConfig, PROFILE_CONFIGS } from './task-profile.js';

// ---------------------------------------------------------------------------
// Explicit override coverage
// ---------------------------------------------------------------------------

test('deriveMemoryConfig — document actions use all 3 paths', () => {
    for (const at of [
        'workspace_ba_draft_brd',
        'workspace_pm_project_charter',
        'workspace_dev_tech_spec',
        'workspace_cw_write_prose',
    ]) {
        const cfg = deriveMemoryConfig(at);
        assert.equal(cfg.usePriorWork, true,  `${at}: usePriorWork`);
        assert.equal(cfg.useTemplates, true,  `${at}: useTemplates`);
        assert.equal(cfg.useLessons,   true,  `${at}: useLessons`);
        assert.equal(cfg.priorWorkTopK, undefined, `${at}: no topK override`);
    }
});

test('deriveMemoryConfig — analytical actions skip templates', () => {
    for (const at of [
        'workspace_ba_gap_analysis',
        'workspace_pm_sprint_health_check',
        'workspace_dev_fix_bug',
        'workspace_cse_issue_diagnose',
    ]) {
        const cfg = deriveMemoryConfig(at);
        assert.equal(cfg.usePriorWork, true,  `${at}: usePriorWork`);
        assert.equal(cfg.useTemplates, false, `${at}: useTemplates skipped`);
        assert.equal(cfg.useLessons,   true,  `${at}: useLessons`);
    }
});

test('deriveMemoryConfig — sequential actions skip templates and limit topK', () => {
    for (const at of [
        'workspace_pm_standup_summary',
        'workspace_dev_standup_report',
        'workspace_email_personalize',
        'workspace_ba_stakeholder_update',
    ]) {
        const cfg = deriveMemoryConfig(at);
        assert.equal(cfg.usePriorWork,  true,  `${at}: usePriorWork`);
        assert.equal(cfg.useTemplates,  false, `${at}: useTemplates skipped`);
        assert.equal(cfg.useLessons,    true,  `${at}: useLessons`);
        assert.equal(cfg.priorWorkTopK, 2,     `${at}: topK=2`);
    }
});

test('deriveMemoryConfig — conversational actions use lessons only', () => {
    for (const at of [
        'workspace_cse_live_chat_handle',
        'workspace_cse_reply_compose',
        'workspace_ca_email_classify',
        'workspace_cold_call',
        'workspace_meeting_join',
    ]) {
        const cfg = deriveMemoryConfig(at);
        assert.equal(cfg.usePriorWork, false, `${at}: usePriorWork skipped`);
        assert.equal(cfg.useTemplates, false, `${at}: useTemplates skipped`);
        assert.equal(cfg.useLessons,   true,  `${at}: useLessons`);
    }
});

// ---------------------------------------------------------------------------
// Heuristic fallback
// ---------------------------------------------------------------------------

test('deriveMemoryConfig — unknown standup action inferred as sequential', () => {
    const cfg = deriveMemoryConfig('workspace_newagent_standup_update');
    assert.equal(cfg.usePriorWork,  true);
    assert.equal(cfg.useTemplates,  false);
    assert.equal(cfg.priorWorkTopK, 2);
});

test('deriveMemoryConfig — unknown audit action inferred as analytical', () => {
    const cfg = deriveMemoryConfig('workspace_newagent_security_audit');
    assert.equal(cfg.usePriorWork, true);
    assert.equal(cfg.useTemplates, false);
    assert.equal(cfg.useLessons,   true);
    assert.equal(cfg.priorWorkTopK, undefined);
});

test('deriveMemoryConfig — unknown chat action inferred as conversational', () => {
    const cfg = deriveMemoryConfig('workspace_newagent_live_chat');
    assert.equal(cfg.usePriorWork, false);
    assert.equal(cfg.useTemplates, false);
});

test('deriveMemoryConfig — completely unknown action defaults to document', () => {
    const cfg = deriveMemoryConfig('workspace_unknown_xyz_abc');
    assert.deepEqual(cfg, PROFILE_CONFIGS['document']);
});

// ---------------------------------------------------------------------------
// PROFILE_CONFIGS sanity
// ---------------------------------------------------------------------------

test('PROFILE_CONFIGS — document enables all 3 paths', () => {
    const cfg = PROFILE_CONFIGS['document'];
    assert.equal(cfg.usePriorWork, true);
    assert.equal(cfg.useTemplates, true);
    assert.equal(cfg.useLessons,   true);
});

test('PROFILE_CONFIGS — conversational enables only lessons', () => {
    const cfg = PROFILE_CONFIGS['conversational'];
    assert.equal(cfg.usePriorWork, false);
    assert.equal(cfg.useTemplates, false);
    assert.equal(cfg.useLessons,   true);
});

test('deriveMemoryConfig — returns stable config (same reference shape each call)', () => {
    const a = deriveMemoryConfig('workspace_ba_draft_brd');
    const b = deriveMemoryConfig('workspace_ba_draft_brd');
    assert.deepEqual(a, b);
});
