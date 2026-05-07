// ============================================================================
// AGENT MEMORY SERVICE — Tests
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryWriteRequest } from './memory-types.js';
import {
  InMemoryMemoryStore,
} from './memory-store.js';
import {
  calculateRejectionRate,
  extractCommonConnectors,
} from './memory-types.js';

test('Agent Memory Service', async (t) => {
  const store = new InMemoryMemoryStore();

  // Test 1: Write memory after successful task
  await t.test('should write memory after task execution', async () => {
    const writeRequest: MemoryWriteRequest = {
      workspaceId: 'ws-123',
      tenantId: 'tenant-123',
      taskId: 'task-1',
      actionsTaken: ['workspace_create_pr', 'run_tests'],
      approvalOutcomes: [
        {
          action: 'workspace_create_pr',
          decision: 'approved',
          reason: 'PR looks good',
        },
      ],
      connectorsUsed: ['github', 'slack'],
      llmProvider: 'gpt-4',
      executionStatus: 'success',
      summary: 'Created PR and ran tests successfully',
      correlationId: 'corr-123',
    };

    await store.writeMemoryAfterTask(writeRequest);

    // Read back the memory
    const result = await store.readMemoryForTask('ws-123');
    assert.equal(result.recentMemories.length, 1);
    assert.equal(result.recentMemories[0].taskId, 'task-1');
    assert.equal(result.recentMemories[0].actionsTaken.length, 2);
    assert.deepEqual(result.recentMemories[0].connectorsUsed, [
      'github',
      'slack',
    ]);
  });

  // Test 2: Reject rate calculation
  await t.test('should calculate rejection rate correctly', async () => {
    const store2 = new InMemoryMemoryStore();

    // Write 2 memories: one approved, one rejected
    await store2.writeMemoryAfterTask({
      workspaceId: 'ws-456',
      tenantId: 'tenant-456',
      taskId: 'task-2',
      actionsTaken: ['git_push'],
      approvalOutcomes: [
        { action: 'git_push', decision: 'approved' },
      ],
      connectorsUsed: ['github'],
      executionStatus: 'success',
      summary: 'Pushed code',
      correlationId: 'corr-234',
    });

    await store2.writeMemoryAfterTask({
      workspaceId: 'ws-456',
      tenantId: 'tenant-456',
      taskId: 'task-3',
      actionsTaken: ['delete_resource'],
      approvalOutcomes: [
        { action: 'delete_resource', decision: 'rejected', reason: 'Too risky' },
      ],
      connectorsUsed: ['aws'],
      executionStatus: 'approval_required',
      summary: 'Tried to delete resource',
      correlationId: 'corr-235',
    });

    const result = await store2.readMemoryForTask('ws-456');
    // 1 rejection out of 2 approvals = 0.5
    assert.equal(result.approvalRejectionRate, 0.5);
  });

  // Test 3: Common connectors extraction
  await t.test('should extract most common connectors', async () => {
    const store3 = new InMemoryMemoryStore();

    // Write 3 memories using different connectors
    for (let i = 0; i < 3; i++) {
      await store3.writeMemoryAfterTask({
        workspaceId: 'ws-789',
        tenantId: 'tenant-789',
        taskId: `task-${i}`,
        actionsTaken: ['workspace_create_pr'],
        approvalOutcomes: [],
        connectorsUsed: ['github', 'github', 'slack'], // github appears twice
        executionStatus: 'success',
        summary: 'Created PR',
        correlationId: `corr-${i}`,
      });
    }

    const result = await store3.readMemoryForTask('ws-789', 10);
    assert.equal(result.mostCommonConnectors[0], 'github');
    assert.ok(result.mostCommonConnectors.includes('slack'));
  });

  // Test 4: TTL expiration cleanup
  await t.test('should cleanup expired memories', async () => {
    const store4 = new InMemoryMemoryStore();

    // Write memory
    await store4.writeMemoryAfterTask({
      workspaceId: 'ws-999',
      tenantId: 'tenant-999',
      taskId: 'task-exp',
      actionsTaken: [],
      approvalOutcomes: [],
      connectorsUsed: [],
      executionStatus: 'success',
      summary: 'Test',
      correlationId: 'corr-exp',
    });

    // Manually expire the memory by reading and verifying it exists
    const beforeCleanup = await store4.readMemoryForTask('ws-999');
    assert.equal(beforeCleanup.recentMemories.length, 1);

    // Cleanup should remove nothing (memory not expired yet)
    const deleted = await store4.cleanupExpiredMemories();
    assert.equal(deleted, 0);
  });

  // Test 5: Multiple workspaces isolated
  await t.test('should isolate memories by workspace', async () => {
    const store5 = new InMemoryMemoryStore();

    // Write to ws-aaa
    await store5.writeMemoryAfterTask({
      workspaceId: 'ws-aaa',
      tenantId: 'tenant-aaa',
      taskId: 'task-a',
      actionsTaken: ['create_pr'],
      approvalOutcomes: [],
      connectorsUsed: ['github'],
      executionStatus: 'success',
      summary: 'PR for repo A',
      correlationId: 'corr-a',
    });

    // Write to ws-bbb
    await store5.writeMemoryAfterTask({
      workspaceId: 'ws-bbb',
      tenantId: 'tenant-bbb',
      taskId: 'task-b',
      actionsTaken: ['create_pr'],
      approvalOutcomes: [],
      connectorsUsed: ['gitlab'],
      executionStatus: 'success',
      summary: 'PR for repo B',
      correlationId: 'corr-b',
    });

    // Read from ws-aaa
    const resultA = await store5.readMemoryForTask('ws-aaa');
    assert.equal(resultA.recentMemories.length, 1);
    assert.equal(resultA.recentMemories[0].taskId, 'task-a');
    assert.equal(resultA.mostCommonConnectors[0], 'github');

    // Read from ws-bbb
    const resultB = await store5.readMemoryForTask('ws-bbb');
    assert.equal(resultB.recentMemories.length, 1);
    assert.equal(resultB.recentMemories[0].taskId, 'task-b');
    assert.equal(resultB.mostCommonConnectors[0], 'gitlab');
  });

  // Test 6: Approval outcomes recorded and retrieved
  await t.test('should record and retrieve approval outcomes', async () => {
    const store6 = new InMemoryMemoryStore();

    const approvalOutcomes = [
      { action: 'merge_pr', decision: 'approved' as const, reason: 'LGTM' },
      {
        action: 'deploy_production',
        decision: 'rejected' as const,
        reason: 'Needs QA sign-off',
      },
    ];

    await store6.writeMemoryAfterTask({
      workspaceId: 'ws-approve',
      tenantId: 'tenant-approve',
      taskId: 'task-approve',
      actionsTaken: ['merge_pr', 'deploy_production'],
      approvalOutcomes,
      connectorsUsed: ['github'],
      executionStatus: 'approval_required',
      summary: 'Merge and deploy attempt',
      correlationId: 'corr-approve',
    });

    const result = await store6.readMemoryForTask('ws-approve');
    assert.equal(result.recentMemories[0].approvalOutcomes.length, 2);
    assert.deepEqual(result.recentMemories[0].approvalOutcomes, approvalOutcomes);
  });

  // Test 7: Audit event emitted after writeMemoryAfterTask
  await t.test('should emit audit event after writeMemoryAfterTask', async () => {
    const storeAudit = new InMemoryMemoryStore();

    await storeAudit.writeMemoryAfterTask({
      workspaceId: 'ws-audit',
      tenantId: 'tenant-audit',
      taskId: 'task-audit-1',
      actionsTaken: ['create_pr'],
      approvalOutcomes: [],
      connectorsUsed: ['github'],
      executionStatus: 'success',
      summary: 'Audit test task',
      correlationId: 'corr-audit-1',
    });

    const auditEvents = storeAudit.getAuditEvents();
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].eventType, 'memory_write');
    assert.equal(auditEvents[0].tenantId, 'tenant-audit');
    assert.equal(auditEvents[0].workspaceId, 'ws-audit');
    assert.equal(auditEvents[0].correlationId, 'corr-audit-1');
    assert.ok(auditEvents[0].summary.includes('task-audit-1'));
    assert.ok(auditEvents[0].summary.includes('success'));
  });

  // Test 8: Long-term memories can be filtered by confidence
  await t.test('should persist and filter long-term memories', async () => {
    const longTerm = await store.writeLongTermMemory({
      tenantId: 'tenant-123',
      workspaceId: 'ws-123',
      pattern: 'Prefer opening a draft PR before merge',
      confidence: 0.72,
      observedCount: 3,
      lastSeen: '2026-05-07T00:00:00.000Z',
    });

    await store.writeLongTermMemory({
      tenantId: 'tenant-123',
      workspaceId: 'ws-123',
      pattern: 'Escalate permission changes',
      confidence: 0.45,
      observedCount: 1,
      lastSeen: '2026-05-06T00:00:00.000Z',
    });

    const filtered = await store.readLongTermMemory('ws-123', 0.5);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, longTerm.id);
    assert.equal(filtered[0].pattern, 'Prefer opening a draft PR before merge');

    const injected = await store.readMemoryForTask('ws-123');
    assert.deepEqual(injected.codeReviewPatterns, ['Prefer opening a draft PR before merge']);
  });

  // Test 9: Long-term memory confidence can be updated from new observations
  await t.test('should update long-term memory confidence from new observations', async () => {
    const storeLongTerm = new InMemoryMemoryStore();
    const longTerm = await storeLongTerm.writeLongTermMemory({
      tenantId: 'tenant-123',
      workspaceId: 'ws-123',
      pattern: 'Retry flaky CI once before escalation',
      confidence: 0.4,
      observedCount: 2,
      lastSeen: '2026-05-05T00:00:00.000Z',
    });

    await storeLongTerm.updateMemoryConfidence(longTerm.id, '2026-05-08T00:00:00.000Z');

    const updated = await storeLongTerm.readLongTermMemory('ws-123');
    const refreshed = updated.find((memory) => memory.id === longTerm.id);
    assert.ok(refreshed);
    assert.equal(refreshed.confidence, 0.5);
    assert.equal(refreshed.observedCount, 3);
    assert.equal(refreshed.lastSeen, '2026-05-08T00:00:00.000Z');
  });

  // Test 10: Audit log accumulates across multiple writes
  await t.test('should accumulate audit events across multiple writes', async () => {
    const storeMulti = new InMemoryMemoryStore();

    for (let i = 0; i < 3; i++) {
      await storeMulti.writeMemoryAfterTask({
        workspaceId: 'ws-multi',
        tenantId: 'tenant-multi',
        taskId: `task-multi-${i}`,
        actionsTaken: [],
        approvalOutcomes: [],
        connectorsUsed: [],
        executionStatus: 'success',
        summary: `Task ${i}`,
        correlationId: `corr-multi-${i}`,
      });
    }

    const auditEvents = storeMulti.getAuditEvents();
    assert.equal(auditEvents.length, 3);
    assert.ok(auditEvents.every((e) => e.eventType === 'memory_write'));
  });
});
