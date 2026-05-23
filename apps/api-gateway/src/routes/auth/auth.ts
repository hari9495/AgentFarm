import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { buildSessionToken } from '../lib/session-auth.js';
import { isInternalAccessAllowed } from '../lib/internal-login-policy.js';

type SignupBody = {
    name: string;
    email: string;
    password: string;
    companyName: string;
};

type LoginBody = {
    email: string;
    password: string;
};

type UserRecord = {
    id: string;
    tenantId: string;
    passwordHash: string;
    role: string;
};

type SignupResult = {
    tenant: { id: string };
    user: { id: string };
    workspace: { id: string };
    bot: { id: string };
    job: { id: string };
};

export type AuthRepo = {
    findUserByEmail(email: string): Promise<UserRecord | null>;
    runSignupTransaction(input: {
        companyName: string;
        email: string;
        name: string;
        passwordHash: string;
    }): Promise<SignupResult>;
    getWorkspacesForTenant(tenantId: string): Promise<{ id: string }[]>;
};

const getPrismaRepo = async (): Promise<AuthRepo> => {
    const { prisma } = await import('../lib/db.js');

    return {
        async findUserByEmail(email) {
            return prisma.tenantUser.findUnique({ where: { email } });
        },
        async runSignupTransaction({ companyName, email, name, passwordHash }) {
            return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                const tenant = await tx.tenant.create({
                    data: { name: companyName, status: 'pending' },
                });
                const user = await tx.tenantUser.create({
                    data: { tenantId: tenant.id, email, name, passwordHash, role: 'owner' },
                });
                const workspace = await tx.workspace.create({
                    data: { tenantId: tenant.id, name: 'Primary Workspace', status: 'pending' },
                });
                const bot = await tx.bot.create({
                    data: { workspaceId: workspace.id, role: 'developer_agent', status: 'created' },
                });
                const job = await tx.provisioningJob.create({
                    data: {
                        tenantId: tenant.id,
                        workspaceId: workspace.id,
                        botId: bot.id,
                        planId: 'growth',
                        runtimeTier: 'dedicated_vm',
                        roleType: 'developer_agent',
                        correlationId: `corr_signup_${Date.now()}`,
                        triggerSource: 'signup_complete',
                        status: 'queued',
                        requestedBy: user.id,
                        requestedAt: new Date(),
                    },
                });
                await tx.tenant.update({ where: { id: tenant.id }, data: { status: 'provisioning' } });
                await tx.workspace.update({ where: { id: workspace.id }, data: { status: 'provisioning' } });
                return { tenant, user, workspace, bot, job };
            });
        },
        async getWorkspacesForTenant(tenantId) {
            return prisma.workspace.findMany({ where: { tenantId }, select: { id: true } });
        },
    };
};

export type RegisterAuthRoutesOptions = {
    repo?: AuthRepo;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 10;
const SESSION_MAX_AGE = 8 * 3600; // 8 hours in seconds

// Add Secure flag in production (or when explicitly opted in via COOKIE_SECURE=true).
// Without Secure the cookie can travel over plain HTTP, exposing the token to network interception.
const isSecureCookie = (): boolean =>
    process.env['NODE_ENV'] === 'production' || process.env['COOKIE_SECURE'] === 'true';

const setSessionCookie = (token: string): string => {
    const secureFlag = isSecureCookie() ? '; Secure' : '';
    return `agentfarm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/${secureFlag}; Max-Age=${SESSION_MAX_AGE}`;
};

const clearSessionCookie = (): string => {
    const secureFlag = isSecureCookie() ? '; Secure' : '';
    return `agentfarm_session=; HttpOnly; SameSite=Strict; Path=/${secureFlag}; Max-Age=0`;
};

export const registerAuthRoutes = async (
    app: FastifyInstance,
    options: RegisterAuthRoutesOptions = {},
): Promise<void> => {
    const repo = options.repo ?? (await getPrismaRepo());
    /**
     * POST /auth/signup
     * Creates tenant, user, workspace, bot, and queues initial provisioning job.
     * Returns session token in body and sets agentfarm_session HttpOnly cookie.
     */
    app.post<{ Body: SignupBody }>('/auth/signup', async (request, reply) => {
        const body = request.body ?? ({} as SignupBody);
        const { name, email, password, companyName } = body;

        if (!name || typeof name !== 'string' || name.trim().length < 1) {
            return reply.code(400).send({ error: 'validation_failed', field: 'name', message: 'Name is required.' });
        }
        if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
            return reply.code(400).send({ error: 'validation_failed', field: 'email', message: 'Valid email address is required.' });
        }
        if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
            return reply
                .code(400)
                .send({ error: 'validation_failed', field: 'password', message: `Password must be at least ${MIN_PASSWORD_LEN} characters.` });
        }
        if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 1) {
            return reply.code(400).send({ error: 'validation_failed', field: 'companyName', message: 'Company name is required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check email uniqueness before doing any writes
        const existing = await repo.findUserByEmail(normalizedEmail);
        if (existing) {
            return reply.code(409).send({ error: 'email_taken', message: 'An account with this email already exists.' });
        }

        const passwordHash = await hashPassword(password);

        // Atomic transaction: Tenant → TenantUser → Workspace → Bot → ProvisioningJob
        const result = await repo.runSignupTransaction({
            companyName: companyName.trim(),
            email: normalizedEmail,
            name: name.trim(),
            passwordHash,
        });

        const token = buildSessionToken({
            userId: result.user.id,
            tenantId: result.tenant.id,
            workspaceIds: [result.workspace.id],
            role: 'owner',
        });

        return reply
            .code(201)
            .header('Set-Cookie', setSessionCookie(token))
            .send({
                token,
                user_id: result.user.id,
                tenant_id: result.tenant.id,
                workspace_id: result.workspace.id,
                bot_id: result.bot.id,
                provisioning_job_id: result.job.id,
                message: 'Account created. Provisioning is in progress.',
            });
    });

    /**
     * POST /auth/login
     * Verifies email and password and returns a session token.
     * Always runs password verification to prevent timing-based enumeration.
     */
    app.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
        const body = request.body ?? ({} as LoginBody);
        const { email, password } = body;

        if (!email || typeof email !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'email', message: 'Email is required.' });
        }
        if (!password || typeof password !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'password', message: 'Password is required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await repo.findUserByEmail(normalizedEmail);

        // Always run verification to prevent timing-based user enumeration
        const DUMMY_HASH = 'scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
        const passwordValid = user
            ? await verifyPassword(password, user.passwordHash)
            : await verifyPassword(password, DUMMY_HASH);

        if (!user || !passwordValid) {
            return reply.code(401).send({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
        }

        const workspaces = await repo.getWorkspacesForTenant(user.tenantId);

        const token = buildSessionToken({
            userId: user.id,
            tenantId: user.tenantId,
            workspaceIds: workspaces.map((w: { id: string }) => w.id),
            scope: 'customer',
            role: user.role,
        });

        return reply
            .header('Set-Cookie', setSessionCookie(token))
            .send({
                token,
                user_id: user.id,
                tenant_id: user.tenantId,
                workspace_ids: workspaces.map((w: { id: string }) => w.id),
            });
    });

    /**
     * POST /auth/internal-login
     * Authenticates user and returns an internal-scope session token.
     */
    app.post<{ Body: LoginBody }>('/auth/internal-login', async (request, reply) => {
        const body = request.body ?? ({} as LoginBody);
        const { email, password } = body;

        if (!email || typeof email !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'email', message: 'Email is required.' });
        }
        if (!password || typeof password !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'password', message: 'Password is required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await repo.findUserByEmail(normalizedEmail);

        const DUMMY_HASH = 'scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
        const passwordValid = user
            ? await verifyPassword(password, user.passwordHash)
            : await verifyPassword(password, DUMMY_HASH);

        if (!user || !passwordValid) {
            return reply.code(401).send({ error: 'invalid_credentials', message: 'Email or password is incorrect.' });
        }

        if (!isInternalAccessAllowed({ email: normalizedEmail, role: user.role })) {
            return reply.code(403).send({
                error: 'internal_access_denied',
                message: 'Your account is not allowed to use internal login.',
            });
        }

        const workspaces = await repo.getWorkspacesForTenant(user.tenantId);

        const token = buildSessionToken({
            userId: user.id,
            tenantId: user.tenantId,
            workspaceIds: workspaces.map((w: { id: string }) => w.id),
            scope: 'internal',
            role: user.role,
        });

        return reply
            .header('Set-Cookie', setSessionCookie(token))
            .send({
                token,
                user_id: user.id,
                tenant_id: user.tenantId,
                workspace_ids: workspaces.map((w: { id: string }) => w.id),
                scope: 'internal',
            });
    });

    /**
     * POST /auth/logout
     * Clears the session cookie.
     */
    app.post('/auth/logout', async (_request, reply) => {
        return reply.header('Set-Cookie', clearSessionCookie()).send({ message: 'Logged out.' });
    });
};
