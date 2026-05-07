// ============================================================================
// AGENT MEMORY SERVICE — Type Definitions
// ============================================================================
// Frozen 2026-05-07 — Agent Memory Service (Epic A7, Week 1)
// Short-term task memory for agent context injection (7-day TTL)

import type { AgentShortTermMemoryRecord, ApprovalOutcome, LongTermMemory } from '@agentfarm/shared-types';

/**
 * Memory write request: called after task execution completes
 */
export interface MemoryWriteRequest {
  workspaceId: string;
  tenantId: string;
  taskId: string;
  actionsTaken: string[];
  approvalOutcomes: ApprovalOutcome[];
  connectorsUsed: string[];
  llmProvider?: string;
  executionStatus: 'success' | 'approval_required' | 'failed';
  summary: string;
  correlationId: string;
}

/**
 * Memory read response: injected into LLM prompt before decision
 */
export interface MemoryReadResponse {
  recentMemories: AgentShortTermMemoryRecord[];
  memoryCountThisWeek: number;
  mostCommonConnectors: string[];
  approvalRejectionRate: number;
  codeReviewPatterns: string[];
}

export interface LongTermMemoryWriteRequest {
  tenantId: string;
  workspaceId: string;
  pattern: string;
  confidence: number;
  observedCount: number;
  lastSeen: string;
}

/**
 * Memory store interface — implementation can use SQLite, Postgres, etc.
 */
export interface IMemoryStore {
  /**
   * Read recent task memories for context injection
   * @param workspaceId Workspace scope
   * @param maxResults How many recent memories to return (default 5)
   */
  readMemoryForTask(workspaceId: string, maxResults?: number): Promise<MemoryReadResponse>;

  /**
   * Write a memory record after task completion
   * @param request Memory write request with task execution details
   */
  writeMemoryAfterTask(request: MemoryWriteRequest): Promise<void>;

  writeLongTermMemory(request: LongTermMemoryWriteRequest): Promise<LongTermMemory>;

  readLongTermMemory(workspaceId: string, minConfidence?: number): Promise<LongTermMemory[]>;

  updateMemoryConfidence(id: string, newObservation: string): Promise<void>;

  /**
   * Clean up expired memories (TTL > 7 days)
   * Called by cleanup job
   */
  cleanupExpiredMemories(): Promise<number>;
}

/**
 * Helper: calculate approval rejection rate from recent memories
 */
export function calculateRejectionRate(memories: AgentShortTermMemoryRecord[]): number {
  if (memories.length === 0) return 0;
  const totalApprovals = memories.reduce(
    (sum, m) => sum + m.approvalOutcomes.length,
    0
  );
  if (totalApprovals === 0) return 0;
  const rejections = memories.reduce(
    (sum, m) =>
      sum + m.approvalOutcomes.filter((a) => a.decision === 'rejected').length,
    0
  );
  return rejections / totalApprovals;
}

/**
 * Helper: extract most common connectors from recent memories
 */
export function extractCommonConnectors(
  memories: AgentShortTermMemoryRecord[],
  topN: number = 3
): string[] {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    for (const connector of memory.connectorsUsed) {
      counts.set(connector, (counts.get(connector) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([connector]) => connector);
}
