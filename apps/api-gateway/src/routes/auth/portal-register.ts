import { randomBytes, randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { hashPassword } from '../../lib/password.js';
import { sendVerificationEmail } from '../../lib/portal-email.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

// Free starter plan — seeded in the Plan table (priceUsd=0, agentSlots=1).
const FREE_PLAN_ID = 'starter';

/** Convert a company name to a URL-safe slug (max 30 chars). */
function toSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);
}

// ── route ─────────────────────────────────────────────────────────────────────

export const registerPortalRegisterRoute = async (app: FastifyInstance): Promise<void> => {
    const { prisma } = await import('../../lib/db.js');

    /**
     * POST /portal/auth/register
     *
     * Self-service signup: creates a new Tenant, a default Workspace, and the
     * owner TenantPortalAccount in one transaction. Also automatically assigns
     * the free Starter plan subscription and queues a provisioning job for
     * the customer's first agent — no order or payment required.
     *
     * Set PORTAL_SKIP_EMAIL_VERIFICATION=true to bypass email verification
     * (useful for local / demo environments with no SMTP).
     */
    app.post<{
        Body: { companyName?: string; email?: string; password?: string; displayName?: string };
    }>('/portal/auth/register', async (request, reply) => {
        const body = request.body ?? {};
        const { companyName, email, password, displayName } = body;

        // ── Validation ────────────────────────────────────────────────────────
        if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
            return reply.code(400).send({
                error: 'validation_failed',
                field: 'companyName',
                message: 'Company name must be at least 2 characters.',
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
        const slug = toSlug(companyName.trim());
        const skipVerification = process.env['PORTAL_SKIP_EMAIL_VERIFICATION'] === 'true';
        const appBaseUrl = process.env['PORTAL_APP_BASE_URL'] ?? 'http://localhost:3002';

        // ── Generate a unique tenant ID ───────────────────────────────────────
        let tenantId = '';
        for (let i = 0; i < 10; i++) {
            const suffix = randomBytes(3).toString('hex'); // 6 hex chars
            const candidate = `${slug}-${suffix}`;
            const exists = await prisma.tenant.findUnique({
                where: { id: candidate },
                select: { id: true },
            });
            if (!exists) {
                tenantId = candidate;
                break;
            }
        }
        if (!tenantId) {
            return reply.code(500).send({
                error: 'server_error',
                message: 'Could not generate a unique tenant ID. Please try again.',
            });
        }

        // ── Verify the starter plan exists ────────────────────────────────────
        const plan = await prisma.plan.findUnique({
            where: { id: FREE_PLAN_ID },
            select: { id: true, roleType: true },
        });
        if (!plan) {
            return reply.code(500).send({
                error: 'server_error',
                message: 'Free plan is not configured. Contact support.',
            });
        }
        const roleType: string = (plan as unknown as { roleType: string }).roleType ?? 'developer_agent';

        // ── Prepare password hash + verification token before the transaction ─
        const passwordHash = await hashPassword(password);
        const verificationToken = skipVerification ? null : randomUUID();
        const verifyUrl = verificationToken
            ? `${appBaseUrl}/portal/verify-email?token=${encodeURIComponent(verificationToken)}`
            : null;

        // ── IDs to be created ─────────────────────────────────────────────────
        const now = new Date();
        const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

        // ── Atomic transaction: Tenant + Workspace + Subscription + Bot + Job ─
        let accountId: string;
        let botId: string;
        let jobId: string;
        try {
            const result = await prisma.$transaction(async (tx) => {
                // 1. Tenant
                await tx.tenant.create({
                    data: { id: tenantId, name: companyName.trim(), status: 'pending' },
                });

                // 2. Default workspace
                const workspace = await tx.workspace.create({
                    data: { tenantId, name: 'Default Workspace', status: 'pending' },
                });

                // 3. Free starter subscription (1 year, no payment provider)
                await tx.tenantSubscription.create({
                    data: {
                        tenantId,
                        planId: FREE_PLAN_ID,
                        paymentProvider: 'system',
                        startedAt: now,
                        expiresAt: oneYearLater,
                        status: 'active',
                    },
                });

                // 4. Portal owner account
                const acc = await tx.tenantPortalAccount.create({
                    data: {
                        tenantId,
                        email: normalizedEmail,
                        passwordHash,
                        displayName: displayName?.trim() || null,
                        role: 'owner',
                        isEmailVerified: skipVerification,
                        emailVerifiedAt: skipVerification ? new Date() : null,
                        emailVerificationToken: verificationToken,
                    },
                });

                // 5. Starter bot (1 agent slot on free plan)
                const bot = await (tx.bot as unknown as {
                    create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }>;
                }).create({
                    data: {
                        workspaceId: workspace.id,
                        role: roleType,
                        status: 'created',
                    },
                });

                // 6. Provisioning job (no orderId — free plan doesn't need a paid order)
                const job = await tx.provisioningJob.create({
                    data: {
                        tenantId,
                        workspaceId: workspace.id,
                        botId: bot.id,
                        planId: FREE_PLAN_ID,
                        runtimeTier: 'shared_vm',
                        roleType,
                        correlationId: `corr_free_${Date.now().toString(36)}`,
                        triggerSource: 'self_signup',
                        status: 'queued',
                        requestedBy: acc.id,
                        requestedAt: now,
                        triggeredBy: 'customer',
                        metadata: JSON.stringify({
                            planName: 'Starter',
                            customerEmail: normalizedEmail,
                            agentSlots: 1,
                            roleType,
                            autoProvisioned: true,
                        }),
                    },
                });

                return { acc, bot, job };
            });

            accountId = result.acc.id;
            botId = result.bot.id;
            jobId = result.job.id;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Unique constraint')) {
                return reply.code(409).send({
                    error: 'email_already_registered',
                    message: 'An account with this email already exists.',
                });
            }
            throw err;
        }

        // ── Send verification email (fire-and-forget) ─────────────────────────
        if (verifyUrl) {
            void sendVerificationEmail({ to: normalizedEmail, tenantId, verifyUrl }).catch(() => {
                // best-effort — failure is already logged inside sendVerificationEmail
            });
        }

        return reply.code(201).send({
            tenantId,
            accountId,
            botId,
            jobId,
            email: normalizedEmail,
            role: 'owner',
            plan: FREE_PLAN_ID,
            emailVerified: skipVerification,
            ...(verifyUrl ? { verifyUrl } : {}),
        });
    });
};
