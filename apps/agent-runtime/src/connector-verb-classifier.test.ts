import test from 'node:test';
import assert from 'node:assert/strict';

import { isReadVerb, isWriteVerb } from './connector-verb-classifier.js';

test('A1: known read verbs are not writes (both vocabularies)', () => {
    const reads = [
        // runtime connector exec vocabulary
        'read_task', 'list_prs',
        // normalized connector vocabulary
        'get_task', 'list_tasks', 'list_sprints', 'get_sprint_issues',
        'list_workflow_runs', 'get_workflow_run', 'list_emails', 'read_email',
        'read_thread', 'get_call_status', 'get_call_recording',
    ];
    for (const v of reads) {
        assert.equal(isWriteVerb(v), false, `${v} should be a read`);
    }
});

test('A2: known write verbs are writes (both vocabularies)', () => {
    const writes = [
        // runtime connector exec vocabulary
        'create_comment', 'update_status', 'send_message', 'create_pr_comment',
        'create_pr', 'merge_pr', 'send_email',
        // normalized connector vocabulary
        'create_task', 'update_task_status', 'add_comment', 'assign_task',
        'create_sprint', 'send_dtmf', 'merge_pr', 'trigger_workflow',
        'create_release', 'reply_email', 'initiate_call', 'hangup_call', 'transfer_call',
    ];
    for (const v of writes) {
        assert.equal(isWriteVerb(v), true, `${v} should be a write`);
    }
});

test('A3: unknown verb is treated as a write (fail-safe for read-only mode)', () => {
    assert.equal(isWriteVerb('some_unknown_action'), true);
    assert.equal(isWriteVerb(''), true);
});

test('CRM verbs classify reads as read and writes as write (fail-safe)', () => {
    assert.equal(isReadVerb('get_record'), true);
    assert.equal(isReadVerb('search_records'), true);
    assert.equal(isWriteVerb('create_record'), true);
    assert.equal(isWriteVerb('update_record'), true);
    assert.equal(isWriteVerb('log_activity'), true);
});
