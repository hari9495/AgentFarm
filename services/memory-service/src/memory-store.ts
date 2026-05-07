// ============================================================================
// AGENT MEMORY SERVICE — Store Implementation
// ============================================================================
// Frozen 2026-05-07 — Agent Memory Service (Epic A7, Week 1)
// Prisma-backed memory store with 7-day TTL cleanup

import { PrismaClient } from '@prisma/client';
import type {
  IMemoryStore,
  LongTermMemoryWriteRequest,
  MemoryReadResponse,
  MemoryWriteRequest,
} from './memory-types.js';
import {
  calculateRejectionRate,
  extractCommonConnectors,
} from './memory-types.js';
import type { AgentShortTermMemoryRecord, ApprovalOutcome, LongTermMemory } from '@agentfarm/shared-types';

type AgentShortTermMemoryRow = {
  id: string;
  workspaceId: string;
  tenantId: string;
  taskId: string;
  actionsTaken: string[];
  approvalOutcomes: ApprovalOutcome[];
  connectorsUsed: string[];
  llmProvider: string | null;
  executionStatus: 'success' | 'approval_required' | 'failed';
  summary: string;
  correlationId: string;
  createdAt: Date;
  expiresAt: Date;
};

type ShortTermMemoryDelegate = {
  findMany(args: {
    where: {
      workspaceId: string;
      expiresAt?: { gt: Date };
      createdAt?: { gte: Date };
    };
    orderBy?: { createdAt: 'desc' | 'asc' };
    take?: number;
  }): Promise<AgentShortTermMemoryRow[]>;
  count(args: {
    where: {
      workspaceId: string;
      createdAt?: { gte: Date };
    };
  }): Promise<number>;
  create(args: {
    data: Omit<AgentShortTermMemoryRow, 'id'>;
  }): Promise<AgentShortTermMemoryRow>;
  deleteMany(args: {
    where: {
      expiresAt: { lt: Date };
    };
  }): Promise<{ count: number }>;
};

type AgentLongTermMemoryRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  pattern: string;
  confidence: number;
  observedCount: number;
  lastSeen: Date;
  createdAt: Date;
};

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
    const shortTermMemory = this.getShortTermMemoryDelegate();

    // Query: get recent memories within 7 days
    const recentMemories = await shortTermMemory.findMany({
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
    const memories: AgentShortTermMemoryRecord[] = recentMemories.map((m: AgentShortTermMemoryRow) =>
      this.prismaToRecord(m)
    );

    // Calculate derived metrics
    const mostCommonConnectors = extractCommonConnectors(memories);
    const approvalRejectionRate = calculateRejectionRate(memories);

    // Count total this week (for prompt context)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const memoryCountThisWeek = await shortTermMemory.count({
      where: {
        workspaceId,
        createdAt: {
          gte: weekAgo,
        },
      },
    });

    const codeReviewPatterns = (await this.readLongTermMemory(workspaceId, 0.5))
      .slice(0, maxResults)
      .map((memory) => memory.pattern);

    return {
      recentMemories: memories,
      memoryCountThisWeek,
      mostCommonConnectors,
      approvalRejectionRate,
      codeReviewPatterns,
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
    const shortTermMemory = this.getShortTermMemoryDelegate();

    await shortTermMemory.create({
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

    this.writeAuditEvent(request).catch(() => {
      // Non-blocking: audit write failures must never surface to caller
    });
  }

  async writeLongTermMemory(request: LongTermMemoryWriteRequest): Promise<LongTermMemory> {
    const [row] = await this.prisma.$queryRaw<AgentLongTermMemoryRow[]>`
      INSERT INTO "AgentLongTermMemory" (
        "tenantId", "workspaceId", pattern, confidence, "observedCount", "lastSeen"
      ) VALUES (
        ${request.tenantId}, ${request.workspaceId}, ${request.pattern}, ${request.confidence}, ${request.observedCount}, ${new Date(request.lastSeen)}
      )
      RETURNING id, "tenantId", "workspaceId", pattern, confidence, "observedCount", "lastSeen", "createdAt"
    `;

    return this.longTermRowToRecord(row);
  }

  async readLongTermMemory(workspaceId: string, minConfidence: number = 0): Promise<LongTermMemory[]> {
    const rows = await this.prisma.$queryRaw<AgentLongTermMemoryRow[]>`
      SELECT id, "tenantId", "workspaceId", pattern, confidence, "observedCount", "lastSeen", "createdAt"
      FROM "AgentLongTermMemory"
      WHERE "workspaceId" = ${workspaceId}
        AND confidence >= ${minConfidence}
      ORDER BY confidence DESC, "lastSeen" DESC
    `;

    return rows.map((row: AgentLongTermMemoryRow) => this.longTermRowToRecord(row));
  }

  async updateMemoryConfidence(id: string, newObservation: string): Promise<void> {
    const [existing] = await this.prisma.$queryRaw<AgentLongTermMemoryRow[]>`
      SELECT id, "tenantId", "workspaceId", pattern, confidence, "observedCount", "lastSeen", "createdAt"
      FROM "AgentLongTermMemory"
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!existing) {
      return;
    }

    const nextObservedCount = existing.observedCount + 1;
    const nextConfidence = Number(
      Math.max(existing.confidence, Math.min(1, existing.confidence + 0.1)).toFixed(3)
    );
    const lastSeen = new Date(newObservation);

    await this.prisma.$executeRaw`
      UPDATE "AgentLongTermMemory"
      SET confidence = ${nextConfidence},
          "observedCount" = ${nextObservedCount},
          "lastSeen" = ${lastSeen}
      WHERE id = ${id}
    `;
  }

  private async writeAuditEvent(request: MemoryWriteRequest): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        workspaceId: request.workspaceId,
        botId: 'system:memory-service',
        eventType: 'memory_write',
        severity: 'info',
        summary: `Memory recorded for task ${request.taskId} (status: ${request.executionStatus})`,
        sourceSystem: 'memory-service',
        correlationId: request.correlationId,
      },
    });
  }

  /**
   * Clean up expired memories
   * Called by background cleanup job (every 24 hours)
   * Returns count of deleted records
   */
  async cleanupExpiredMemories(): Promise<number> {
    const now = new Date();
    const result = await this.getShortTermMemoryDelegate().deleteMany({
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
    prismaRecord: AgentShortTermMemoryRow
  ): AgentShortTermMemoryRecord {
    return {
      id: prismaRecord.id,
      workspaceId: prismaRecord.workspaceId,
      tenantId: prismaRecord.tenantId,
      taskId: prismaRecord.taskId,
      actionsTaken: prismaRecord.actionsTaken as string[],
      approvalOutcomes: prismaRecord.approvalOutcomes as any[],
      connectorsUsed: prismaRecord.connectorsUsed as string[],
      llmProvider: prismaRecord.llmProvider ?? undefined,
      executionStatus: prismaRecord.executionStatus as 'success' | 'approval_required' | 'failed',
      summary: prismaRecord.summary,
      correlationId: prismaRecord.correlationId,
      createdAt: prismaRecord.createdAt.toISOString(),
      expiresAt: prismaRecord.expiresAt.toISOString(),
    };
  }

  private getShortTermMemoryDelegate(): ShortTermMemoryDelegate {
    return (this.prisma as PrismaClient & {
      agentShortTermMemory: ShortTermMemoryDelegate;
    }).agentShortTermMemory;
  }

  private longTermRowToRecord(row: AgentLongTermMemoryRow): LongTermMemory {
    return {
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId,
      pattern: row.pattern,
      confidence: Number(row.confidence),
      observedCount: row.observedCount,
      lastSeen: row.lastSeen.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export interface InMemoryAuditEvent {
  tenantId: string;
  workspaceId: string;
  eventType: string;
  summary: string;
  correlationId: string;
  createdAt: string;
}

/**
 * In-memory mock store for testing
 */
export class InMemoryMemoryStore implements IMemoryStore {
  private memories: Map<string, AgentShortTermMemoryRecord[]> = new Map();
  private longTermMemories: Map<string, LongTermMemory[]> = new Map();
  private auditLog: InMemoryAuditEvent[] = [];

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

    const codeReviewPatterns = (this.longTermMemories.get(workspaceId) ?? [])
      .filter((memory) => memory.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence || Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
      .slice(0, maxResults)
      .map((memory) => memory.pattern);

    return {
      recentMemories: memories,
      memoryCountThisWeek: memories.length,
      mostCommonConnectors: extractCommonConnectors(memories),
      approvalRejectionRate: calculateRejectionRate(memories),
      codeReviewPatterns,
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

    this.writeAuditEvent(request);
  }

  async writeLongTermMemory(request: LongTermMemoryWriteRequest): Promise<LongTermMemory> {
    const record: LongTermMemory = {
      id: `ltm-${Date.now()}-${Math.random()}`,
      tenantId: request.tenantId,
      workspaceId: request.workspaceId,
      pattern: request.pattern,
      confidence: request.confidence,
      observedCount: request.observedCount,
      lastSeen: request.lastSeen,
      createdAt: new Date().toISOString(),
    };
    const existing = this.longTermMemories.get(request.workspaceId) ?? [];
    this.longTermMemories.set(request.workspaceId, [...existing, record]);
    return record;
  }

  async readLongTermMemory(workspaceId: string, minConfidence: number = 0): Promise<LongTermMemory[]> {
    return (this.longTermMemories.get(workspaceId) ?? [])
      .filter((memory) => memory.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence || Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  }

  async updateMemoryConfidence(id: string, newObservation: string): Promise<void> {
    for (const [workspaceId, memories] of this.longTermMemories.entries()) {
      const updated = memories.map((memory) => memory.id !== id
        ? memory
        : {
          ...memory,
          confidence: Number(Math.min(1, memory.confidence + 0.1).toFixed(3)),
          observedCount: memory.observedCount + 1,
          lastSeen: newObservation,
        });
      this.longTermMemories.set(workspaceId, updated);
    }
  }

  private writeAuditEvent(request: MemoryWriteRequest): void {
    this.auditLog.push({
      tenantId: request.tenantId,
      workspaceId: request.workspaceId,
      eventType: 'memory_write',
      summary: `Memory recorded for task ${request.taskId} (status: ${request.executionStatus})`,
      correlationId: request.correlationId,
      createdAt: new Date().toISOString(),
    });
  }

  getAuditEvents(): InMemoryAuditEvent[] {
    return [...this.auditLog];
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
