/**
 * Proposal PDF generator.
 *
 * Note: pdfkit is installed in apps/api-gateway (not agent-runtime),
 * so this module lives here rather than in agent-runtime/src/sales/.
 * It is called directly from the meetings route within the same package.
 */
import PDFDocument from 'pdfkit';
import { createWriteStream, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { getEmailProvider } from '@agentfarm/agent-runtime/sales/email-provider-factory.js';
import type { EmailProviderConfig } from '@agentfarm/agent-runtime/sales/email-provider.js';
import type { SalesEmailProvider } from '@agentfarm/shared-types';

const PROPOSAL_DIR = '/tmp/proposals';

type PrismaForProposal = {
    meetingSession: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    bookingEvent: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    prospect: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

/**
 * Generates a 4-page PDF proposal and saves it to disk.
 * Returns the file path on success, or null on failure.
 * Never throws.
 */
export async function generateProposalPdf(
    meetingSessionId: string,
    tenantId: string,
    prisma: PrismaClient,
): Promise<string | null> {
    try {
        const db = prisma as unknown as PrismaForProposal;

        const session = await db.meetingSession.findFirst({
            where: { id: meetingSessionId, tenantId },
        });
        if (!session) return null;

        const booking = await db.bookingEvent.findFirst({
            where: { meetingSessionId, tenantId },
        });

        let config: Record<string, unknown> | null = null;
        let prospect: Record<string, unknown> | null = null;

        if (booking?.['botId']) {
            config = await db.salesAgentConfig.findFirst({
                where: { tenantId, botId: String(booking['botId']) },
            });
        }
        if (booking?.['prospectId']) {
            prospect = await db.prospect.findFirst({
                where: { id: String(booking['prospectId']), tenantId },
            });
        }

        const prospectName = prospect
            ? `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim()
            : 'Valued Prospect';
        const company = String(prospect?.['company'] ?? '');
        const productDescription = String(config?.['productDescription'] ?? 'Our Solution');

        // Ensure directory exists
        const dirPath = join(PROPOSAL_DIR, tenantId);
        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
        }
        const filePath = join(dirPath, `${meetingSessionId}.pdf`);

        await new Promise<void>((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const stream = createWriteStream(filePath);
            doc.pipe(stream);

            // Page 1: Title page
            doc.fontSize(28).font('Helvetica-Bold').text('Proposal', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(14).font('Helvetica').text(
                `Prepared for: ${prospectName}${company ? ` at ${company}` : ''}`,
                { align: 'center' },
            );
            doc.moveDown(2);
            doc.fontSize(11).fillColor('#555555').text(
                `Generated: ${new Date().toLocaleDateString()}`,
                { align: 'center' },
            );
            doc.fillColor('#000000');

            // Page 2: Meeting summary
            doc.addPage();
            doc.fontSize(20).font('Helvetica-Bold').text('Meeting Summary');
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica').text(
                String(session['summaryText'] ?? 'No summary recorded for this meeting.'),
            );

            // Page 3: Action items
            doc.addPage();
            doc.fontSize(20).font('Helvetica-Bold').text('Action Items');
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica').text(
                String(session['actionItems'] ?? 'No action items recorded.'),
            );

            // Page 4: About our solution
            doc.addPage();
            doc.fontSize(20).font('Helvetica-Bold').text('About Our Solution');
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica').text(productDescription);

            doc.end();
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        // Persist proposalPath on the session record
        await db.meetingSession.update({
            where: { id: meetingSessionId },
            data: { proposalPath: filePath },
        });

        return filePath;
    } catch (err: unknown) {
        console.warn('[proposal-generator] generateProposalPdf failed:', err);
        return null;
    }
}

/**
 * Sends the generated proposal PDF as an email attachment to the prospect.
 * Returns true on success, false on any failure.
 * Never throws.
 */
export async function sendProposalEmail(
    meetingSessionId: string,
    tenantId: string,
    prisma: PrismaClient,
): Promise<boolean> {
    try {
        const db = prisma as unknown as PrismaForProposal;

        const session = await db.meetingSession.findFirst({
            where: { id: meetingSessionId, tenantId },
        });
        if (!session?.['proposalPath']) return false;

        const booking = await db.bookingEvent.findFirst({
            where: { meetingSessionId, tenantId },
        });
        if (!booking?.['prospectId'] || !booking?.['botId']) return false;

        const [config, prospect] = await Promise.all([
            db.salesAgentConfig.findFirst({
                where: { tenantId, botId: String(booking['botId']) },
            }),
            db.prospect.findFirst({
                where: { id: String(booking['prospectId']), tenantId },
            }),
        ]);

        if (!prospect?.['email'] || !config) return false;

        const pdfBuffer = readFileSync(String(session['proposalPath']));

        const emailConfig: EmailProviderConfig = {
            apiKey: process.env.SALES_EMAIL_API_KEY,
            host: process.env.SALES_SMTP_HOST,
            port: Number(process.env.SALES_SMTP_PORT ?? '587'),
            secure: process.env.SALES_SMTP_SECURE === 'true',
            user: process.env.SALES_SMTP_USER,
            pass: process.env.SALES_SMTP_PASS,
            fromEmail: process.env.SALES_FROM_EMAIL ?? 'sales@agentfarm.dev',
            fromName: process.env.SALES_FROM_NAME,
        };

        const provider = getEmailProvider(String(config['emailProvider']) as SalesEmailProvider);
        const result = await provider.sendEmail(
            {
                to: String(prospect['email']),
                from: emailConfig.fromEmail ?? 'sales@agentfarm.dev',
                subject: `Your Proposal from ${String(config['productDescription'] ?? 'AgentFarm')}`,
                body: 'Please find your proposal attached. We look forward to working with you.',
                attachments: [{
                    filename: 'proposal.pdf',
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }],
            },
            emailConfig,
        );

        if (result.success) {
            // Log the send as a SalesActivity
            await db.salesActivity.create({
                data: {
                    tenantId,
                    botId: String(booking['botId']),
                    prospectId: String(booking['prospectId']),
                    activityType: 'email_sent',
                    subject: `Proposal sent to ${String(prospect['email'])}`,
                    body: 'Proposal PDF sent to prospect',
                    completedAt: new Date(),
                },
            }).catch((err: unknown) => {
                console.warn('[proposal-generator] Failed to log activity:', err);
            });
        }

        return result.success;
    } catch (err: unknown) {
        console.warn('[proposal-generator] sendProposalEmail failed:', err);
        return false;
    }
}
