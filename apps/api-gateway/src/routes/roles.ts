import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RoleCatalogRecord, RoleKey, TenantRoleSubscriptionRecord } from '@agentfarm/shared-types';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type RegisterRoleRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

type TenantParams = {
    tenantId: string;
};

const ROLE_CATALOG: RoleCatalogRecord[] = [
    {
        roleKey: 'recruiter',
        displayName: 'Recruiter',
        roleVersion: 'v1',
        description: 'Sources candidates, evaluates profiles, and coordinates hiring workflows.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'developer',
        displayName: 'Developer',
        roleVersion: 'v1',
        description: 'Implements scoped engineering changes with connector-backed execution.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'fullstack_developer',
        displayName: 'Fullstack Developer',
        roleVersion: 'v1',
        description: 'Delivers frontend and backend implementation workflows end to end.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'tester',
        displayName: 'Tester',
        roleVersion: 'v1',
        description: 'Designs and runs validation plans, and reports regressions and risks.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'business_analyst',
        displayName: 'Business Analyst',
        roleVersion: 'v1',
        description: 'Creates requirement clarity, acceptance criteria, and process insights.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'technical_writer',
        displayName: 'Technical Writer',
        roleVersion: 'v1',
        description: 'Produces technical documentation, release notes, and operational guides.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'content_writer',
        displayName: 'Content Writer',
        roleVersion: 'v1',
        description: 'Builds product content, messaging, and campaign copy across channels.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'sales_rep',
        displayName: 'Sales Representative',
        roleVersion: 'v1',
        description: 'Supports lead follow-up, outreach, and sales pipeline progression.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'marketing_specialist',
        displayName: 'Marketing Specialist',
        roleVersion: 'v1',
        description: 'Runs campaign execution, messaging experiments, and outreach loops.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'corporate_assistant',
        displayName: 'Corporate Assistant',
        roleVersion: 'v1',
        description: 'Coordinates day-to-day scheduling, notes, and follow-up workflows.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'customer_support_executive',
        displayName: 'Customer Support Executive',
        roleVersion: 'v1',
        description: 'Handles customer tickets, responses, and support escalation handoffs.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
    {
        roleKey: 'project_manager_product_owner_scrum_master',
        displayName: 'Project Manager / Product Owner / Scrum Master',
        roleVersion: 'v1',
        description: 'Coordinates execution plans, backlog flow, and cross-team delivery cadence.',
        defaultPolicyPackVersion: 'rbac-rolepack-v1',
        active: true,
    },
];

const ROLE_KEYS = new Set<RoleKey>(ROLE_CATALOG.map((entry) => entry.roleKey));

const normalizeRoleKey = (value: string): RoleKey | null => {
    const normalized = value.trim().toLowerCase() as RoleKey;
    return ROLE_KEYS.has(normalized) ? normalized : null;
};

const toRoleSubscriptions = async (tenantId: string): Promise<TenantRoleSubscriptionRecord[]> => {
    const prisma = await getPrisma();
    const [tenant, bots] = await Promise.all([
        prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, createdAt: true },
        }),
        prisma.bot.findMany({
            where: { workspace: { tenantId } },
            select: { role: true },
        }),
    ]);

    if (!tenant) {
        return [];
    }

    const counts = new Map<RoleKey, number>();
    for (const bot of bots) {
        const roleKey = normalizeRoleKey(bot.role);
        if (!roleKey) {
            continue;
        }
        counts.set(roleKey, (counts.get(roleKey) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([roleKey, purchasedQuantity], index) => ({
            id: `${tenantId}:${roleKey}:${index + 1}`,
            tenantId,
            roleKey,
            purchasedQuantity,
            status: 'active',
            activeFrom: tenant.createdAt.toISOString(),
            activeTo: undefined,
        }));
};

export const registerRoleRoutes = async (
    app: FastifyInstance,
    options: RegisterRoleRoutesOptions,
): Promise<void> => {
    app.get('/v1/roles/catalog', async (_request) => {
        return {
            roles: ROLE_CATALOG,
        };
    });

    app.get<{ Params: TenantParams }>('/v1/tenants/:tenantId/role-subscriptions', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const { tenantId } = request.params;
        if (tenantId !== session.tenantId) {
            return reply.code(403).send({
                error: 'tenant_scope_violation',
                message: 'tenantId is outside your authenticated tenant scope.',
            });
        }

        const subscriptions = await toRoleSubscriptions(tenantId);

        return {
            tenant_id: tenantId,
            subscriptions,
        };
    });
};

export type {
    RegisterRoleRoutesOptions,
    SessionContext,
};
