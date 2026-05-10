import test from 'node:test';
import assert from 'node:assert/strict';
import { writeAuditEvent } from './audit-writer.js';
import type { PrismaLike } from './audit-writer.js';

// ---------------------------------------------------------------------------
// Minimal mock — cast to PrismaLike to satisfy TypeScript
// ---------------------------------------------------------------------------

type CreateArgs = {
    data: Record<string, unknown>;
};

function makeMockPrisma(onCreate?: (args: CreateArgs) => void): PrismaLike {
    return {
        auditEvent: {
            create: async (args: CreateArgs) => {
                onCreate?.(args);
                return {};
            },
        },
    } as unknown as PrismaLike;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('writeAuditEvent calls prisma.auditEvent.create with correct fields', async () => {
    let captured: CreateArgs | undefined;
    const prisma = makeMockPrisma((args) => { captured = args; });

    await writeAuditEvent({
        prisma,
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        userId: 'user-1',
        eventType: 'audit_event',
        severity: 'info',
        summary: 'test event',
    });

    assert.ok(captured, 'create was not called');
    assert.equal(captured.data.tenantId, 'tenant-1');
    assert.equal(captured.data.workspaceId, 'ws-1');
    assert.equal(captured.data.botId, 'bot-1');
    assert.equal(captured.data.summary, 'test event');
    assert.equal(captured.data.sourceSystem, 'api-gateway');
    assert.ok(typeof captured.data.correlationId === 'string' && captured.data.correlationId.startsWith('audit_'));
});

test('writeAuditEvent swallows Prisma errors without throwing', async () => {
    const prisma = {
        auditEvent: {
            create: async () => { throw new Error('DB connection error'); },
        },
    } as unknown as PrismaLike;

    await assert.doesNotReject(() =>
        writeAuditEvent({
            prisma,
            tenantId: 'tenant-1',
            eventType: 'audit_event',
            severity: 'info',
            summary: 'should not throw',
        }),
    );
});

test('writeAuditEvent with missing optional fields still succeeds', async () => {
    let called = false;
    const prisma = makeMockPrisma(() => { called = true; });

    await writeAuditEvent({
        prisma,
        tenantId: 'tenant-minimal',
        eventType: 'connector_event',
        summary: 'minimal event',
    });

    assert.equal(called, true);
});

test('writeAuditEvent defaults workspaceId and botId to empty string when omitted', async () => {
    let captured: CreateArgs | undefined;
    const prisma = makeMockPrisma((args) => { captured = args; });

    await writeAuditEvent({
        prisma,
        tenantId: 'tenant-2',
        eventType: 'provisioning_event',
        summary: 'no workspace or bot',
    });

    assert.equal(captured?.data.workspaceId, '');
    assert.equal(captured?.data.botId, '');
});

test('metadata is accepted by writeAuditEvent without causing errors', async () => {
    let called = false;
    const prisma = makeMockPrisma(() => { called = true; });

    await writeAuditEvent({
        prisma,
        tenantId: 'tenant-3',
        eventType: 'audit_event',
        summary: 'event with metadata',
        metadata: { orderId: 'order-123', planId: 'plan-abc' },
    });

    assert.equal(called, true);
});

test('writeAuditEvent maps severity "warning" to "warn" for Prisma', async () => {
    let captured: CreateArgs | undefined;
    const prisma = makeMockPrisma((args) => { captured = args; });

    await writeAuditEvent({
        prisma,
        tenantId: 'tenant-4',
        eventType: 'connector_event',
        severity: 'warning',
        summary: 'revocation event',
    });

    assert.equal(captured?.data.severity, 'warn');
});

test('writeAuditEvent defaults severity to "info" when omitted', async () => {
    let captured: CreateArgs | undefined;
    const prisma = makeMockPrisma((args) => { captured = args; });

    await writeAuditEvent({
        prisma,
        tenantId: 'tenant-5',
        eventType: 'audit_event',
        summary: 'no severity provided',
    });

    assert.equal(captured?.data.severity, 'info');
});
