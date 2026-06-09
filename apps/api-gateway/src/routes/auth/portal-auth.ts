import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../../lib/portal-email.js';

// ── In-memory rate limiter for forgot-password (3 req/hr per email) ──────────
const forgotPwRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkForgotPasswordRate(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const WINDOW_MS = 60 * 60 * 1_000; // 1 hour
    const MAX = 3;
    const entry = forgotPwRateLimitMap.get(key);
    if (!entry || entry.resetAt < now) {
        forgotPwRateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= MAX) {
        return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1_000) };
    }
    entry.count++;
    return { allowed: true, retryAfterSeconds: 0 };
}

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
    isEmailVerified: boolean;
    emailVerificationToken: string | null;
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
    findTenantsByEmail(email: string): Promise<Array<{ tenantId: string; tenantName: string }>>;
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
    updateProfile(accountId: string, data: { displayName?: string }): Promise<void>;
    // Password reset
    createResetToken(data: { accountId: string; tenantId: string; token: string; expiresAt: Date }): Promise<void>;
    findResetToken(token: string): Promise<{ id: string; accountId: string; tenantId: string; expiresAt: Date; usedAt: Date | null } | null>;
    markResetTokenUsed(id: string): Promise<void>;
    // Email verification
    setVerificationToken(accountId: string, token: string): Promise<void>;
    findAccountByVerificationToken(token: string): Promise<PortalAccountRecord | null>;
    markEmailVerified(accountId: string): Promise<void>;
};

export type RegisterPortalAuthRoutesOptions = {
    repo?: PortalAuthRepo;
};

// ── Default Prisma-backed repo ────────────────────────────────────────────────

const getPrismaRepo = async (): Promise<PortalAuthRepo> => {
    const { prisma } = await import('../../lib/db.js');

    return {
        async findTenant(id) {
            return prisma.tenant.findUnique({
                where: { id },
                select: { id: true, status: true },
            }) as Promise<PortalTenantRecord | null>;
        },
        async findTenantsByEmail(email) {
            const accounts = await prisma.tenantPortalAccount.findMany({
                where: { email, isActive: true },
                select: { tenantId: true },
            });
            if (accounts.length === 0) return [];
            const tenantIds = accounts.map((a) => a.tenantId);
            const tenants = await prisma.tenant.findMany({
                where: { id: { in: tenantIds } },
                select: { id: true, name: true },
            });
            return tenants.map((t) => ({ tenantId: t.id, tenantName: t.name }));
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
        async updateProfile(accountId, data) {
            await prisma.tenantPortalAccount.update({
                where: { id: accountId },
                data: { displayName: data.displayName },
            });
        },
        async createResetToken({ accountId, tenantId, token, expiresAt }) {
            await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>)['tenantPasswordResetToken']!.create({
                data: { accountId, tenantId, token, expiresAt },
            });
        },
        async findResetToken(token) {
            const model = (prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)['tenantPasswordResetToken'];
            if (!model) return null;
            return model.findUnique({ where: { token } }) as Promise<{ id: string; accountId: string; tenantId: string; expiresAt: Date; usedAt: Date | null } | null>;
        },
        async markResetTokenUsed(id) {
            await (prisma as unknown as Record<string, { update: (a: unknown) => Promise<unknown> }>)['tenantPasswordResetToken']!.update({
                where: { id },
                data: { usedAt: new Date() },
            });
        },
        async setVerificationToken(accountId, token) {
            await prisma.tenantPortalAccount.update({
                where: { id: accountId },
                data: { emailVerificationToken: token },
            });
        },
        async findAccountByVerificationToken(token) {
            return prisma.tenantPortalAccount.findUnique({
                where: { emailVerificationToken: token },
            }) as unknown as PortalAccountRecord | null;
        },
        async markEmailVerified(accountId) {
            await prisma.tenantPortalAccount.update({
                where: { id: accountId },
                data: { isEmailVerified: true, emailVerifiedAt: new Date(), emailVerificationToken: null },
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

        // Issue a verification token and send email — fire-and-forget
        const verificationToken = randomUUID();
        void repo.setVerificationToken(account.id, verificationToken).then(async () => {
            const appBaseUrl = process.env['PORTAL_APP_BASE_URL'] ?? 'http://localhost:3001';
            const verifyUrl = `${appBaseUrl}/portal/verify-email?token=${encodeURIComponent(verificationToken)}`;
            void sendVerificationEmail({ to: normalizedEmail, tenantId, verifyUrl }).catch(() => {/* best-effort */});
        }).catch(() => {/* best-effort */});

        const extra = process.env['NODE_ENV'] !== 'production' ? {
            verifyUrl: `${process.env['PORTAL_APP_BASE_URL'] ?? 'http://localhost:3001'}/portal/verify-email?token=${encodeURIComponent(verificationToken)}`,
        } : {};

        return reply.code(201).send({
            accountId: account.id,
            tenantId: account.tenantId,
            email: account.email,
            role: account.role,
            emailVerified: false,
            ...extra,
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

        if (!account.isEmailVerified) {
            return reply.code(403).send({
                error: 'email_not_verified',
                message: 'Please verify your email address before signing in. Check your inbox for the verification link.',
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

    // ── POST /portal/auth/forgot-password ────────────────────────────────────
    // Always returns { ok: true } — never reveals whether the email exists.
    // In dev (NODE_ENV !== 'production') also returns resetUrl for easy testing.
    app.post<{
        Body: { tenantId?: string; email?: string };
    }>('/portal/auth/forgot-password', async (request, reply) => {
        const body = request.body ?? {};
        const { tenantId, email } = body;

        if (!tenantId || typeof tenantId !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'tenantId', message: 'tenantId is required.' });
        }
        if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
            return reply.code(400).send({ error: 'validation_failed', field: 'email', message: 'Valid email address is required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Rate-limit: max 3 reset requests per email per hour
        const rlKey = `${tenantId}:${normalizedEmail}`;
        const rl = checkForgotPasswordRate(rlKey);
        if (!rl.allowed) {
            return reply.code(429).send({
                error: 'too_many_requests',
                message: 'Too many password reset requests. Please wait before trying again.',
                retryAfterSeconds: rl.retryAfterSeconds,
            });
        }

        const account = await repo.findAccountByEmail(tenantId, normalizedEmail);

        // Silently succeed — don't reveal whether the account exists
        if (!account || !account.isActive) {
            return reply.send({ ok: true });
        }

        const token = randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await repo.createResetToken({ accountId: account.id, tenantId: account.tenantId, token, expiresAt });

        const appBaseUrl = process.env['PORTAL_APP_BASE_URL'] ?? 'http://localhost:3001';
        const resetUrl = `${appBaseUrl}/portal/reset-password?token=${encodeURIComponent(token)}`;

        // Send via Resend / webhook / console — fire-and-forget
        void sendPasswordResetEmail({
            to: normalizedEmail,
            tenantId: account.tenantId,
            resetUrl,
            expiresAt: expiresAt.toISOString(),
        }).catch(() => {/* best-effort */});

        // Dev convenience: return the reset URL so the dashboard can surface it for testing
        const extra = process.env['NODE_ENV'] !== 'production' ? { resetUrl } : {};
        return reply.send({ ok: true, ...extra });
    });

    // ── POST /portal/auth/reset-password ─────────────────────────────────────
    app.post<{
        Body: { token?: string; newPassword?: string };
    }>('/portal/auth/reset-password', async (request, reply) => {
        const body = request.body ?? {};
        const { token, newPassword } = body;

        if (!token || typeof token !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'token', message: 'token is required.' });
        }
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LEN) {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'newPassword',
                message: `newPassword must be at least ${MIN_PASSWORD_LEN} characters.`,
            });
        }

        const resetToken = await repo.findResetToken(token);
        if (!resetToken) {
            return reply.code(400).send({ error: 'invalid_token', message: 'Reset token is invalid or has expired.' });
        }
        if (resetToken.usedAt) {
            return reply.code(400).send({ error: 'token_already_used', message: 'This reset link has already been used.' });
        }
        if (resetToken.expiresAt < new Date()) {
            return reply.code(400).send({ error: 'token_expired', message: 'Reset link has expired. Please request a new one.' });
        }

        const newHash = await hashPassword(newPassword);
        await repo.updateAccountPassword(resetToken.accountId, newHash);
        await repo.markResetTokenUsed(resetToken.id);

        return reply.send({ ok: true });
    });

    // ── PATCH /portal/auth/profile ────────────────────────────────────────────
    app.patch<{
        Body: { displayName?: string };
    }>('/portal/auth/profile', async (request, reply) => {
        const token = readPortalCookie(request);
        if (!token) return reply.code(401).send({ error: 'unauthorized' });

        const session = await repo.findSessionByToken(token);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if (session.expiresAt < new Date()) {
            await repo.deleteSession(session.id);
            return reply.code(401).send({ error: 'session_expired' });
        }

        const { displayName } = request.body ?? {};
        if (typeof displayName !== 'string' && displayName !== undefined) {
            return reply.code(400).send({ error: 'validation_failed', field: 'displayName', message: 'displayName must be a string.' });
        }

        await repo.updateProfile(session.accountId, { displayName: displayName?.trim() || undefined });
        await repo.updateSessionLastSeen(session.id);

        return reply.send({ ok: true, displayName: displayName?.trim() || null });
    });

    // ── GET /portal/auth/verify-email?token= ─────────────────────────────────
    app.get<{ Querystring: { token?: string } }>('/portal/auth/verify-email', async (request, reply) => {
        const { token } = request.query;
        if (!token || typeof token !== 'string') {
            return reply.code(400).send({ error: 'token_required', message: 'Verification token is required.' });
        }

        const account = await repo.findAccountByVerificationToken(token);
        if (!account) {
            return reply.code(400).send({ error: 'invalid_token', message: 'Verification link is invalid or has already been used.' });
        }

        if (account.isEmailVerified) {
            return reply.send({ ok: true, alreadyVerified: true });
        }

        await repo.markEmailVerified(account.id);
        return reply.send({ ok: true, alreadyVerified: false });
    });

    // ── POST /portal/auth/resend-verification ────────────────────────────────
    app.post<{
        Body: { tenantId?: string; email?: string };
    }>('/portal/auth/resend-verification', async (request, reply) => {
        const body = request.body ?? {};
        const { tenantId, email } = body;

        if (!tenantId || typeof tenantId !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'tenantId', message: 'tenantId is required.' });
        }
        if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
            return reply.code(400).send({ error: 'validation_failed', field: 'email', message: 'Valid email address is required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Rate-limit same as forgot-password
        const rl = checkForgotPasswordRate(`verify:${tenantId}:${normalizedEmail}`);
        if (!rl.allowed) {
            return reply.code(429).send({ error: 'too_many_requests', message: 'Too many requests. Please wait before trying again.' });
        }

        const account = await repo.findAccountByEmail(tenantId, normalizedEmail);

        // Anti-enumeration: always return ok
        if (account && account.isActive && !account.isEmailVerified) {
            const newToken = randomUUID();
            await repo.setVerificationToken(account.id, newToken);
            const appBaseUrl = process.env['PORTAL_APP_BASE_URL'] ?? 'http://localhost:3001';
            const verifyUrl = `${appBaseUrl}/portal/verify-email?token=${encodeURIComponent(newToken)}`;
            void sendVerificationEmail({ to: normalizedEmail, tenantId, verifyUrl }).catch(() => {/* best-effort */});
            const extra = process.env['NODE_ENV'] !== 'production' ? { verifyUrl } : {};
            return reply.send({ ok: true, ...extra });
        }

        return reply.send({ ok: true });
    });

    // ── GET /portal/auth/lookup-tenant?email= ────────────────────────────────
    // Returns the tenant(s) associated with an email — allows the login page
    // to work with just email + password (no tenant ID field required).
    // Anti-enumeration: always returns 200 (empty array if no match).
    app.get<{ Querystring: { email?: string } }>('/portal/auth/lookup-tenant', async (request, reply) => {
        const { email } = request.query;
        if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
            return reply.send({ tenants: [] });
        }
        const tenants = await repo.findTenantsByEmail(email.trim().toLowerCase());
        return reply.send({ tenants });
    });
};
