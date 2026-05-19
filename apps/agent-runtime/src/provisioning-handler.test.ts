import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWizardComplete } from './provisioning-handler.js';
import type { ProvisioningRequestedEvent, WizardCompleteEvent } from './provisioning-handler.js';

const validEvent: WizardCompleteEvent = {
    sessionId: 'sess_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    roleKey: 'developer',
    correlationId: 'corr_1',
};

test('handleWizardComplete emits agent_provisioning_requested with correct fields', () => {
    const emitted: ProvisioningRequestedEvent[] = [];
    const result = handleWizardComplete(validEvent, (e) => emitted.push(e));

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].type, 'agent_provisioning_requested');
    assert.equal(emitted[0].sessionId, 'sess_1');
    assert.equal(emitted[0].tenantId, 'tenant_1');
    assert.equal(emitted[0].botId, 'bot_1');
    assert.equal(emitted[0].roleKey, 'developer');
    assert.equal(emitted[0].correlationId, 'corr_1');
    assert.ok(typeof emitted[0].requestedAt === 'string');

    // Return value === emitted event
    assert.deepStrictEqual(result, emitted[0]);
});

test('handleWizardComplete throws when sessionId is missing', () => {
    assert.throws(
        () => handleWizardComplete({ ...validEvent, sessionId: '' }, () => { }),
        { message: /sessionId/ },
    );
});

test('handleWizardComplete throws when tenantId is missing', () => {
    assert.throws(
        () => handleWizardComplete({ ...validEvent, tenantId: '' }, () => { }),
        { message: /tenantId/ },
    );
});

test('handleWizardComplete throws when botId is missing', () => {
    assert.throws(
        () => handleWizardComplete({ ...validEvent, botId: '' }, () => { }),
        { message: /botId/ },
    );
});

test('handleWizardComplete throws when roleKey is missing', () => {
    assert.throws(
        () => handleWizardComplete({ ...validEvent, roleKey: '' }, () => { }),
        { message: /roleKey/ },
    );
});

test('handleWizardComplete throws when correlationId is missing', () => {
    assert.throws(
        () => handleWizardComplete({ ...validEvent, correlationId: '' }, () => { }),
        { message: /correlationId/ },
    );
});

test('handleWizardComplete does not emit when validation fails', () => {
    const emitted: ProvisioningRequestedEvent[] = [];
    assert.throws(() =>
        handleWizardComplete({ ...validEvent, botId: '   ' }, (e) => emitted.push(e)),
    );
    assert.equal(emitted.length, 0);
});
