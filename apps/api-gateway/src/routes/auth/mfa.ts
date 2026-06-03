/**
 * MFA routes — TOTP-based Multi-Factor Authentication
 *
 * Flow:
 *   Setup:   POST /v1/auth/mfa/setup          → returns otpauth URI + QR code SVG
 *            POST /v1/auth/mfa/setup/confirm   → verifies first TOTP code, enables MFA
 *   Login:   POST /v1/auth/login returns { mfa_required: true, mfa_token }
 *            POST /v1/auth/mfa/verify          → validates TOTP, issues full session
 *   Disable: DELETE /v1/auth/mfa               → disables MFA (requires live TOTP code)
 *
 * Security:
 *   - TOTP secrets are encrypted with AES-256-GCM before storage (key = MFA_ENCRYPTION_KEY env)
 *   - mfa_token is a short-lived (5 min) signed JWT scoped only to MFA verification
 *   - Brute-force protected by the existing per-IP rate limiter (20 req/min on auth routes)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { TOTP, generateURI } from 'otplib';
import QRCode from 'qrcode';

// Shared TOTP instance — RFC 6238 defaults: SHA-1, 6 digits, 30s step
const totp = new TOTP();
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Crypto helpers — AES-256-GCM for TOTP secret at rest
// ---------------------------------------------------------------------------

function getMfaKey(): Buffer {
    const raw = process.env['MFA_ENCRYPTION_KEY'] ?? '';
    if (!raw || raw.length < 32) {
        throw new Error('MFA_ENCRYPTION_KEY must be set and at least 32 characters');
    }
    // Derive a 32-byte key using HMAC-SHA256 so the env var can be any length
    return Buffer.from(createHmac('sha256', raw).update('agentfarm-mfa-v1').digest());
}

function encryptSecret(plaintext: string): string {
    const key = getMfaKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv(hex):tag(hex):ciphertext(hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(stored: string): string {
    const key = getMfaKey();
    const [ivHex, tagHex, ctHex] = stored.split(':');
    if (!ivHex || !tagHex || !ctHex) throw new Error('Invalid encrypted secret format');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct) + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// Short-lived MFA challenge token (scoped JWT via HMAC-SHA256)
// ---------------------------------------------------------------------------

const MFA_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function issueMfaToken(userId: string, sessionSecret: string): string {
    const payload = { userId, exp: Date.now() + MFA_TOKEN_TTL_MS };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', sessionSecret + ':mfa').update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifyMfaToken(token: string, sessionSecret: string): { userId: string } {
    const [data, sig] = token.split('.');
    if (!data || !sig) throw new Error('malformed MFA token');
    const expected = createHmac('sha256', sessionSecret + ':mfa').update(data).digest('base64url');
    if (sig !== expected) throw new Error('invalid MFA token signature');
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
        userId: string; exp: number;
    };
    if (Date.now() > payload.exp) throw new Error('MFA token expired');
    return { userId: payload.userId };
}

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type MfaRouteOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    sessionSecret: string;
    buildSessionToken: (payload: {
        userId: string;
        tenantId: string;
        workspaceIds: string[];
    }) => string;
};

// ---------------------------------------------------------------------------
// Register MFA routes
// ---------------------------------------------------------------------------

export async function registerMfaRoutes(app: FastifyInstance, options: MfaRouteOptions): Promise<void> {
    const { getSession, sessionSecret, buildSessionToken } = options;

    const getPrisma = async () => {
        const db = await import('../../lib/db.js');
        return db.prisma;
    };

    // ── POST /v1/auth/mfa/setup ──────────────────────────────────────────────
    // Generates a new TOTP secret and returns the otpauth URI + QR code SVG.
    // Requires an authenticated session. Does NOT enable MFA yet — the user
    // must confirm with their first valid TOTP code via /setup/confirm.
    app.post('/v1/auth/mfa/setup', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const prisma = await getPrisma();
        const user = await prisma.tenantUser.findUnique({
            where: { id: session.userId },
            select: { email: true, totpEnabled: true },
        });
        if (!user) return reply.code(404).send({ error: 'user_not_found' });
        if (user.totpEnabled) {
            return reply.code(409).send({
                error: 'mfa_already_enabled',
                message: 'MFA is already enabled. Disable it first before setting up a new authenticator.',
            });
        }

        const secret = totp.generateSecret();
        const encryptedSecret = encryptSecret(secret);

        // Store the (unconfirmed) secret — totpEnabled stays false until confirmed
        await prisma.tenantUser.update({
            where: { id: session.userId },
            data: { totpSecret: encryptedSecret },
        });

        const issuer = process.env['MFA_ISSUER'] ?? 'AgentFarm';
        const otpauthUri = generateURI({ secret, label: user.email, issuer });
        const qrSvg = await QRCode.toString(otpauthUri, { type: 'svg', width: 200 });

        return reply.code(200).send({
            otpauth_uri: otpauthUri,
            qr_code_svg: qrSvg,
            message: 'Scan the QR code with your authenticator app, then confirm with POST /v1/auth/mfa/setup/confirm',
        });
    });

    // ── POST /v1/auth/mfa/setup/confirm ─────────────────────────────────────
    // Verifies the first TOTP code from the user's authenticator app.
    // On success, marks MFA as enabled.
    app.post<{ Body: { code?: string } }>('/v1/auth/mfa/setup/confirm', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const code = request.body?.code?.trim();
        if (!code) return reply.code(400).send({ error: 'code_required', message: 'TOTP code is required' });

        const prisma = await getPrisma();
        const user = await prisma.tenantUser.findUnique({
            where: { id: session.userId },
            select: { totpSecret: true, totpEnabled: true },
        });
        if (!user?.totpSecret) {
            return reply.code(400).send({ error: 'setup_not_started', message: 'Call /v1/auth/mfa/setup first' });
        }
        if (user.totpEnabled) {
            return reply.code(409).send({ error: 'mfa_already_enabled' });
        }

        const secret = decryptSecret(user.totpSecret);
        const valid = totp.verify(code, { secret });
        if (!valid) {
            return reply.code(400).send({ error: 'invalid_code', message: 'Incorrect TOTP code — try again' });
        }

        await prisma.tenantUser.update({
            where: { id: session.userId },
            data: { totpEnabled: true, totpVerifiedAt: new Date() },
        });

        return reply.code(200).send({
            message: 'MFA enabled successfully. Future logins will require your authenticator code.',
        });
    });

    // ── POST /v1/auth/mfa/verify ─────────────────────────────────────────────
    // Step 2 of login when MFA is enabled.
    // Validates the mfa_token (from login step 1) + TOTP code → issues full session.
    app.post<{ Body: { mfa_token?: string; code?: string } }>('/v1/auth/mfa/verify', async (request, reply) => {
        const mfaToken = request.body?.mfa_token?.trim();
        const code = request.body?.code?.trim();

        if (!mfaToken) return reply.code(400).send({ error: 'mfa_token_required' });
        if (!code) return reply.code(400).send({ error: 'code_required' });

        let userId: string;
        try {
            ({ userId } = verifyMfaToken(mfaToken, sessionSecret));
        } catch (err) {
            return reply.code(401).send({
                error: 'invalid_mfa_token',
                message: String(err instanceof Error ? err.message : err),
            });
        }

        const prisma = await getPrisma();
        const user = await prisma.tenantUser.findUnique({
            where: { id: userId },
            select: { id: true, tenantId: true, totpSecret: true, totpEnabled: true },
        });
        if (!user?.totpEnabled || !user.totpSecret) {
            return reply.code(400).send({ error: 'mfa_not_enabled' });
        }

        const secret = decryptSecret(user.totpSecret);
        const valid = totp.verify(code, { secret });
        if (!valid) {
            return reply.code(401).send({ error: 'invalid_code', message: 'Incorrect TOTP code' });
        }

        await prisma.tenantUser.update({
            where: { id: userId },
            data: { totpVerifiedAt: new Date() },
        });

        const workspaces = await prisma.workspace.findMany({
            where: { tenantId: user.tenantId },
            select: { id: true },
        });
        const token = buildSessionToken({
            userId: user.id,
            tenantId: user.tenantId,
            workspaceIds: workspaces.map((w) => w.id),
        });

        return reply.code(200).send({ token, message: 'MFA verified — login complete' });
    });

    // ── DELETE /v1/auth/mfa ──────────────────────────────────────────────────
    // Disables MFA. Requires both an authenticated session AND a valid TOTP code.
    app.delete<{ Body: { code?: string } }>('/v1/auth/mfa', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const code = request.body?.code?.trim();
        if (!code) {
            return reply.code(400).send({
                error: 'code_required',
                message: 'Provide your current TOTP code to disable MFA',
            });
        }

        const prisma = await getPrisma();
        const user = await prisma.tenantUser.findUnique({
            where: { id: session.userId },
            select: { totpSecret: true, totpEnabled: true },
        });
        if (!user?.totpEnabled || !user.totpSecret) {
            return reply.code(400).send({ error: 'mfa_not_enabled' });
        }

        const secret = decryptSecret(user.totpSecret);
        const valid = totp.verify(code, { secret });
        if (!valid) {
            return reply.code(401).send({ error: 'invalid_code', message: 'Incorrect TOTP code' });
        }

        await prisma.tenantUser.update({
            where: { id: session.userId },
            data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null },
        });

        return reply.code(200).send({ message: 'MFA disabled successfully' });
    });
}

// ---------------------------------------------------------------------------
// Exported helpers for login route integration
// ---------------------------------------------------------------------------

export { issueMfaToken };

/**
 * Check whether a user has MFA enabled and their TOTP secret is stored.
 * Used by the login route to decide whether to issue a full session or an mfa_token.
 */
export async function getUserMfaStatus(userId: string): Promise<{ enabled: boolean }> {
    const { prisma } = await import('../../lib/db.js');
    const user = await prisma.tenantUser.findUnique({
        where: { id: userId },
        select: { totpEnabled: true },
    });
    return { enabled: user?.totpEnabled ?? false };
}
