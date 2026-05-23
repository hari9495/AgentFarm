import type { FastifyInstance } from 'fastify';

type AgentRoleOption = {
    id: string;
    label: string;
};

type PlanOption = {
    id: string;
    label: string;
    recommended?: boolean;
};

const AGENT_ROLES: AgentRoleOption[] = [
    { id: 'developer_agent', label: 'Developer Agent' },
    { id: 'qa_agent', label: 'QA Agent' },
    { id: 'devops_agent', label: 'DevOps Agent' },
];

const PLANS: PlanOption[] = [
    { id: 'free', label: '$0/mo' },
    { id: 'growth', label: '$49/mo', recommended: true },
    { id: 'enterprise', label: 'Contact us' },
];

export function registerOnboardingConfigRoutes(app: FastifyInstance): void {
    app.get('/v1/onboarding/agent-roles', async () => {
        return { roles: AGENT_ROLES };
    });

    app.get('/v1/onboarding/plans', async () => {
        return { plans: PLANS };
    });
}
