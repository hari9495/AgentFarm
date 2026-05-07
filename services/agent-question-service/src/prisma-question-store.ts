/**
 * Prisma-backed Question Store for production use
 * Replaces InMemoryQuestionStore with database persistence
 */

import { PrismaClient } from '@prisma/client';
import type {
    AgentQuestionRecord,
    AgentQuestionStatus,
    AgentQuestionChannel,
    AgentQuestionTimeoutPolicy,
} from '@agentfarm/shared-types';
import { IQuestionStore } from './question-store.js';

export class PrismaQuestionStore implements IQuestionStore {
    private readonly prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    async save(record: AgentQuestionRecord): Promise<void> {
        await this.prisma.agentQuestion.create({
            data: {
                id: record.id,
                contractVersion: record.contractVersion,
                tenantId: record.tenantId,
                workspaceId: record.workspaceId,
                taskId: record.taskId,
                botId: record.botId,
                question: record.question,
                context: record.context,
                options: record.options || [],
                askedVia: record.askedVia as any,
                status: record.status as any,
                timeoutMs: record.timeoutMs,
                onTimeout: record.onTimeout as any,
                answer: record.answer || null,
                answeredBy: record.answeredBy || null,
                answeredAt: record.answeredAt ? new Date(record.answeredAt) : null,
                expiresAt: new Date(record.expiresAt),
                correlationId: record.correlationId,
            },
        });
    }

    async findById(id: string): Promise<AgentQuestionRecord | null> {
        const row = await this.prisma.agentQuestion.findUnique({
            where: { id },
        });
        if (!row) return null;
        return this.rowToRecord(row);
    }

    async findPendingByTask(taskId: string): Promise<AgentQuestionRecord[]> {
        const rows = await this.prisma.agentQuestion.findMany({
            where: {
                taskId,
                status: 'pending' as any,
            },
        });
        return rows.map((r: any) => this.rowToRecord(r));
    }

    async findPendingByWorkspace(workspaceId: string): Promise<AgentQuestionRecord[]> {
        const rows = await this.prisma.agentQuestion.findMany({
            where: {
                workspaceId,
                status: 'pending' as any,
            },
        });
        return rows.map((r: any) => this.rowToRecord(r));
    }

    async update(id: string, patch: Partial<AgentQuestionRecord>): Promise<void> {
        const updateData: any = {};
        if (patch.status !== undefined) updateData.status = patch.status as any;
        if (patch.answer !== undefined) updateData.answer = patch.answer;
        if (patch.answeredBy !== undefined) updateData.answeredBy = patch.answeredBy;
        if (patch.answeredAt !== undefined) updateData.answeredAt = patch.answeredAt ? new Date(patch.answeredAt) : null;

        await this.prisma.agentQuestion.update({
            where: { id },
            data: updateData,
        });
    }

    private rowToRecord(row: any): AgentQuestionRecord {
        return {
            id: row.id,
            contractVersion: row.contractVersion,
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            taskId: row.taskId,
            botId: row.botId,
            question: row.question,
            context: row.context,
            options: row.options || [],
            askedVia: row.askedVia as AgentQuestionChannel,
            status: row.status as AgentQuestionStatus,
            timeoutMs: row.timeoutMs,
            onTimeout: row.onTimeout as AgentQuestionTimeoutPolicy,
            answer: row.answer || undefined,
            answeredBy: row.answeredBy || undefined,
            answeredAt: row.answeredAt?.toISOString() || undefined,
            expiresAt: row.expiresAt.toISOString(),
            correlationId: row.correlationId,
            createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
        };
    }
}
