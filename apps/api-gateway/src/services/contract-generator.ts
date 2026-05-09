/**
 * Contract Generator
 *
 * Generates a professional PDF service agreement using PDFKit.
 * The resulting Buffer can be uploaded directly to Zoho Sign.
 */

import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContractPdfParams = {
    customerName: string;
    customerEmail: string;
    companyName: string;
    planName: string;
    agentSlots: number;
    amountCents: number;
    currency: string;
    features: string;
    orderId: string;
    date: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a cent amount into a human-readable currency string.
 *   INR → "₹1,234"
 *   USD → "$1,234"
 *   other → "1,234 EUR"
 */
export function formatAmount(cents: number, currency: string): string {
    const whole = Math.floor(cents / 100);
    const formatted = whole.toLocaleString('en-IN');
    const upper = currency.toUpperCase();
    if (upper === 'INR') return `₹${formatted}`;
    if (upper === 'USD') return `$${formatted}`;
    return `${formatted} ${upper}`;
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

/**
 * Generates a service agreement PDF and returns it as a Buffer.
 */
export function generateContractPdf(params: ContractPdfParams): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 60, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 120; // account for margins

        // ----------------------------------------------------------------
        // Header
        // ----------------------------------------------------------------
        doc
            .fontSize(20)
            .font('Helvetica-Bold')
            .text('AgentFarm Service Agreement', { align: 'center' })
            .moveDown(0.4);

        doc
            .fontSize(10)
            .font('Helvetica')
            .text(`Date: ${formatDate(params.date)}`, { align: 'center' })
            .moveDown(1.5);

        doc
            .moveTo(60, doc.y)
            .lineTo(60 + pageWidth, doc.y)
            .strokeColor('#CCCCCC')
            .stroke()
            .moveDown(1);

        // ----------------------------------------------------------------
        // Parties
        // ----------------------------------------------------------------
        doc
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('Parties')
            .moveDown(0.4);

        doc
            .fontSize(10)
            .font('Helvetica')
            .text(`Service Provider: AgentFarm (${params.companyName})`)
            .moveDown(0.3)
            .text(`Customer: ${params.customerName} (${params.customerEmail})`)
            .moveDown(1.2);

        // ----------------------------------------------------------------
        // Plan details
        // ----------------------------------------------------------------
        doc
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('Plan Details')
            .moveDown(0.4);

        doc
            .fontSize(10)
            .font('Helvetica')
            .text(`Plan Name: ${params.planName}`)
            .moveDown(0.3)
            .text(`Agent Slots: ${params.agentSlots}`)
            .moveDown(0.6);

        doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Included Features:')
            .moveDown(0.3);

        const featureList = params.features
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean);

        for (const feature of featureList) {
            doc
                .fontSize(10)
                .font('Helvetica')
                .text(`  • ${feature}`)
                .moveDown(0.2);
        }

        doc.moveDown(0.8);

        // ----------------------------------------------------------------
        // Payment
        // ----------------------------------------------------------------
        doc
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('Payment')
            .moveDown(0.4);

        doc
            .fontSize(10)
            .font('Helvetica')
            .text(`Total Amount: ${formatAmount(params.amountCents, params.currency)}`)
            .moveDown(1.2);

        // ----------------------------------------------------------------
        // Terms
        // ----------------------------------------------------------------
        doc
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('Terms & Conditions')
            .moveDown(0.4);

        const terms = [
            'Customer agrees to use agents within purchased slot limits',
            'AgentFarm will provision agents within 24 hours of contract signing',
            'Contract is valid for 12 months from signing date',
        ];

        for (const term of terms) {
            doc
                .fontSize(10)
                .font('Helvetica')
                .text(`  • ${term}`)
                .moveDown(0.3);
        }

        doc.moveDown(1.5);

        // ----------------------------------------------------------------
        // Signature section
        // ----------------------------------------------------------------
        doc
            .moveTo(60, doc.y)
            .lineTo(60 + pageWidth, doc.y)
            .strokeColor('#CCCCCC')
            .stroke()
            .moveDown(1);

        doc
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('Signatures')
            .moveDown(0.6);

        doc
            .fontSize(10)
            .font('Helvetica')
            .text('Customer Signature: ___________________________')
            .moveDown(0.5)
            .text(`Name: ${params.customerName}`)
            .moveDown(0.5)
            .text(`Date: ${formatDate(params.date)}`)
            .moveDown(1.5);

        doc
            .fontSize(10)
            .font('Helvetica')
            .text('AgentFarm Authorised Signatory: ___________________________')
            .moveDown(0.5)
            .text('Name: AgentFarm Platform')
            .moveDown(0.5)
            .text(`Date: ${formatDate(params.date)}`)
            .moveDown(2);

        // ----------------------------------------------------------------
        // Footer
        // ----------------------------------------------------------------
        doc
            .moveTo(60, doc.y)
            .lineTo(60 + pageWidth, doc.y)
            .strokeColor('#CCCCCC')
            .stroke()
            .moveDown(0.6);

        doc
            .fontSize(9)
            .fillColor('#888888')
            .font('Helvetica')
            .text(`Order ID: ${params.orderId}`, { align: 'center' });

        doc.end();
    });
}
