import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashPassword, verifyPassword } from '../lib/password.js';

// ── Repo types ────────────────────────────────────────────────────────────────

type PortalTenantRecord = { id: string; status: string };

type PortalAccountRecord = {
    id: string;
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    role: string;
    isActive: boolean;
};

type PortalSessionRecord = {
    id: string;
    accountId: string;
    tenantId: string;
    token: string;
    expiresAt: Date;
    account: PortalAccountRecord;
};

export type PortalAuthRepo = {
    findTenant(id: string): Promise<PortalTenantRecord | null>;
    findAccountByEmail(tenantId: string, email: string): Promise<PortalAccountRecord | null>;
    createAccount(data: {
        tenantId: string;
        email: string;
        passwordHash: string;
        displayName: string | null;
    }): Promise<PortalAccountRecord>;
    createSession(data: {
        accountId: string;
        tenantId: string;
        token: string;
        expiresAt: Date;
    }): Promise<PortalSessionRecord>;
    updateLastLogin(accountId: string): Promise<void>;
    findSessionByToken(token: string): Promise<PortalSessionRecord | null>;
    deleteSession(id: string): Promise<void>;
    updateSessionLastSeen(id: string): Promise<void>;
    updateAccountPassword(accountId: string, passwordHash: string): Promise<void>;
};

export type RegisterPortalAuthRoutesOptions = {
    repo?: PortalAuthRepo;
};

// ── Default Prisma-backed repo ────────────────────────────────────────────────

const getPrismaRepo = async (): Promise<PortalAuthRepo> => {
    const { prisma } = await import('../lib/db.js');

    return {
        async findTenant(id) {
            return prisma.tenant.findUnique({
                where: { id },
                select: { id: true, status: true },
            }) as Promise<PortalTenantRecord | null>;
        },
        async findAccountByEmail(tenantId, email) {
            return prisma.tenantPortalAccount.findUnique({
                where: { tenantId_email: { tenantId, email } },
            }) as Promise<PortalAccountRecord | null>;
        },
        async createAccount({ tenantId, email, passwordHash, displayName }) {
            return prisma.tenantPortalAccount.create({
                data: { tenantId, email, passwordHash, displayName },
            }) as unknown as PortalAccountRecord;
        },
        async createSession({ accountId, tenantId, token, expiresAt }) {
            return prisma.tenantPortalSession.create({
                data: { accountId, tenantId, token, expiresAt },
                include: { account: true },
            }) as unknown as PortalSessionRecord;
        },
        async updateLastLogin(accountId) {
            await prisma.tenantPortalAccount.update({
                where: { id: accountId },
                data: { lastLoginAt: new Date() },
            });
        },
        async findSessionByToken(token) {
            return prisma.tenantPortalSession.findUnique({
                where: { token },
                include: { account: true },
            }) as unknown as PortalSessionRecord | null;
        },
        async deleteSession(id) {
            await prisma.tenantPortalSession.delete({ where: { id } });
        },
        async updateSessionLastSeen(id) {
            await prisma.tenantPortalSession.update({
                where: { id },
                data: { lastSeenAt: new Date() },
            });
        },
        async updateAccountPassword(accountId, passwordHash) {
            await prisma.tenantPortalAccount.update({
                where: { id: accountId },
                data: { passwordHash },
            });
        },
    };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;
const PORTAL_SESSION_COOKIE = 'portal_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Tenants must be in an operational state to allow portal account creation.
const ACTIVE_TENANT_STATUSES = new Set(['pending', 'provisioning', 'ready', 'degraded']);

const isSecureCookie = (): boolean =>
    process.env['NODE_ENV'] === 'production' || process.env['COOKIE_SECURE'] === 'true';

const setPortalSessionCookie = (token: string): string => {
    const secureFlag = isSecureCookie() ? '; Secure' : '';
    return `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${secureFlag}; Max-Age=${SESSION_MAX_AGE}`;
};

const clearPortalSessionCookie = (): string => {
    const secureFlag = isSecureCookie() ? '; Secure' : '';
    return `${PORTAL_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/${secureFlag}; Max-Age=0`;
};

const readPortalCookie = (request: FastifyRequest): string | null => {
    const rawCookie = request.headers['cookie'];
    if (typeof rawCookie !== 'string') return null;
    const item = rawCookie
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${PORTAL_SESSION_COOKIE}=`));
    if (!item) return null;
    return decodeURIComponent(item.slice(PORTAL_SESSION_COOKIE.length + 1));
};

// Dummy hash used to run a real scrypt comparison even when no account is found,
// preventing timing-based user enumeration.
const DUMMY_HASH =
    'scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

// ── Route registration ────────────────────────────────────────────────────────

export const registerPortalAuthRoutes = async (
    app: FastifyInstance,
    options: RegisterPortalAuthRoutesOptions = {},
): Promise<void> => {
    const repo = options.repo ?? (await getPrismaRepo());

    // ── POST /portal/auth/signup ─────────────────────────────────────────────
    app.post<{
        Body: { tenantId?: string; email?: string; password?: string; displayName?: string };
    }>('/portal/auth/signup', async (request, reply) => {
        const body = request.body ?? {};
        const { tenantId, email, password, displayName } = body;

        if (!tenantId || typeof tenantId !== 'string') {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'tenantId',
                message: 'tenantId is required.',
            });
        }
        if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'email',
                message: 'Valid email address is required.',
            });
        }
        if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'password',
                message: `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const tenant = await repo.findTenant(tenantId);
        if (!tenant || !ACTIVE_TENANT_STATUSES.has(tenant.status)) {
            return reply.code(404).send({
                error: 'tenant_not_found',
                message: 'Tenant not found or inactive.',
            });
        }

        const existing = await repo.findAccountByEmail(tenantId, normalizedEmail);
        if (existing) {
            return reply.code(409).send({
                error: 'email_already_registered',
                message: 'This email is already registered for this tenant.',
            });
        }

        const passwordHash = await hashPassword(password);
        const account = await repo.createAccount({
            tenantId,
            email: normalizedEmail,
            passwordHash,
            displayName: displayName ?? null,
        });

        return reply.code(201).send({
            accountId: account.id,
            tenantId: account.tenantId,
            email: account.email,
            role: account.role,
        });
    });

    // ── POST /portal/auth/login ──────────────────────────────────────────────
    app.post<{
        Body: { tenantId?: string; email?: string; password?: string };
    }>('/portal/auth/login', async (request, reply) => {
        const body = request.body ?? {};
        const { tenantId, email, password } = body;

        if (!tenantId || typeof tenantId !== 'string') {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'tenantId',
                message: 'tenantId is required.',
            });
        }
        if (!email || typeof email !== 'string') {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'email',
                message: 'Email is required.',
            });
        }
        if (!password || typeof password !== 'string') {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'password',
                message: 'Password is required.',
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const account = await repo.findAccountByEmail(tenantId, normalizedEmail);

        // Always run verification to prevent timing-based user enumeration.
        const passwordValid = account
            ? await verifyPassword(password, account.passwordHash)
            : await verifyPassword(password, DUMMY_HASH);

        if (!account || !passwordValid) {
            return reply.code(401).send({
                error: 'invalid_credentials',
                message: 'Email or password is incorrect.',
            });
        }

        if (!account.isActive) {
            return reply.code(403).send({
                error: 'account_inactive',
                message: 'This account has been deactivated.',
            });
        }

        const token = randomUUID();
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

        const session = await repo.createSession({
            accountId: account.id,
            tenantId: account.tenantId,
            token,
            expiresAt,
        });

        await repo.updateLastLogin(account.id);

        return reply
            .header('Set-Cookie', setPortalSessionCookie(token))
            .send({
                accountId: account.id,
                tenantId: account.tenantId,
                email: account.email,
                displayName: account.displayName,
                role: account.role,
                expiresAt: session.expiresAt.toISOString(),
            });
    });

    // ── POST /portal/auth/logout ─────────────────────────────────────────────
    app.post('/portal/auth/logout', async (request, reply) => {
        const token = readPortalCookie(request);
        if (token) {
            const session = await repo.findSessionByToken(token);
            if (session) {
                await repo.deleteSession(session.id);
            }
        }
        return reply
            .header('Set-Cookie', clearPortalSessionCookie())
            .send({ ok: true });
    });

    // ── GET /portal/auth/me ──────────────────────────────────────────────────
    app.get('/portal/auth/me', async (request, reply) => {
        const token = readPortalCookie(request);
        if (!token) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const session = await repo.findSessionByToken(token);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (session.expiresAt < new Date()) {
            await repo.deleteSession(session.id);
            return reply.code(401).send({ error: 'session_expired' });
        }

        await repo.updateSessionLastSeen(session.id);

        return reply.send({
            accountId: session.accountId,
            tenantId: session.tenantId,
            email: session.account.email,
            displayName: session.account.displayName,
            role: session.account.role,
        });
    });

    // ── POST /portal/auth/change-password ────────────────────────────────────
    app.post<{
        Body: { currentPassword?: string; newPassword?: string };
    }>('/portal/auth/change-password', async (request, reply) => {
        const token = readPortalCookie(request);
        if (!token) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const session = await repo.findSessionByToken(token);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (session.expiresAt < new Date()) {
            await repo.deleteSession(session.id);
            return reply.code(401).send({ error: 'session_expired' });
        }

        const body = request.body ?? {};
        const { currentPassword, newPassword } = body;

        if (!currentPassword || typeof currentPassword !== 'string') {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'currentPassword',
                message: 'currentPassword is required.',
            });
        }
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LEN) {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'newPassword',
                message: `newPassword must be at least ${MIN_PASSWORD_LEN} characters.`,
            });
        }

        const passwordValid = await verifyPassword(currentPassword, session.account.passwordHash);
        if (!passwordValid) {
            return reply.code(401).send({
                error: 'invalid_credentials',
                message: 'Current password is incorrect.',
            });
        }

        const newHash = await hashPassword(newPassword);
        await repo.updateAccountPassword(session.accountId, newHash);

        return reply.send({ ok: true });
    });
};
