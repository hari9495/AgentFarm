import type {
    GovernanceRoutingRule,
    GovernanceWorkflowTemplate,
    RiskLevel,
} from '@agentfarm/shared-types';

export interface GovernanceRoutingContext {
    tenantId: string;
    workspaceId: string;
    riskLevel: RiskLevel;
    actionType: string;
}

const ruleMatches = (rule: GovernanceRoutingRule, context: GovernanceRoutingContext): boolean => {
    if (rule.tenantId && rule.tenantId !== context.tenantId) return false;
    if (rule.workspaceId && rule.workspaceId !== context.workspaceId) return false;
    if (rule.riskLevel && rule.riskLevel !== context.riskLevel) return false;
    if (rule.actionTypePrefix && !context.actionType.startsWith(rule.actionTypePrefix)) return false;
    return true;
};

export const resolveApproverIds = (
    template: GovernanceWorkflowTemplate,
    context: GovernanceRoutingContext,
): string[] => {
    const matches = template.routingRules.filter((rule) => ruleMatches(rule, context));
    if (matches.length === 0) {
        return [];
    }

    const unique = new Set<string>();
    for (const rule of matches) {
        for (const approverId of rule.approverIds) {
            unique.add(approverId);
        }
    }

    return Array.from(unique);
};
