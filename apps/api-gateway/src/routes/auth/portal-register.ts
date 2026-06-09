import { randomBytes, randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { hashPassword } from '../../lib/password.js';
import { sendVerificationEmail } from '../../lib/portal-email.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

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
     * owner TenantPortalAccount in one transaction.
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

        // ── Prepare password hash + verification token before the transaction ─
        const passwordHash = await hashPassword(password);
        const verificationToken = skipVerification ? null : randomUUID();
        const verifyUrl = verificationToken
            ? `${appBaseUrl}/portal/verify-email?token=${encodeURIComponent(verificationToken)}`
            : null;

        // ── Create Tenant + Workspace + PortalAccount atomically ──────────────
        let accountId: string;
        try {
            const result = await prisma.$transaction(async (tx) => {
                await tx.tenant.create({
                    data: {
                        id: tenantId,
                        name: companyName.trim(),
                        status: 'pending',
                    },
                });

                await tx.workspace.create({
                    data: {
                        tenantId,
                        name: 'Default Workspace',
                        status: 'pending',
                    },
                });

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

                return acc;
            });

            accountId = result.id;
        } catch (err: unknown) {
            // Duplicate email within this tenant (race condition)
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
            email: normalizedEmail,
            role: 'owner',
            emailVerified: skipVerification,
            // Always include verifyUrl in response so the signup page can show it
            // as a fallback if email delivery is unavailable.
            ...(verifyUrl ? { verifyUrl } : {}),
        });
    });
};
