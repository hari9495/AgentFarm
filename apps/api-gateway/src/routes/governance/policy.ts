import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';

/**
 * Unified Governance Policy REST API (Phases 2 + 3).
 *
 * One active `GovernancePolicy` exists per `(tenant, scope, scopeRef)`. This route
 * publishes the FULL desired rule set for a scope as one combined `rulesJson`
 * document — blocked actions (Phase 2) AND connector/MCP access (Phase 3) — so the
 * two runtime enforcers (`getActiveRoleBlocklist`, `getActiveConnectorPolicy`) each
 * read what they need from the same document.
 *
 * Tighten-only: only `deny` rules (incl. `mode:'read_only'`) are written. Session-
 * authed; `tenantId` always from session.
 */

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type Options = { getSession: (request: FastifyRequest) => SessionContext | null };

type TimeWindow = { days?: number[]; start: string; end: string; tz?: string };

type Rule = {
    actionType: string;
    effect: 'deny' | 'allow' | 'require_approval';
    connector?: string;
    tool?: string;
    mode?: 'read_only';
    env?: string;
    domain?: string;
    timeWindow?: TimeWindow;
};

type ConnectorInput = { connector?: string; readOnly?: boolean; deniedVerbs?: unknown };
type EnvInput = { env?: string; actionType?: string; connector?: string };
type TimeInput = { days?: unknown; start?: string; end?: string; tz?: string; actionType?: string; connector?: string };
type WebhookInput = { mode?: string; domains?: unknown };

const cleanStrings = (v: unknown): string[] =>
    Array.isArray(v)
        ? Array.from(new Set(v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())))
        : [];

export async function registerGovernancePolicyRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: Options,
) {
    const { getSession } = options;
    const on = (m: 'get' | 'post' | 'delete', p: string, h: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>) => {
        (app as any)[m](`/v1${p}`, h);
        (app as any)[m](`/api/v1${p}`, h); // deprecated alias
    };

    // ========== CREATE + PUBLISH (combined rule document) ==========
    on('post', '/governance/policies', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        const body = (req.body ?? {}) as {
            scope?: string;
            roleKey?: string;
            scopeRef?: string;
            name?: string;
            description?: string;
            blockedActions?: unknown;
            approvalActions?: unknown;
            connectors?: unknown;
            deniedTools?: unknown;
            envRules?: unknown;
            timeRules?: unknown;
            webhookDomains?: unknown;
        };

        const VALID_SCOPES = ['tenant', 'role', 'workspace', 'agent'] as const;
        const scope = (VALID_SCOPES as readonly string[]).includes(body.scope ?? '')
            ? (body.scope as (typeof VALID_SCOPES)[number])
            : null;
        if (!scope) return res.status(400).send({ error: "scope must be 'tenant', 'role', 'workspace', or 'agent'" });
        const roleKey = typeof body.roleKey === 'string' ? body.roleKey.trim() : '';
        // scopeRef: role→roleKey (back-compat), workspace/agent→scopeRef, tenant→''
        const rawScopeRef = typeof body.scopeRef === 'string' ? body.scopeRef.trim() : '';
        const scopeRef = scope === 'role' ? roleKey : scope === 'tenant' ? '' : rawScopeRef;
        if (scope !== 'tenant' && !scopeRef) {
            return res.status(400).send({ error: `${scope === 'role' ? 'roleKey' : 'scopeRef'} is required for ${scope} scope` });
        }

        // Build the combined rule set.
        const rules: Rule[] = [];
        for (const action of cleanStrings(body.blockedActions)) {
            rules.push({ actionType: action, effect: 'deny' });
        }
        for (const action of cleanStrings(body.approvalActions)) {
            rules.push({ actionType: action, effect: 'require_approval' });
        }
        const connectors = Array.isArray(body.connectors) ? (body.connectors as ConnectorInput[]) : [];
        for (const c of connectors) {
            const connector = typeof c?.connector === 'string' ? c.connector.trim() : '';
            if (!connector) continue;
            if (c.readOnly) rules.push({ actionType: '*', effect: 'deny', connector, mode: 'read_only' });
            for (const verb of cleanStrings(c.deniedVerbs)) {
                rules.push({ actionType: verb, effect: 'deny', connector });
            }
        }
        for (const tool of cleanStrings(body.deniedTools)) {
            rules.push({ actionType: '*', effect: 'deny', tool });
        }
        // Phase 4 — env rules: deny an action/connector in a given environment.
        const envRules = Array.isArray(body.envRules) ? (body.envRules as EnvInput[]) : [];
        for (const e of envRules) {
            const env = typeof e?.env === 'string' ? e.env.trim() : '';
            if (!env) continue;
            const rule: Rule = { actionType: typeof e.actionType === 'string' && e.actionType.trim() ? e.actionType.trim() : '*', effect: 'deny', env };
            if (typeof e.connector === 'string' && e.connector.trim()) rule.connector = e.connector.trim();
            rules.push(rule);
        }
        // Phase 4 — time rules: restrict an action/connector to a working-hours window.
        const timeRules = Array.isArray(body.timeRules) ? (body.timeRules as TimeInput[]) : [];
        for (const t of timeRules) {
            const start = typeof t?.start === 'string' ? t.start.trim() : '';
            const end = typeof t?.end === 'string' ? t.end.trim() : '';
            if (!start || !end) continue;
            const window: TimeWindow = { start, end };
            if (Array.isArray(t.days)) window.days = t.days.filter((d): d is number => typeof d === 'number');
            if (typeof t.tz === 'string' && t.tz.trim()) window.tz = t.tz.trim();
            const rule: Rule = { actionType: typeof t.actionType === 'string' && t.actionType.trim() ? t.actionType.trim() : '*', effect: 'deny', timeWindow: window };
            if (typeof t.connector === 'string' && t.connector.trim()) rule.connector = t.connector.trim();
            rules.push(rule);
        }
        // Phase 4 — webhook domain rules (tenant scope is the meaningful one).
        const webhook = (body.webhookDomains ?? null) as WebhookInput | null;
        if (webhook && typeof webhook === 'object') {
            const effect: 'allow' | 'deny' = webhook.mode === 'allow' ? 'allow' : 'deny';
            for (const domain of cleanStrings(webhook.domains)) {
                rules.push({ actionType: '*', effect, connector: 'webhook', domain });
            }
        }

        if (rules.length === 0) {
            return res.status(400).send({ error: 'at least one rule (blockedActions, connectors, or deniedTools) is required' });
        }

        try {
            const created = await prisma.$transaction(async (tx: any) => {
                const priorActive = await tx.governancePolicy.findMany({
                    where: { tenantId: session.tenantId, scope, scopeRef, status: 'active' },
                });
                for (const p of priorActive) {
                    await tx.governancePolicy.update({ where: { id: p.id }, data: { status: 'archived' } });
                }
                const top = await tx.governancePolicy.findFirst({
                    where: { tenantId: session.tenantId, scope, scopeRef },
                    orderBy: { version: 'desc' },
                });
                const version = (Number(top?.version) || 0) + 1;
                return tx.governancePolicy.create({
                    data: {
                        tenantId: session.tenantId,
                        scope,
                        scopeRef,
                        version,
                        status: 'active',
                        name: body.name?.trim() || `${scope}${scopeRef ? `:${scopeRef}` : ''} policy v${version}`,
                        description: body.description?.trim() || null,
                        rulesJson: rules as unknown as object,
                        createdBy: session.userId,
                        updatedBy: session.userId,
                    },
                });
            });
            return res.status(201).send({ policy: created, message: 'Policy published' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to publish policy: ${msg}` });
        }
    });

    // ========== GET active policy for a scope ==========
    on('get', '/governance/policies', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        const { scope, roleKey, scopeRef: qScopeRef } = (req.query ?? {}) as { scope?: string; roleKey?: string; scopeRef?: string };
        const sc = ['tenant', 'role', 'workspace', 'agent'].includes(scope ?? '') ? (scope as string) : 'role';
        const scopeRef = sc === 'tenant' ? '' : sc === 'role' ? (roleKey ?? qScopeRef ?? '') : (qScopeRef ?? '');
        try {
            const policy = await prisma.governancePolicy.findFirst({
                where: { tenantId: session.tenantId, scope: sc as never, scopeRef, status: 'active' },
                orderBy: { version: 'desc' },
            });
            return res.send({ policy: policy ?? null });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to load policy: ${msg}` });
        }
    });

    // ========== ARCHIVE ==========
    on('delete', '/governance/policies/:policyId', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        try {
            const { policyId } = req.params as { policyId: string };
            const policy = await prisma.governancePolicy.findUnique({ where: { id: policyId } });
            if (!policy) return res.status(404).send({ error: 'Policy not found' });
            if (policy.tenantId !== session.tenantId) return res.status(403).send({ error: 'Forbidden' });
            await prisma.governancePolicy.update({ where: { id: policyId }, data: { status: 'archived', updatedBy: session.userId } });
            return res.send({ message: 'Policy archived', policyId });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to archive policy: ${msg}` });
        }
    });
}
