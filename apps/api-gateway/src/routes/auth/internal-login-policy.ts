import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
    buildSanitizedInternalLoginPolicyReport,
    getInternalLoginPolicyConfig,
    type InternalLoginPolicyConfig,
} from '../lib/internal-login-policy.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope: 'customer' | 'internal';
    expiresAt: number;
};

type RegisterInternalLoginPolicyRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    getPolicyConfig?: () => InternalLoginPolicyConfig;
};

export const registerInternalLoginPolicyRoutes = async (
    app: FastifyInstance,
    options: RegisterInternalLoginPolicyRoutesOptions,
): Promise<void> => {
    const resolvePolicyConfig = options.getPolicyConfig ?? getInternalLoginPolicyConfig;

    app.get('/v1/auth/internal-login-policy', async (request, reply) => {
        const session = options.getSession(request);

        if (!session || session.scope !== 'internal') {
            return reply.code(403).send({
                error: 'forbidden',
                message: 'Internal session required for internal policy diagnostics.',
            });
        }

        const policy = resolvePolicyConfig();

        return {
            policy: buildSanitizedInternalLoginPolicyReport(policy),
        };
    });
};

export type { RegisterInternalLoginPolicyRoutesOptions, SessionContext };
