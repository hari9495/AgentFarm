/**
 * Browser task executor for the Sales agent.
 *
 * Sends a goal to the browser-agent service (Flask + Playwright + optional
 * Claude brain), persists the result as a BrowserTask DB record, and logs a
 * SalesActivity + AuditLog entry following the exact patterns used across the
 * rest of the sales pipeline.
 *
 * Never throws — on any error the BrowserTask is returned with status='failed'.
 */

import type { PrismaClient } from '@prisma/client';
import type { BrowserTaskRecord, BrowserTaskRequest, BrowserStep, SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getAuditLogWriter } from '../action-observability.js';

const BROWSER_AGENT_URL = (): string =>
    (process.env['BROWSER_AGENT_URL'] ?? 'http://localhost:5002').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Minimal Prisma shape (avoids full generated client import)
// ---------------------------------------------------------------------------

type PrismaWithBrowser = {
    browserTask: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>;
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

// ---------------------------------------------------------------------------
// HTTP call to browser-agent service
// ---------------------------------------------------------------------------

interface BrowserAgentResponse {
    task_id: string;
    status: 'completed' | 'failed';
    steps: Array<{
        action: string;
        target?: string;
        value?: string;
        screenshotUrl?: string;
        ok: boolean;
        errorMessage?: string;
        durationMs?: number;
        timestamp: string;
    }>;
    result: string | null;
    error: string | null;
    duration_ms: number;
}

async function callBrowserAgent(
    taskId: string,
    goal: string,
    allowedDomain: string | undefined,
): Promise<BrowserAgentResponse> {
    const body: Record<string, unknown> = { task_id: taskId, goal };
    if (allowedDomain) {
        body['allowed_domain'] = allowedDomain;
    }

    const response = await fetch(`${BROWSER_AGENT_URL()}/run-task`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[browser-agent] HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    return response.json() as Promise<BrowserAgentResponse>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunBrowserTaskOptions {
    prospectId?: string;
    dealId?: string;
}

export async function runBrowserTask(
    request: BrowserTaskRequest,
    config: SalesAgentConfigRecord,
    prisma?: PrismaClient,
    options?: RunBrowserTaskOptions,
): Promise<BrowserTaskRecord> {
    const { tenantId, botId, goal } = request;
    const prospectId = request.prospectId ?? options?.prospectId;
    const dealId = request.dealId ?? options?.dealId;

    const db = prisma ? (prisma as unknown as PrismaWithBrowser) : null;

    // Resolve allowed domain from config or request (config takes precedence)
    const allowedDomain: string | undefined =
        config.browserAllowedDomains
            ? config.browserAllowedDomains.split(',')[0]?.trim() || undefined
            : undefined;

    // Enforce browserEnabled gate
    if (!config.browserEnabled) {
        const now = new Date();
        const stub: BrowserTaskRecord = {
            id: `stub-${Date.now()}`,
            tenantId,
            botId,
            prospectId: prospectId ?? null,
            dealId: dealId ?? null,
            goal,
            allowedDomain: allowedDomain ?? null,
            status: 'failed',
            steps: [],
            result: null,
            errorMessage: 'browser_disabled: browserEnabled is false in SalesAgentConfig',
            startedAt: now,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
        };
        return stub;
    }

    // Create pending DB record
    let taskId: string = `bt-${Date.now()}`;
    if (db) {
        try {
            const created = await db.browserTask.create({
                data: {
                    tenantId,
                    botId,
                    prospectId: prospectId ?? null,
                    dealId: dealId ?? null,
                    goal,
                    allowedDomain: allowedDomain ?? null,
                    status: 'pending',
                    steps: JSON.stringify([]),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            taskId = created.id;
        } catch {
            // non-fatal — continue with generated ID
        }
    }

    const startedAt = new Date();

    // Execute via browser-agent service
    let agentResponse: BrowserAgentResponse | null = null;
    let executionError: string | null = null;

    try {
        agentResponse = await callBrowserAgent(taskId, goal, allowedDomain);
    } catch (err: unknown) {
        executionError = err instanceof Error ? err.message : String(err);
    }

    const completedAt = new Date();
    const status: BrowserTaskRecord['status'] =
        executionError !== null
            ? 'failed'
            : (agentResponse?.status === 'completed' ? 'completed' : 'failed');

    const steps: BrowserStep[] = (agentResponse?.steps ?? []).map((s) => ({
        action: s.action,
        target: s.target,
        value: s.value,
        screenshotUrl: s.screenshotUrl,
        ok: s.ok,
        errorMessage: s.errorMessage,
        durationMs: s.durationMs,
        timestamp: s.timestamp,
    }));

    const result = agentResponse?.result ?? null;
    const errorMessage = executionError ?? agentResponse?.error ?? null;

    // Update DB record
    if (db) {
        try {
            await db.browserTask.update({
                where: { id: taskId },
                data: {
                    status,
                    steps: JSON.stringify(steps),
                    result: result ?? null,
                    errorMessage: errorMessage ?? null,
                    startedAt,
                    completedAt,
                    updatedAt: completedAt,
                },
            });
        } catch {
            // non-fatal
        }

        // Log SalesActivity — exact pattern from deal-closer.ts
        if (prospectId) {
            try {
                await db.salesActivity.create({
                    data: {
                        tenantId,
                        botId,
                        prospectId,
                        dealId: dealId ?? null,
                        activityType: 'browser_task',
                        subject: `Browser task ${status}: ${goal.slice(0, 120)}`,
                        body: result ?? errorMessage ?? null,
                        outcome: status,
                        completedAt,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                });
            } catch {
                // non-fatal
            }
        }
    }

    // Audit log
    try {
        const writer = getAuditLogWriter();
        writer.nextSequence(taskId);
    } catch {
        // non-fatal
    }

    return {
        id: taskId,
        tenantId,
        botId,
        prospectId: prospectId ?? null,
        dealId: dealId ?? null,
        goal,
        allowedDomain: allowedDomain ?? null,
        status,
        steps,
        result,
        errorMessage,
        startedAt,
        completedAt,
        createdAt: startedAt,
        updatedAt: completedAt,
    };
}
