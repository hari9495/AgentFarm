import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSetupWizardRoutes } from './setup-wizard.js';

// ---------------------------------------------------------------------------
// In-memory Prisma stub
// ---------------------------------------------------------------------------

type WizardRow = {
    id: string;
    tenantId: string;
    botId: string | null;
    currentStep: string;
    completedSteps: string[];
    selectedRole: string | null;
    connectors: unknown;
    personaBotId: string | null;
    approvalPolicy: unknown;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
};

function buildPrismaStub() {
    const sessions = new Map<string, WizardRow>();
    let seq = 0;

    const bots = new Map<string, { id: string; workspaceId: string; role: string; status: string }>();
    const personas = new Map<string, unknown>();

    const stub = {
        sessions,
        personas,
        workspace: {
            findFirst: async ({ where }: { where: { tenantId: string } }) => {
                return { id: `workspace_${where.tenantId}`, tenantId: where.tenantId };
            },
        },
        bot: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const bot = { id: `bot_${++seq}`, workspaceId: String(data.workspaceId), role: String(data.role), status: String(data.status) };
                bots.set(bot.id, bot);
                return bot;
            },
        },
        agentPersona: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const persona = { id: `persona_${++seq}`, ...data };
                personas.set(String(data.botId), persona);
                return persona;
            },
            update: async ({ where, data }: { where: { botId: string }; data: Record<string, unknown> }) => {
                const existing = personas.get(where.botId);
                if (!existing) throw new Error('persona not found');
                const updated = { ...existing, ...data };
                personas.set(where.botId, updated);
                return updated;
            },
        },
        setupWizardSession: {
            create: async ({ data }: { data: Partial<WizardRow> }) => {
                const now = new Date();
                const row: WizardRow = {
                    id: `ws_${++seq}`,
                    tenantId: data.tenantId ?? 'tenant_1',
                    botId: data.botId ?? null,
                    currentStep: data.currentStep ?? 'select_role',
                    completedSteps: (data.completedSteps as string[]) ?? [],
                    selectedRole: data.selectedRole ?? null,
                    connectors: data.connectors ?? [],
                    personaBotId: data.personaBotId ?? null,
                    approvalPolicy: data.approvalPolicy ?? null,
                    status: data.status ?? 'in_progress',
                    createdAt: now,
                    updatedAt: now,
                    completedAt: null,
                };
                sessions.set(row.id, row);
                return row;
            },
            findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
                const row = sessions.get(where.id);
                if (!row || row.tenantId !== where.tenantId) return null;
                return row;
            },
            update: async ({ where, data }: { where: { id: string }; data: Partial<WizardRow> }) => {
                const row = sessions.get(where.id);
                if (!row) throw new Error(`Row ${where.id} not found`);
                const updated = {
                    ...row,
                    ...data,
                    completedSteps: (data.completedSteps as string[]) ?? row.completedSteps,
                    updatedAt: new Date(),
                };
                sessions.set(where.id, updated);
                return updated;
            },
        },
    };
    return stub;
}

const makeSession = (tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role: 'operator',
    expiresAt: Date.now() + 60_000,
});

async function buildApp(tenantId = 'tenant_1') {
    const app = Fastify({ logger: false });
    const stub = buildPrismaStub();
    await registerSetupWizardRoutes(app, {
        getSession: () => makeSession(tenantId),
        prisma: stub as never,
    });
    await app.ready();
    return { app, stub };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('POST /v1/setup-wizard — creates a new wizard session', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/v1/setup-wizard' });
    assert.equal(res.statusCode, 201);
    const body = res.json() as { session: { id: string; currentStep: string; status: string } };
    assert.ok(body.session.id);
    assert.equal(body.session.currentStep, 'select_role');
    assert.equal(body.session.status, 'in_progress');
});

test('GET /v1/setup-wizard/:sessionId — returns existing session', async () => {
    const { app, stub } = await buildApp();

    // Create first
    const createRes = await app.inject({ method: 'POST', url: '/v1/setup-wizard' });
    const { session } = createRes.json() as { session: { id: string } };

    const getRes = await app.inject({ method: 'GET', url: `/v1/setup-wizard/${session.id}` });
    assert.equal(getRes.statusCode, 200);
    const body = getRes.json() as { session: { id: string } };
    assert.equal(body.session.id, session.id);
    void stub; // used above
});

test('GET /v1/setup-wizard/:sessionId — 404 for missing session', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/setup-wizard/nonexistent' });
    assert.equal(res.statusCode, 404);
});

test('PATCH /v1/setup-wizard/:sessionId/step — advances select_role step', async () => {
    const { app } = await buildApp();
    const { session } = (await app.inject({ method: 'POST', url: '/v1/setup-wizard' })).json() as {
        session: { id: string };
    };

    const res = await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${session.id}/step`,
        payload: { step: 'connect_tools', payload: { roleKey: 'developer' } },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { session: { currentStep: string; completedSteps: string[] } };
    assert.equal(body.session.currentStep, 'connect_tools');
    assert.ok(body.session.completedSteps.includes('select_role'));
});

test('PATCH step — rejects invalid roleKey', async () => {
    const { app } = await buildApp();
    const { session } = (await app.inject({ method: 'POST', url: '/v1/setup-wizard' })).json() as {
        session: { id: string };
    };

    const res = await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${session.id}/step`,
        payload: { step: 'connect_tools', payload: { roleKey: 'invalid_role' } },
    });

    assert.equal(res.statusCode, 422);
    const body = res.json() as { error: string; field: string };
    assert.equal(body.error, 'step_payload_invalid');
    assert.equal(body.field, 'roleKey');
});

test('PATCH step — rejects empty connectors array', async () => {
    const { app } = await buildApp();
    const { session } = (await app.inject({ method: 'POST', url: '/v1/setup-wizard' })).json() as {
        session: { id: string };
    };
    // Advance to connect_tools
    await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${session.id}/step`,
        payload: { step: 'connect_tools', payload: { roleKey: 'developer' } },
    });

    const res = await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${session.id}/step`,
        payload: { step: 'configure_persona', payload: { connectors: [] } },
    });

    assert.equal(res.statusCode, 422);
    const body = res.json() as { field: string };
    assert.equal(body.field, 'connectors');
});

test('PATCH step — rejects non-sequential step transitions', async () => {
    const { app } = await buildApp();
    const { session } = (await app.inject({ method: 'POST', url: '/v1/setup-wizard' })).json() as {
        session: { id: string };
    };

    // Try to jump from select_role directly to configure_persona (skip connect_tools)
    const res = await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${session.id}/step`,
        payload: { step: 'configure_persona', payload: { roleKey: 'developer' } },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json() as { error: string };
    assert.equal(body.error, 'invalid_step_transition');
});

test('POST /v1/setup-wizard/:sessionId/complete — completes wizard after all steps', async () => {
    const { app, stub } = await buildApp();
    const { session } = (await app.inject({ method: 'POST', url: '/v1/setup-wizard' })).json() as {
        session: { id: string };
    };
    const id = session.id;

    // 1: select_role
    await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${id}/step`,
        payload: { step: 'connect_tools', payload: { roleKey: 'developer' } },
    });
    // 2: connect_tools
    await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${id}/step`,
        payload: {
            step: 'configure_persona',
            payload: {
                connectors: [{ name: 'github', displayName: 'GitHub', authType: 'api_token' }],
            },
        },
    });
    // 3: configure_persona
    await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${id}/step`,
        payload: { step: 'set_approval_rules', payload: { displayName: 'Dev Bot', emailAddress: 'devbot@example.com' } },
    });
    // 4: set_approval_rules
    await app.inject({
        method: 'PATCH',
        url: `/v1/setup-wizard/${id}/step`,
        payload: {
            step: 'deploy',
            payload: {
                approvalPolicy: {
                    highRiskRequiresApproval: true,
                    mediumRiskRequiresApproval: false,
                    approvalTimeoutSeconds: 300,
                },
            },
        },
    });

    const completeRes = await app.inject({
        method: 'POST',
        url: `/v1/setup-wizard/${id}/complete`,
    });

    assert.equal(completeRes.statusCode, 200);
    const body = completeRes.json() as { session: { status: string }; provisioning: { roleKey: string; botId: string } };
    assert.equal(body.session.status, 'completed');
    assert.equal(body.provisioning.roleKey, 'developer');

    // F5 — the approval-rules step must actually land on the real AgentPersona,
    // not just sit unread on the wizard session row.
    const persona = stub.personas.get(body.provisioning.botId) as { approvalPolicy?: string };
    assert.equal(persona.approvalPolicy, 'high-only');
});

test('POST complete — returns 422 when steps are incomplete', async () => {
    const { app } = await buildApp();
    const { session } = (await app.inject({ method: 'POST', url: '/v1/setup-wizard' })).json() as {
        session: { id: string };
    };

    const res = await app.inject({
        method: 'POST',
        url: `/v1/setup-wizard/${session.id}/complete`,
    });

    assert.equal(res.statusCode, 422);
    const body = res.json() as { error: string };
    assert.equal(body.error, 'wizard_incomplete');
});
