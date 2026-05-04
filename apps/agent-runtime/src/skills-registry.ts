import type { RoleKey, SkillCrystallizationRecord, SkillRecord, SkillStatus } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

// ── Crystallisation input ─────────────────────────────────────────────────────

export interface CrystallisationSource {
    runId: string;
    tenantId: string;
    workspaceId: string;
    wakeSource: string;
    roleKey?: RoleKey;
    /** Ordered list of action type identifiers (e.g. 'file_write', 'shell_exec'). */
    actionTypes: string[];
    /** Any free-form context tags captured from the run. */
    contextTags?: string[];
}

// ── In-memory store ───────────────────────────────────────────────────────────

export class SkillsRegistry {
    private readonly skills = new Map<string, SkillRecord>();

    /**
     * Crystallises a reusable skill template from a successful agent run.
     *
     * The returned SkillRecord starts in 'draft' status.  A human (or policy
     * engine) should promote it to 'active' before the orchestrator uses it.
     */
    crystallize(
        source: CrystallisationSource,
        triggerReason = 'auto: high-confidence successful run',
    ): { skill: SkillRecord; crystallisationRecord: SkillCrystallizationRecord } {
        const skillId = randomUUID();
        const now = new Date().toISOString();

        const inputPattern: Record<string, unknown> = {
            wakeSource: source.wakeSource,
            actionTypes: source.actionTypes,
            ...(source.contextTags ? { contextTags: source.contextTags } : {}),
        };

        const outputTemplate: Record<string, unknown> = {
            expectedActionStatuses: ['completed'],
            stepCount: source.actionTypes.length,
        };

        const safeName = [source.wakeSource, ...source.actionTypes]
            .join('_')
            .replace(/[^a-z0-9_]/gi, '_')
            .slice(0, 60);

        const skill: SkillRecord = {
            id: skillId,
            contractVersion: '1.0.0',
            tenantId: source.tenantId,
            workspaceId: source.workspaceId,
            name: `auto_${safeName}`,
            description: `Auto-crystallised from run ${source.runId} (${source.actionTypes.length} actions)`,
            trigger: 'auto_crystallized',
            status: 'draft',
            ...(source.roleKey ? { roleKey: source.roleKey } : {}),
            inputPattern,
            outputTemplate,
            stepCount: source.actionTypes.length,
            successCount: 1,
            useCount: 0,
            sourceRunId: source.runId,
            correlationId: randomUUID(),
            createdAt: now,
            updatedAt: now,
        };

        const crystallisationRecord: SkillCrystallizationRecord = {
            id: randomUUID(),
            skillId,
            runId: source.runId,
            tenantId: source.tenantId,
            workspaceId: source.workspaceId,
            triggerReason,
            trajectoryCompressed: false,
            correlationId: skill.correlationId,
            createdAt: now,
        };

        this.skills.set(skillId, skill);
        return { skill, crystallisationRecord };
    }

    /** Activates or deprecates a skill by id. */
    setStatus(skillId: string, status: SkillStatus): SkillRecord {
        const skill = this.skills.get(skillId);
        if (!skill) throw new Error(`SkillsRegistry: skill ${skillId} not found`);
        const updated: SkillRecord = { ...skill, status, updatedAt: new Date().toISOString() };
        this.skills.set(skillId, updated);
        return updated;
    }

    /** Records a successful use of a skill (increments useCount). */
    recordUse(skillId: string): SkillRecord {
        const skill = this.skills.get(skillId);
        if (!skill) throw new Error(`SkillsRegistry: skill ${skillId} not found`);
        const updated: SkillRecord = {
            ...skill,
            useCount: skill.useCount + 1,
            updatedAt: new Date().toISOString(),
        };
        this.skills.set(skillId, updated);
        return updated;
    }

    /** Returns all active skills for a given workspace. */
    listActive(tenantId: string, workspaceId: string): SkillRecord[] {
        return Array.from(this.skills.values()).filter(
            (s) => s.tenantId === tenantId && s.workspaceId === workspaceId && s.status === 'active',
        );
    }

    /** Finds skills whose inputPattern.actionTypes overlap with the given set. */
    findMatching(tenantId: string, workspaceId: string, actionTypes: string[]): SkillRecord[] {
        return this.listActive(tenantId, workspaceId).filter((s) => {
            const pattern = s.inputPattern['actionTypes'];
            if (!Array.isArray(pattern)) return false;
            return (pattern as string[]).some((t) => actionTypes.includes(t));
        });
    }

    get size(): number {
        return this.skills.size;
    }
}
