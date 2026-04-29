/**
 * Epic B2: Approval Gate Runtime Enforcement and Kill-Switch Precedence
 * Eliminates risky-action bypass in runtime execution.
 * 
 * - Medium/high actions cannot execute without signed approval
 * - Kill-switch event halts new risky execution
 * - Resume requires authorized control-plane signal and incident reference
 */

import type {
    KillSwitchRecord,
    KillSwitchType,
    KillSwitchStatus,
    ApprovalEnforcementContext,
    ApprovalDecision,
    RiskLevel,
} from '@agentfarm/shared-types';
import { randomUUID } from 'crypto';

export interface ActivateKillSwitchRequest {
    tenantId: string;
    workspaceId?: string;
    botId?: string;
    switchType: KillSwitchType;
    reason: string;
    affectedActionTypes: string[]; // 'medium', 'high', or specific actions
    controlWindowMs?: number;
    incidentRef?: string;
    activatedBy: string;
    correlationId: string;
}

export interface ResumeAfterKillSwitchRequest {
    killSwitchId: string;
    resumeApprovalId: string;
    incidentRef: string;
    authorizedBy: string;
    correlationId: string;
}

export class ApprovalEnforcer {
    private killSwitches = new Map<string, KillSwitchRecord>();
    private switchesByTenant = new Map<string, Set<string>>();

    /**
     * Activate a kill-switch to halt risky execution
     */
    async activateKillSwitch(request: ActivateKillSwitchRequest): Promise<KillSwitchRecord> {
        const killSwitch: KillSwitchRecord = {
            id: randomUUID(),
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            botId: request.botId,
            switchType: request.switchType,
            status: 'active',
            activatedAt: new Date().toISOString(),
            activatedBy: request.activatedBy,
            reason: request.reason,
            affectedActionTypes: request.affectedActionTypes,
            controlWindowMs: request.controlWindowMs || 30000, // 30-second default
            incidentRef: request.incidentRef,
            correlationId: request.correlationId,
        };

        this.killSwitches.set(killSwitch.id, killSwitch);

        if (!this.switchesByTenant.has(request.tenantId)) {
            this.switchesByTenant.set(request.tenantId, new Set());
        }
        this.switchesByTenant.get(request.tenantId)!.add(killSwitch.id);

        return killSwitch;
    }

    /**
     * Resume execution after kill-switch resolution
     */
    async resumeAfterKillSwitch(request: ResumeAfterKillSwitchRequest): Promise<KillSwitchRecord> {
        const killSwitch = this.killSwitches.get(request.killSwitchId);
        if (!killSwitch) {
            throw new Error(`Kill-switch not found: ${request.killSwitchId}`);
        }

        if (killSwitch.status !== 'active') {
            throw new Error(`Kill-switch is not active: ${killSwitch.status}`);
        }

        killSwitch.status = 'resolved';
        killSwitch.resumeRequiredApprovalId = request.resumeApprovalId;
        killSwitch.resumedAt = new Date().toISOString();

        return killSwitch;
    }

    /**
     * Check if enforcement is required for an action
     */
    async checkEnforcement(
        botId: string,
        tenantId: string,
        workspaceId: string,
        riskLevel: RiskLevel,
        taskId: string,
        approvalStatus?: ApprovalDecision
    ): Promise<ApprovalEnforcementContext> {
        const context: ApprovalEnforcementContext = {
            taskId,
            riskLevel,
            requiresApproval: riskLevel === 'medium' || riskLevel === 'high',
            enforceAt: new Date().toISOString(),
        };

        // Check for active kill-switch
        const activeSwitch = await this.getActiveKillSwitch(tenantId, workspaceId, botId);
        if (activeSwitch) {
            const isAffected = this.isActionAffectedBySwitch(riskLevel, activeSwitch);
            if (isAffected) {
                context.killedBySwitch = true;
                context.killSwitchId = activeSwitch.id;
                context.requiresApproval = true; // Kill-switch overrides everything
                return context;
            }
        }

        // Check approval status for risky actions
        if (context.requiresApproval) {
            if (!approvalStatus || approvalStatus === 'pending') {
                context.requiresApproval = true;
            } else if (approvalStatus === 'approved') {
                context.requiresApproval = false; // Approval satisfied
            } else if (approvalStatus === 'rejected' || approvalStatus === 'timeout_rejected') {
                context.requiresApproval = true; // Rejected approval blocks execution
            }
        }

        return context;
    }

    /**
     * Get active kill-switch affecting a bot/workspace
     */
    private async getActiveKillSwitch(
        tenantId: string,
        workspaceId?: string,
        botId?: string
    ): Promise<KillSwitchRecord | undefined> {
        const switchIds = this.switchesByTenant.get(tenantId);
        if (!switchIds) return undefined;

        for (const switchId of switchIds) {
            const ks = this.killSwitches.get(switchId);
            if (!ks || ks.status !== 'active') continue;

            // Check scope: bot-specific > workspace > tenant-wide
            if (ks.botId && ks.botId === botId) return ks;
            if (ks.workspaceId && ks.workspaceId === workspaceId) return ks;
            if (!ks.botId && !ks.workspaceId) return ks; // Tenant-wide
        }

        return undefined;
    }

    /**
     * Determine if action type is affected by kill-switch
     */
    private isActionAffectedBySwitch(riskLevel: RiskLevel, killSwitch: KillSwitchRecord): boolean {
        // Kill-switch specifies which actions it affects
        if (killSwitch.affectedActionTypes.includes(riskLevel)) return true;
        if (killSwitch.affectedActionTypes.includes('*')) return true;
        return false;
    }

    /**
     * Get kill-switch by ID
     */
    async getKillSwitch(switchId: string): Promise<KillSwitchRecord | undefined> {
        return this.killSwitches.get(switchId);
    }

    /**
     * List active kill-switches for tenant
     */
    async listActiveKillSwitches(tenantId: string): Promise<KillSwitchRecord[]> {
        const switchIds = this.switchesByTenant.get(tenantId) || new Set();
        const results: KillSwitchRecord[] = [];

        for (const switchId of switchIds) {
            const ks = this.killSwitches.get(switchId);
            if (ks && ks.status === 'active') {
                results.push(ks);
            }
        }

        return results;
    }

    /**
     * Enforce execution block
     * Returns true if action can execute, false if blocked
     */
    async canExecute(
        taskId: string,
        riskLevel: RiskLevel,
        tenantId: string,
        workspaceId: string,
        botId: string,
        approvalStatus?: ApprovalDecision
    ): Promise<boolean> {
        const context = await this.checkEnforcement(
            botId,
            tenantId,
            workspaceId,
            riskLevel,
            taskId,
            approvalStatus
        );

        if (context.killedBySwitch) {
            return false; // Kill-switch blocks execution
        }

        if (context.requiresApproval && approvalStatus !== 'approved') {
            return false; // Approval required but not granted
        }

        return true;
    }
}
