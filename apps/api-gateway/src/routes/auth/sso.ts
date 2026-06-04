/**
 * sso.ts — SAML 2.0 / SSO routes for AgentFarm
 *
 * Endpoints:
 *   GET  /v1/auth/sso/:tenantId/metadata       — SP metadata XML (give to your IdP)
 *   GET  /v1/auth/sso/:tenantId/login           — Initiate SP-initiated SAML login
 *   POST /v1/auth/sso/:tenantId/acs             — SAML Assertion Consumer Service
 *   GET  /v1/admin/sso/config                   — Get SSO config for current tenant
 *   PUT  /v1/admin/sso/config                   — Save / update SSO config
 *   POST /v1/admin/sso/config/test              — Trigger test SP-initiated login
 *   DELETE /v1/admin/sso/config                 — Disable and clear SSO config
 */

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { SAML } from '@node-saml/node-saml';
import { buildSessionToken } from '../../lib/session-auth.js';
import { readSession } from '../../request-context.js';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SP_BASE_URL = process.env['APP_BASE_URL'] ?? 'https://app.agentfarm.io';
const SESSION_SECRET = process.env['API_SESSION_SECRET'] ?? '';

function acsUrl(tenantId: string) {
    return `${SP_BASE_URL}/v1/auth/sso/${tenantId}/acs`;
}
function entityId(tenantId: string) {
    return `${SP_BASE_URL}/saml/${tenantId}`;
}

function buildSaml(cfg: {
    entryPoint: string; issuer: string; cert: string;
    spEntityId: string; callbackUrl: string; signatureAlgo: string;
}): SAML {
    return new SAML({
        entryPoint:             cfg.entryPoint,
        issuer:                 cfg.spEntityId,
        idpIssuer:              cfg.issuer,
        idpCert:                cfg.cert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, ''),
        callbackUrl:            cfg.callbackUrl,
        signatureAlgorithm:     cfg.signatureAlgo === 'sha512' ? 'sha512' : 'sha256',
        wantAuthnResponseSigned: true,
        identifierFormat:       'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    });
}

// ── Route registration ────────────────────────────────────────────────────────

export type RegisterSsoRoutesOptions = {
    getSession?: (req: FastifyRequest) => { userId: string; tenantId: string; role?: string } | null;
    prisma?: PrismaClient;
};

export async function registerSsoRoutes(
    app: FastifyInstance,
    options: RegisterSsoRoutesOptions = {},
): Promise<void> {
    const getSession = options.getSession ?? ((req) => readSession(req) as { userId: string; tenantId: string; role?: string } | null);
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── SP Metadata XML ──────────────────────────────────────────────────────
    app.get<{ Params: { tenantId: string } }>(
        '/v1/auth/sso/:tenantId/metadata',
        async (request, reply) => {
            const { tenantId } = request.params;
            const prisma = await resolvePrisma();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cfg = await (prisma as any).tenantSsoConfig.findUnique({ where: { tenantId } }) as {
                entryPoint: string; issuer: string; cert: string;
                spEntityId: string; callbackUrl: string; signatureAlgo: string; enabled: boolean;
            } | null;
            if (!cfg?.enabled) return reply.code(404).send({ error: 'SSO not configured for this tenant' });

            try {
                const saml = buildSaml(cfg);
                const xml  = saml.generateServiceProviderMetadata(null, null);
                return reply.header('Content-Type', 'application/xml').send(xml);
            } catch {
                return reply.code(500).send({ error: 'Failed to generate SP metadata' });
            }
        },
    );

    // ── SP-initiated login (redirect to IdP) ────────────────────────────────
    app.get<{ Params: { tenantId: string } }>(
        '/v1/auth/sso/:tenantId/login',
        async (request, reply) => {
            const { tenantId } = request.params;
            const prisma = await resolvePrisma();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cfg = await (prisma as any).tenantSsoConfig.findUnique({ where: { tenantId } }) as {
                entryPoint: string; issuer: string; cert: string;
                spEntityId: string; callbackUrl: string; signatureAlgo: string; enabled: boolean;
            } | null;
            if (!cfg?.enabled) return reply.code(404).send({ error: 'SSO not configured or disabled' });

            try {
                const saml = buildSaml(cfg);
                const url  = await saml.getAuthorizeUrlAsync('', undefined, {});
                return reply.redirect(url, 302);
            } catch {
                return reply.code(500).send({ error: 'Failed to generate SAML AuthnRequest' });
            }
        },
    );

    // ── SAML ACS (assertion consumer) ────────────────────────────────────────
    app.post<{ Params: { tenantId: string }; Body: Record<string, string> }>(
        '/v1/auth/sso/:tenantId/acs',
        async (request, reply) => {
            const { tenantId } = request.params;
            const prisma = await resolvePrisma();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cfg = await (prisma as any).tenantSsoConfig.findUnique({
                where: { tenantId },
                include: { tenant: true },
            }) as {
                entryPoint: string; issuer: string; cert: string;
                spEntityId: string; callbackUrl: string; signatureAlgo: string;
                enabled: boolean; tenant: { id: string; name: string };
            } | null;

            if (!cfg?.enabled) return reply.code(400).send({ error: 'SSO not configured or disabled for this tenant' });

            let profile: Record<string, unknown>;
            try {
                const saml   = buildSaml(cfg);
                const result = await saml.validatePostResponseAsync(request.body);
                profile = (result.profile ?? {}) as Record<string, unknown>;
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'SAML validation failed';
                return reply.code(400).send({ error: 'invalid_saml_response', detail: msg });
            }

            // Extract NameID / email from profile
            const nameId = (profile['nameID'] ?? profile['email'] ?? profile['mail'] ?? '') as string;
            if (!nameId) return reply.code(400).send({ error: 'No NameID in SAML assertion' });

            const email      = nameId.includes('@') ? nameId : `${nameId}@sso.agentfarm.io`;
            const displayName = (profile['displayName'] ?? profile['cn'] ?? profile['name'] ?? email) as string;

            // Upsert TenantUser — find by ssoSubject or email
            let user = await prisma.tenantUser.findFirst({
                where: { tenantId, OR: [{ ssoSubject: nameId }, { email }] },
            });

            if (!user) {
                // Provision new SSO user
                user = await prisma.tenantUser.create({
                    data: {
                        id:          randomUUID(),
                        tenantId,
                        email,
                        name:        displayName,
                        passwordHash: null,
                        role:        'viewer',
                        ssoProvider: 'saml',
                        ssoSubject:  nameId,
                    },
                });
            } else if (!user.ssoSubject) {
                // Link existing email-based user to SSO
                user = await prisma.tenantUser.update({
                    where: { id: user.id },
                    data: { ssoProvider: 'saml', ssoSubject: nameId },
                });
            }

            // Build session token (same shape as password login)
            const workspaces = await prisma.workspace.findMany({ where: { tenantId }, select: { id: true } });
            const token = buildSessionToken({
                userId:       user.id,
                tenantId,
                workspaceIds: workspaces.map(w => w.id),
                scope:        'internal',
            });

            // Redirect to dashboard with session cookie
            const cookieVal = encodeURIComponent(token);
            const secure    = process.env['NODE_ENV'] === 'production';
            reply
                .header('Set-Cookie', `agentfarm_internal_session=${cookieVal}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=${String(86400)}`)
                .redirect(`${SP_BASE_URL}/`, 302);
        },
    );

    // ── Admin: GET SSO config ────────────────────────────────────────────────
    app.get('/v1/admin/sso/config', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const prisma = await resolvePrisma();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = await (prisma as any).tenantSsoConfig.findUnique({ where: { tenantId: session.tenantId } });
        if (!cfg) {
            return reply.send({
                configured: false,
                enabled: false,
                spEntityId: entityId(session.tenantId),
                callbackUrl: acsUrl(session.tenantId),
                metadataUrl: `${SP_BASE_URL}/v1/auth/sso/${session.tenantId}/metadata`,
                loginUrl:    `${SP_BASE_URL}/v1/auth/sso/${session.tenantId}/login`,
            });
        }
        // Never expose the raw cert in GET — just first/last 20 chars
        const safeConfig = {
            configured: true,
            enabled:    (cfg as { enabled: boolean }).enabled,
            provider:   (cfg as { provider: string }).provider,
            entryPoint: (cfg as { entryPoint: string }).entryPoint,
            issuer:     (cfg as { issuer: string }).issuer,
            certPreview: `${((cfg as { cert: string }).cert ?? '').slice(0, 20)}…${((cfg as { cert: string }).cert ?? '').slice(-20)}`,
            spEntityId:  (cfg as { spEntityId: string }).spEntityId,
            callbackUrl: (cfg as { callbackUrl: string }).callbackUrl,
            metadataUrl: `${SP_BASE_URL}/v1/auth/sso/${session.tenantId}/metadata`,
            loginUrl:    `${SP_BASE_URL}/v1/auth/sso/${session.tenantId}/login`,
            signatureAlgo: (cfg as { signatureAlgo: string }).signatureAlgo,
        };
        return reply.send(safeConfig);
    });

    // ── Admin: PUT SSO config ────────────────────────────────────────────────
    app.put<{
        Body: {
            enabled?: boolean; entryPoint?: string; issuer?: string;
            cert?: string; signatureAlgo?: string;
        };
    }>('/v1/admin/sso/config', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if (session.role !== 'admin') return reply.code(403).send({ error: 'admin_required' });

        const { entryPoint, issuer, cert, signatureAlgo, enabled } = request.body ?? {};
        if (!entryPoint || !issuer || !cert) {
            return reply.code(400).send({ error: 'entryPoint, issuer, and cert are required' });
        }

        const spEntityId = entityId(session.tenantId);
        const callbackUrl = acsUrl(session.tenantId);

        const prisma = await resolvePrisma();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = await (prisma as any).tenantSsoConfig.upsert({
            where:  { tenantId: session.tenantId },
            update: { entryPoint, issuer, cert, spEntityId, callbackUrl, signatureAlgo: signatureAlgo ?? 'sha256', enabled: enabled ?? true, updatedAt: new Date() },
            create: {
                id: randomUUID(), tenantId: session.tenantId,
                entryPoint, issuer, cert, spEntityId, callbackUrl,
                signatureAlgo: signatureAlgo ?? 'sha256', enabled: enabled ?? true,
            },
        });
        return reply.send({ configured: true, enabled: (cfg as { enabled: boolean }).enabled, spEntityId, callbackUrl });
    });

    // ── Admin: Test SSO ──────────────────────────────────────────────────────
    app.post('/v1/admin/sso/config/test', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        const loginUrl = `${SP_BASE_URL}/v1/auth/sso/${session.tenantId}/login`;
        return reply.send({ testUrl: loginUrl, message: 'Open the testUrl in a browser to initiate a test SSO login.' });
    });

    // ── Admin: Delete / disable SSO config ──────────────────────────────────
    app.delete('/v1/admin/sso/config', async (request, reply) => {
        const session = getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if (session.role !== 'admin') return reply.code(403).send({ error: 'admin_required' });

        const prisma = await resolvePrisma();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).tenantSsoConfig.deleteMany({ where: { tenantId: session.tenantId } });
        return reply.send({ deleted: true });
    });

    // Suppress unused import warning
}
