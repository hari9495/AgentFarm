// ============================================================================
// report-sweep.ts — find due ScheduledReport rows and send them.
// Follows the same startXSweep pattern used by schedule-sweep.ts.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import {
    fetchReportData,
    sendReport,
    type ReportMailerOptions,
} from './report-mailer.js';

// ---------------------------------------------------------------------------
// nextSendAt computation
// ---------------------------------------------------------------------------

function computeNextSendAt(frequency: string, from: Date): Date {
    const msPerDay = 86_400_000;
    let addMs: number;
    if (frequency === 'daily') addMs = msPerDay;
    else if (frequency === 'monthly') addMs = 30 * msPerDay;
    else addMs = 7 * msPerDay; // weekly default
    return new Date(from.getTime() + addMs);
}

// ---------------------------------------------------------------------------
// runReportSweep — single sweep pass
// ---------------------------------------------------------------------------

export async function runReportSweep(
    prisma: PrismaClient,
    opts: ReportMailerOptions,
): Promise<{ sent: number }> {
    let sent = 0;
    const now = new Date();

    try {
        const reports = await prisma.scheduledReport.findMany({
            where: { enabled: true, nextSendAt: { lte: now } },
        });

        for (const report of reports) {
            try {
                const data = await fetchReportData(
                    report.tenantId,
                    report.workspaceId,
                    report.reportTypes,
                    report.frequency,
                    opts,
                );
                await sendReport(prisma, report, data, opts);
                await prisma.scheduledReport.update({
                    where: { id: report.id },
                    data: {
                        lastSentAt: now,
                        nextSendAt: computeNextSendAt(report.frequency, now),
                    },
                });
                sent += 1;
            } catch (err) {
                console.error(
                    `[report-sweep] failed to send report ${report.id}:`,
                    err,
                );
            }
        }
    } catch (err) {
        console.error('[report-sweep] sweep failed:', err);
    }

    return { sent };
}

// ---------------------------------------------------------------------------
// startReportSweep — fire immediately + setInterval, returns clearable handle
// ---------------------------------------------------------------------------

export function startReportSweep(
    prisma: PrismaClient,
    opts: ReportMailerOptions,
    intervalMs = 60_000,
): NodeJS.Timeout {
    runReportSweep(prisma, opts).catch(console.error);
    return setInterval(() => {
        runReportSweep(prisma, opts).catch(console.error);
    }, intervalMs);
}
