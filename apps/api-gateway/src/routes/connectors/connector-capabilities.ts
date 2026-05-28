/**
 * GET /v1/connectors/capabilities
 *
 * Returns the tenant's agent capability sections — one section per AgentRoleKey,
 * tagged `purchased: true` if the tenant has at least one active bot with that role.
 *
 * Purchased sections include the full list of connectors the agent is allowed to use
 * (sourced from CONNECTOR_REGISTRY.allowedRoles). Unpurchased sections include only
 * role metadata and feature highlights so the customer can see what they would unlock.
 *
 * Used by the dashboard Connector Marketplace page to render per-agent sections.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    CONNECTOR_REGISTRY,
    AGENT_ROLE_META,
    AGENT_GROUP_LABELS,
    type AgentRoleKey,
    type AgentGroup,
    type ConnectorDefinition,
} from '@agentfarm/connector-contracts';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export interface AgentCapabilitySection {
    roleKey: AgentRoleKey;
    displayName: string;
    tagline: string;
    group: AgentGroup;
    groupLabel: string;
    featureHighlights: string[];
    purchased: boolean;
    botCount: number;
    connectors: Pick<ConnectorDefinition, 'tool' | 'displayName' | 'category' | 'authMethod' | 'docsUrl' | 'configSchema'>[];
}

export interface CapabilitiesResponse {
    sections: AgentCapabilitySection[];
    purchasedRoleKeys: AgentRoleKey[];
    totalPurchased: number;
    totalAvailable: number;
}

const ALL_ROLE_KEYS: AgentRoleKey[] = [
    'developer',
    'fullstack_developer',
    'tester',
    'devops_engineer',
    'business_analyst',
    'project_manager_product_owner_scrum_master',
    'technical_writer',
    'content_writer',
    'marketing_specialist',
    'sales_rep',
    'recruiter',
    'corporate_assistant',
    'customer_support_executive',
];

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

export interface RegisterConnectorCapabilitiesOptions {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
}

export const registerConnectorCapabilitiesRoutes = async (
    app: FastifyInstance,
    options: RegisterConnectorCapabilitiesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    /**
     * GET /v1/connectors/capabilities
     * Returns capability sections for every agent role, tagged purchased/locked.
     */
    app.get('/v1/connectors/capabilities', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const db = await resolvePrisma();

        // Fetch all active bots for this tenant to determine purchased roles
        const bots = await db.bot.findMany({
            where: { workspace: { tenantId: session.tenantId } },
            select: { role: true },
        });

        // Count bots per role
        const botCountByRole = new Map<string, number>();
        for (const bot of bots) {
            if (bot.role) {
                botCountByRole.set(bot.role, (botCountByRole.get(bot.role) ?? 0) + 1);
            }
        }

        const purchasedRoleKeys = ALL_ROLE_KEYS.filter((r) => (botCountByRole.get(r) ?? 0) > 0);

        // Build sections — purchased first, then locked
        const sections: AgentCapabilitySection[] = ALL_ROLE_KEYS.map((roleKey) => {
            const meta = AGENT_ROLE_META[roleKey];
            const botCount = botCountByRole.get(roleKey) ?? 0;
            const purchased = botCount > 0;

            // Connectors allowed for this role
            const allowedConnectors = purchased
                ? CONNECTOR_REGISTRY
                    .filter((c) => !c.allowedRoles || c.allowedRoles.includes(roleKey))
                    .map(({ tool, displayName, category, authMethod, docsUrl, configSchema }) => ({
                        tool, displayName, category, authMethod, docsUrl, configSchema,
                    }))
                : [];

            return {
                roleKey,
                displayName: meta.displayName,
                tagline: meta.tagline,
                group: meta.group,
                groupLabel: AGENT_GROUP_LABELS[meta.group],
                featureHighlights: meta.featureHighlights,
                purchased,
                botCount,
                connectors: allowedConnectors,
            };
        }).sort((a, b) => {
            // Purchased sections first
            if (a.purchased && !b.purchased) return -1;
            if (!a.purchased && b.purchased) return 1;
            return 0;
        });

        const response: CapabilitiesResponse = {
            sections,
            purchasedRoleKeys,
            totalPurchased: purchasedRoleKeys.length,
            totalAvailable: ALL_ROLE_KEYS.length,
        };

        return reply.send(response);
    });
};
