// ============================================================================
// report-mailer.ts — fetch analytics data, render a plain-text digest email,
// and deliver it via SMTP (if SMTP_HOST is configured) or log it to
// NotificationLog as a fallback.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Types — mirrors the api-gateway analytics response shapes exactly
// ---------------------------------------------------------------------------

export type CostSummary = {
    tenantId: string;
    from: string;
    to: string;
    taskCount: number;
    totalCostUsd: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    successRate: number | null;
    byProvider: Array<{
        provider: string;
        taskCount: number;
        totalCostUsd: number;
        avgLatencyMs: number;
    }>;
    weeklyTrend: Array<{
        weekStart: string;
        taskCount: number;
        successCount: number;
        totalCostUsd: number;
    }>;
};

export type AgentPerf = {
    tenantId: string;
    from: string;
    to: string;
    taskCount: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    totalCostUsd: number;
    avgCostUsd: number | null;
    totalTokens: number;
    avgQualityScore: number | null;
    byProvider: Record<
        string,
        { taskCount: number; totalCostUsd: number; avgLatencyMs: number }
    >;
    weeklyTrend: Array<{
        weekStart: string;
        taskCount: number;
        successCount: number;
        totalCostUsd: number;
    }>;
};

export type ReportData = {
    cost?: CostSummary;
    performance?: AgentPerf;
};

export type ReportMailerOptions = {
    /** Base URL of the api-gateway, e.g. http://localhost:3000 */
    apiGatewayUrl: string;
    /** Bearer token for internal api-gateway calls */
    internalToken: string;
};

// ---------------------------------------------------------------------------
// Data fetch helpers
// ---------------------------------------------------------------------------

function dateRange(frequency: string): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const msPerDay = 86_400_000;
    let daysBack: number;
    if (frequency === 'daily') daysBack = 1;
    else if (frequency === 'monthly') daysBack = 30;
    else daysBack = 7; // default: weekly
    const from = new Date(now.getTime() - daysBack * msPerDay)
        .toISOString()
        .slice(0, 10);
    return { from, to };
}

export async function fetchReportData(
    tenantId: string,
    workspaceId: string,
    reportTypes: string[],
    frequency: string,
    opts: ReportMailerOptions,
): Promise<ReportData> {
    const { from, to } = dateRange(frequency);
    const base = opts.apiGatewayUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.internalToken}`,
    };
    const result: ReportData = {};

    if (reportTypes.includes('cost')) {
        const qs = new URLSearchParams({
            tenantId,
            workspaceId,
            from,
            to,
        }).toString();
        const res = await fetch(`${base}/v1/analytics/cost-summary?${qs}`, {
            headers,
        });
        if (res.ok) {
            result.cost = (await res.json()) as CostSummary;
        } else {
            console.error(
                `[report-mailer] cost-summary fetch failed: ${res.status}`,
            );
        }
    }

    if (reportTypes.includes('performance')) {
        const qs = new URLSearchParams({
            tenantId,
            workspaceId,
            from,
            to,
        }).toString();
        const res = await fetch(
            `${base}/v1/analytics/agent-performance?${qs}`,
            { headers },
        );
        if (res.ok) {
            result.performance = (await res.json()) as AgentPerf;
        } else {
            console.error(
                `[report-mailer] agent-performance fetch failed: ${res.status}`,
            );
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Email renderer — plain text
// ---------------------------------------------------------------------------

export function renderReportText(
    reportName: string,
    data: ReportData,
): string {
    const lines: string[] = [
        `AgentFarm Digest: ${reportName}`,
        '='.repeat(48),
        '',
    ];

    if (data.cost) {
        const c = data.cost;
        lines.push('COST SUMMARY');
        lines.push('-'.repeat(24));
        lines.push(`Period          : ${c.from ?? 'n/a'} → ${c.to ?? 'n/a'}`);
        lines.push(`Tasks           : ${c.taskCount ?? 0}`);
        lines.push(`Total cost      : $${(c.totalCostUsd ?? 0).toFixed(4)}`);
        lines.push(
            `Prompt tokens   : ${(c.totalPromptTokens ?? 0).toLocaleString()}`,
        );
        lines.push(
            `Completion tokens: ${(c.totalCompletionTokens ?? 0).toLocaleString()}`,
        );
        lines.push(
            `Success rate    : ${c.successRate != null ? `${(c.successRate * 100).toFixed(1)}%` : 'n/a'}`,
        );
        if ((c.byProvider?.length ?? 0) > 0) {
            lines.push('');
            lines.push('By provider:');
            for (const p of c.byProvider) {
                lines.push(
                    `  ${p.provider.padEnd(12)} tasks=${p.taskCount} cost=$${(p.totalCostUsd ?? 0).toFixed(4)} latency=${(p.avgLatencyMs ?? 0).toFixed(0)}ms`,
                );
            }
        }
        lines.push('');
    }

    if (data.performance) {
        const p = data.performance;
        lines.push('AGENT PERFORMANCE');
        lines.push('-'.repeat(24));
        lines.push(`Period          : ${p.from ?? 'n/a'} → ${p.to ?? 'n/a'}`);
        lines.push(`Tasks           : ${p.taskCount ?? 0}`);
        lines.push(
            `Success rate    : ${p.successRate != null ? `${(p.successRate * 100).toFixed(1)}%` : 'n/a'}`,
        );
        lines.push(
            `Avg latency     : ${p.avgLatencyMs != null ? `${p.avgLatencyMs.toFixed(0)}ms` : 'n/a'}`,
        );
        lines.push(`Total cost      : $${(p.totalCostUsd ?? 0).toFixed(4)}`);
        lines.push(
            `Total tokens    : ${(p.totalTokens ?? 0).toLocaleString()}`,
        );
        lines.push(
            `Avg quality     : ${p.avgQualityScore != null ? p.avgQualityScore.toFixed(2) : 'n/a'}`,
        );
        lines.push('');
    }

    lines.push('---');
    lines.push('You are receiving this because a scheduled report is configured.');
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Delivery — SMTP send + NotificationLog write
// ---------------------------------------------------------------------------

export async function sendReport(
    prisma: PrismaClient,
    report: {
        id: string;
        tenantId: string;
        workspaceId: string;
        name: string;
        recipientEmail: string;
        frequency: string;
        reportTypes: string[];
    },
    data: ReportData,
    opts: ReportMailerOptions,
): Promise<void> {
    const text = renderReportText(report.name, data);
    const subject = `AgentFarm Digest: ${report.name}`;

    // Attempt SMTP delivery when SMTP_HOST is configured
    const smtpHost = process.env['SMTP_HOST'];
    let deliveryStatus: 'sent' | 'failed' = 'sent';
    let deliveryError: string | undefined;

    if (smtpHost) {
        const smtpPort = parseInt(process.env['SMTP_PORT'] ?? '587', 10);
        const smtpUser = process.env['SMTP_USER'];
        const smtpPass = process.env['SMTP_PASS'];
        const smtpFrom = process.env['SMTP_FROM'] ?? smtpUser ?? 'noreply@agentfarm.local';

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: smtpUser
                ? { user: smtpUser, pass: smtpPass ?? '' }
                : undefined,
        });

        try {
            await transporter.sendMail({
                from: smtpFrom,
                to: report.recipientEmail,
                subject,
                text,
            });
        } catch (err) {
            deliveryStatus = 'failed';
            deliveryError =
                err instanceof Error ? err.message : String(err);
            console.error('[report-mailer] SMTP send failed:', deliveryError);
        }
    }

    // Always write to NotificationLog — acts as audit trail and fallback
    await prisma.notificationLog.create({
        data: {
            tenantId: report.tenantId,
            workspaceId: report.workspaceId,
            channel: smtpHost ? 'email' : 'log',
            eventTrigger: 'scheduled_report',
            status: deliveryStatus,
            payload: {
                reportId: report.id,
                reportName: report.name,
                recipientEmail: report.recipientEmail,
                frequency: report.frequency,
                reportTypes: report.reportTypes,
                subject,
                ...(deliveryError ? { error: deliveryError } : {}),
            },
            sentAt: new Date(),
        },
    });
}
