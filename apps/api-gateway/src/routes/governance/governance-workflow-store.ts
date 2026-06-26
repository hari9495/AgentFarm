/**
 * governance-workflow-store.ts — Phase 6 Group D durability.
 *
 * Async store abstraction for governance workflow templates / instances /
 * decisions. The in-memory implementation preserves the previous behavior (and
 * powers tests); the Prisma implementation persists to Postgres so workflow
 * state survives restarts.
 */

import type { PrismaClient } from '@prisma/client';
import type {
    GovernanceWorkflowTemplate,
    GovernanceWorkflowInstance,
    GovernanceWorkflowDecisionRecord,
} from '@agentfarm/shared-types';

export interface GovernanceWorkflowStore {
    listTemplates(tenantId: string): Promise<GovernanceWorkflowTemplate[]>;
    getTemplate(id: string): Promise<GovernanceWorkflowTemplate | null>;
    saveTemplate(template: GovernanceWorkflowTemplate): Promise<void>;
    listWorkflows(tenantId: string): Promise<GovernanceWorkflowInstance[]>;
    getWorkflow(id: string): Promise<GovernanceWorkflowInstance | null>;
    saveWorkflow(workflow: GovernanceWorkflowInstance): Promise<void>;
    getDecisions(workflowId: string): Promise<GovernanceWorkflowDecisionRecord[]>;
    saveDecisions(workflowId: string, decisions: GovernanceWorkflowDecisionRecord[]): Promise<void>;
}

/** In-memory store — default when no database is configured, and for tests. */
export class InMemoryGovernanceWorkflowStore implements GovernanceWorkflowStore {
    private templates = new Map<string, GovernanceWorkflowTemplate>();
    private workflows = new Map<string, GovernanceWorkflowInstance>();
    private decisions = new Map<string, GovernanceWorkflowDecisionRecord[]>();

    async listTemplates(tenantId: string) {
        return Array.from(this.templates.values()).filter((t) => t.tenantId === tenantId);
    }
    async getTemplate(id: string) {
        return this.templates.get(id) ?? null;
    }
    async saveTemplate(template: GovernanceWorkflowTemplate) {
        this.templates.set(template.id, template);
    }
    async listWorkflows(tenantId: string) {
        return Array.from(this.workflows.values()).filter((w) => w.tenantId === tenantId);
    }
    async getWorkflow(id: string) {
        return this.workflows.get(id) ?? null;
    }
    async saveWorkflow(workflow: GovernanceWorkflowInstance) {
        this.workflows.set(workflow.id, workflow);
    }
    async getDecisions(workflowId: string) {
        return this.decisions.get(workflowId) ?? [];
    }
    async saveDecisions(workflowId: string, decisions: GovernanceWorkflowDecisionRecord[]) {
        this.decisions.set(workflowId, decisions);
    }
}

type PrismaLike = Pick<PrismaClient, 'governanceWorkflowTemplate' | 'governanceWorkflowInstance'>;

/** Postgres-backed store — workflow state survives restarts. */
export class PrismaGovernanceWorkflowStore implements GovernanceWorkflowStore {
    constructor(private readonly prisma: PrismaLike) {}

    async listTemplates(tenantId: string) {
        const rows = await this.prisma.governanceWorkflowTemplate.findMany({ where: { tenantId } });
        return rows.map((r) => r.dataJson as unknown as GovernanceWorkflowTemplate);
    }
    async getTemplate(id: string) {
        const row = await this.prisma.governanceWorkflowTemplate.findUnique({ where: { id } });
        return row ? (row.dataJson as unknown as GovernanceWorkflowTemplate) : null;
    }
    async saveTemplate(template: GovernanceWorkflowTemplate) {
        const data = template as unknown as object;
        await this.prisma.governanceWorkflowTemplate.upsert({
            where: { id: template.id },
            create: { id: template.id, tenantId: template.tenantId, dataJson: data },
            update: { dataJson: data },
        });
    }
    async listWorkflows(tenantId: string) {
        const rows = await this.prisma.governanceWorkflowInstance.findMany({ where: { tenantId } });
        return rows.map((r) => r.dataJson as unknown as GovernanceWorkflowInstance);
    }
    async getWorkflow(id: string) {
        const row = await this.prisma.governanceWorkflowInstance.findUnique({ where: { id } });
        return row ? (row.dataJson as unknown as GovernanceWorkflowInstance) : null;
    }
    async saveWorkflow(workflow: GovernanceWorkflowInstance) {
        const data = workflow as unknown as object;
        await this.prisma.governanceWorkflowInstance.upsert({
            where: { id: workflow.id },
            create: {
                id: workflow.id,
                tenantId: workflow.tenantId,
                templateId: workflow.templateId,
                status: workflow.status,
                dataJson: data,
            },
            update: { status: workflow.status, dataJson: data },
        });
    }
    async getDecisions(workflowId: string) {
        const row = await this.prisma.governanceWorkflowInstance.findUnique({ where: { id: workflowId } });
        return row && Array.isArray(row.decisionsJson)
            ? (row.decisionsJson as unknown as GovernanceWorkflowDecisionRecord[])
            : [];
    }
    async saveDecisions(workflowId: string, decisions: GovernanceWorkflowDecisionRecord[]) {
        await this.prisma.governanceWorkflowInstance.update({
            where: { id: workflowId },
            data: { decisionsJson: decisions as unknown as object },
        });
    }
}
