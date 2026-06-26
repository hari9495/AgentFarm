import test from 'node:test';
import assert from 'node:assert/strict';
import type { GovernanceWorkflowTemplate, GovernanceWorkflowInstance } from '@agentfarm/shared-types';
import {
    InMemoryGovernanceWorkflowStore,
    PrismaGovernanceWorkflowStore,
    type GovernanceWorkflowStore,
} from './governance-workflow-store.js';

const template = (id: string, tenantId: string) =>
    ({ id, tenantId, templateName: 't', stages: [], routingRules: [] } as unknown as GovernanceWorkflowTemplate);
const workflow = (id: string, tenantId: string) =>
    ({ id, tenantId, templateId: 'tpl', status: 'pending' } as unknown as GovernanceWorkflowInstance);

// Shared contract run against both implementations.
async function runContract(store: GovernanceWorkflowStore) {
    await store.saveTemplate(template('tpl1', 'tn1'));
    await store.saveTemplate(template('tpl2', 'tn2'));
    assert.equal((await store.listTemplates('tn1')).length, 1, 'listTemplates tenant-scoped');
    assert.equal((await store.getTemplate('tpl1'))?.id, 'tpl1');
    assert.equal(await store.getTemplate('missing'), null);

    await store.saveWorkflow(workflow('wf1', 'tn1'));
    await store.saveDecisions('wf1', []);
    assert.equal((await store.getWorkflow('wf1'))?.status, 'pending');
    assert.deepEqual(await store.getDecisions('wf1'), []);

    await store.saveDecisions('wf1', [{ id: 'd1' } as never]);
    assert.equal((await store.getDecisions('wf1')).length, 1);
    assert.equal((await store.listWorkflows('tn1')).length, 1);
    assert.equal((await store.listWorkflows('tn2')).length, 0);
}

test('InMemoryGovernanceWorkflowStore satisfies the store contract', async () => {
    await runContract(new InMemoryGovernanceWorkflowStore());
});

test('PrismaGovernanceWorkflowStore satisfies the store contract (in-memory prisma double)', async () => {
    const tmpl = new Map<string, any>();
    const inst = new Map<string, any>();
    const prisma = {
        governanceWorkflowTemplate: {
            findMany: async ({ where }: any) => [...tmpl.values()].filter((r) => r.tenantId === where.tenantId),
            findUnique: async ({ where }: any) => tmpl.get(where.id) ?? null,
            upsert: async ({ where, create, update }: any) => {
                const ex = tmpl.get(where.id);
                tmpl.set(where.id, ex ? { ...ex, ...update } : create);
            },
        },
        governanceWorkflowInstance: {
            findMany: async ({ where }: any) => [...inst.values()].filter((r) => r.tenantId === where.tenantId),
            findUnique: async ({ where }: any) => inst.get(where.id) ?? null,
            upsert: async ({ where, create, update }: any) => {
                const ex = inst.get(where.id);
                inst.set(where.id, ex ? { ...ex, ...update } : { decisionsJson: [], ...create });
            },
            update: async ({ where, data }: any) => {
                inst.set(where.id, { ...inst.get(where.id), ...data });
            },
        },
    };
    await runContract(new PrismaGovernanceWorkflowStore(prisma as never));
});
