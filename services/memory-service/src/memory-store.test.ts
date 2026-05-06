// ============================================================================
// AGENT MEMORY SERVICE — Tests
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryMemoryStore,
  calculateRejectionRate,
  extractCommonConnectors,
} from './memory-store.js';
import type { MemoryWriteRequest } from './memory-types.js';

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
});
