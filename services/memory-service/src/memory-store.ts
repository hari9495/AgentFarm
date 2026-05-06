// ============================================================================
// AGENT MEMORY SERVICE — Store Implementation
// ============================================================================
// Frozen 2026-05-07 — Agent Memory Service (Epic A7, Week 1)
// Prisma-backed memory store with 7-day TTL cleanup

import { PrismaClient } from '@prisma/client';
import type {
  IMemoryStore,
  MemoryReadResponse,
  MemoryWriteRequest,
} from './memory-types.js';
import {
  calculateRejectionRate,
  extractCommonConnectors,
} from './memory-types.js';
import type { AgentShortTermMemoryRecord } from '@agentfarm/shared-types';

/**
 * Production memory store backed by Prisma + Postgres
 */
export class MemoryStore implements IMemoryStore {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Read recent task memories for LLM prompt injection
   * Returns last N memories from workspace, sorted by recency
   */
  async readMemoryForTask(
    workspaceId: string,
    maxResults: number = 5
  ): Promise<MemoryReadResponse> {
    const now = new Date();

    // Query: get recent memories within 7 days
    const recentMemories = await this.prisma.agentShortTermMemory.findMany({
      where: {
        workspaceId,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: maxResults,
    });

    // Convert Prisma records to domain types
    const memories: AgentShortTermMemoryRecord[] = recentMemories.map((m) =>
      this.prismaToRecord(m)
    );

    // Calculate derived metrics
    const mostCommonConnectors = extractCommonConnectors(memories);
    const approvalRejectionRate = calculateRejectionRate(memories);

    // Count total this week (for prompt context)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const memoryCountThisWeek = await this.prisma.agentShortTermMemory.count({
      where: {
        workspaceId,
        createdAt: {
          gte: weekAgo,
        },
      },
    });

    return {
      recentMemories: memories,
      memoryCountThisWeek,
      mostCommonConnectors,
      approvalRejectionRate,
    };
  }

  /**
   * Write a memory record after task execution
   * Sets TTL to 7 days from now
   * Calls writeAuditEvent() to log the write
   */
  async writeMemoryAfterTask(request: MemoryWriteRequest): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

    await this.prisma.agentShortTermMemory.create({
      data: {
        workspaceId: request.workspaceId,
        tenantId: request.tenantId,
        taskId: request.taskId,
        actionsTaken: request.actionsTaken,
        approvalOutcomes: request.approvalOutcomes,
        connectorsUsed: request.connectorsUsed,
        llmProvider: request.llmProvider ?? null,
        executionStatus: request.executionStatus,
        summary: request.summary,
        correlationId: request.correlationId,
        createdAt: now,
        expiresAt,
      },
    });

    // TODO: Call writeAuditEvent() with event type 'memory_write'
    // writeAuditEvent({
    //   tenantId: request.tenantId,
    //   workspaceId: request.workspaceId,
    //   eventType: 'memory_write',
    //   summary: `Memory recorded for task ${request.taskId}`,
    //   correlationId: request.correlationId,
    // });
  }

  /**
   * Clean up expired memories
   * Called by background cleanup job (every 24 hours)
   * Returns count of deleted records
   */
  async cleanupExpiredMemories(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.agentShortTermMemory.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
    return result.count;
  }

  /**
   * Helper: convert Prisma record to domain type
   */
  private prismaToRecord(
    prismaRecord: any
  ): AgentShortTermMemoryRecord {
    return {
      id: prismaRecord.id,
      workspaceId: prismaRecord.workspaceId,
      tenantId: prismaRecord.tenantId,
      taskId: prismaRecord.taskId,
      actionsTaken: prismaRecord.actionsTaken as string[],
      approvalOutcomes: prismaRecord.approvalOutcomes as any[],
      connectorsUsed: prismaRecord.connectorsUsed as string[],
      llmProvider: prismaRecord.llmProvider,
      executionStatus: prismaRecord.executionStatus as 'success' | 'approval_required' | 'failed',
      summary: prismaRecord.summary,
      correlationId: prismaRecord.correlationId,
      createdAt: prismaRecord.createdAt.toISOString(),
      expiresAt: prismaRecord.expiresAt.toISOString(),
    };
  }
}

/**
 * In-memory mock store for testing
 */
export class InMemoryMemoryStore implements IMemoryStore {
  private memories: Map<string, AgentShortTermMemoryRecord[]> = new Map();

  async readMemoryForTask(
    workspaceId: string,
    maxResults: number = 5
  ): Promise<MemoryReadResponse> {
    const now = new Date();
    const memories = (this.memories.get(workspaceId) ?? [])
      .filter((m) => new Date(m.expiresAt) > now)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, maxResults);

    return {
      recentMemories: memories,
      memoryCountThisWeek: memories.length,
      mostCommonConnectors: extractCommonConnectors(memories),
      approvalRejectionRate: calculateRejectionRate(memories),
    };
  }

  async writeMemoryAfterTask(request: MemoryWriteRequest): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const record: AgentShortTermMemoryRecord = {
      id: `mem-${Date.now()}-${Math.random()}`,
      workspaceId: request.workspaceId,
      tenantId: request.tenantId,
      taskId: request.taskId,
      actionsTaken: request.actionsTaken,
      approvalOutcomes: request.approvalOutcomes,
      connectorsUsed: request.connectorsUsed,
      llmProvider: request.llmProvider,
      executionStatus: request.executionStatus,
      summary: request.summary,
      correlationId: request.correlationId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const existing = this.memories.get(request.workspaceId) ?? [];
    this.memories.set(request.workspaceId, [...existing, record]);
  }

  async cleanupExpiredMemories(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;

    for (const [workspaceId, memories] of this.memories.entries()) {
      const filtered = memories.filter(
        (m) => new Date(m.expiresAt) > now
      );
      if (filtered.length < memories.length) {
        deletedCount += memories.length - filtered.length;
        this.memories.set(workspaceId, filtered);
      }
    }

    return deletedCount;
  }
}
