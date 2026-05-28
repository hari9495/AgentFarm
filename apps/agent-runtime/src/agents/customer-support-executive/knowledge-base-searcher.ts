/**
 * Knowledge Base Searcher — searches internal KB for resolution steps.
 *
 * Two modes:
 *   1. MCP connector mode — queries Confluence / Notion / Google Drive / Zendesk
 *      Guide via the helpdesk or document MCP URL.
 *   2. Fallback — returns a structured investigation checklist based on
 *      issue category so agents always have something actionable.
 */

import type { IssueCategory } from './response-composer.js';

export type { IssueCategory };
export type Industry = import('./response-composer.js').Industry;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KbSearchParams {
    tenantId: string;
    botId: string;
    query: string;
    issueCategory?: IssueCategory;
    industry?: Industry;
    maxResults?: number;
    connector?: string;
}

export interface KbArticle {
    articleId: string;
    title: string;
    url?: string;
    excerpt: string;
    resolutionSteps: string[];
    confidence: number;
}

export interface KbSearchResult {
    articles: KbArticle[];
    fallbackPlaybook: string[];
    searchedConnector: string;
}

// ---------------------------------------------------------------------------
// Connector resolution
// ---------------------------------------------------------------------------

function resolveKbUrl(connector?: string): string | null {
    const candidates = [
        connector && process.env[`MCP_${connector.toUpperCase()}_URL`],
        process.env['MCP_ZENDESK_GUIDE_URL'],
        process.env['MCP_CONFLUENCE_URL'],
        process.env['MCP_NOTION_URL'],
        process.env['MCP_GOOGLE_DRIVE_URL'],
        process.env['MCP_KB_URL'],
    ];
    for (const c of candidates) {
        if (c && c.trim()) return c.trim();
    }
    return null;
}

// ---------------------------------------------------------------------------
// Category-based fallback playbooks
// ---------------------------------------------------------------------------

const FALLBACK_PLAYBOOKS: Record<IssueCategory, string[]> = {
    billing: [
        'Verify the charge on the account transaction history.',
        'Check for duplicate payment entries or pending holds.',
        'Review the billing cycle date and proration rules.',
        'If an error is confirmed, initiate a credit or refund workflow.',
        'Send the customer an itemised billing summary by email.',
    ],
    technical: [
        'Reproduce the issue using the customer\'s account credentials in a test environment.',
        'Check the system status page for any ongoing incidents.',
        'Ask the customer to clear browser cache and cookies, or try a private window.',
        'Collect error logs, screenshots, and browser/OS version.',
        'If unresolved, create a bug ticket and escalate to Tier 2.',
    ],
    shipping: [
        'Pull the latest tracking information from the logistics provider.',
        'Verify the shipping address matches what was entered at checkout.',
        'Check for customs holds or address delivery exceptions.',
        'Contact the carrier to file a missing parcel report if the window has passed.',
        'Offer reshipment or refund as per the return/shipping policy.',
    ],
    account_access: [
        'Verify customer identity using at least two verification factors.',
        'Check if the account is locked due to too many failed login attempts.',
        'Send a password reset link to the email on file.',
        'If the email has changed, run the identity verification flow.',
        'Enable the account and log the action in the audit trail.',
    ],
    refund: [
        'Confirm the original transaction ID and purchase date.',
        'Verify the refund eligibility against the refund policy window.',
        'Check if a refund has already been initiated.',
        'Process the refund through the payment gateway and note the reference number.',
        'Inform the customer of the expected settlement timeline.',
    ],
    product_info: [
        'Retrieve the latest product specifications from the internal product catalogue.',
        'Cross-reference pricing with the current price list (watch for promotional rates).',
        'Check for any active promotions or bundle offers.',
        'Provide a clear comparison if the customer is deciding between options.',
        'Offer to connect the customer with a specialist for complex product questions.',
    ],
    complaint: [
        'Listen fully without interrupting and acknowledge the customer\'s experience.',
        'Apologise sincerely and avoid defensive language.',
        'Identify the root cause: service failure, product defect, or communication gap.',
        'Offer a concrete remedy: replacement, credit, refund, or escalation.',
        'Log the complaint in the CRM and flag for quality review.',
    ],
    feature_request: [
        'Capture the exact feature description and use case from the customer.',
        'Check the internal product roadmap for any planned similar features.',
        'Log the request in the product feedback tool with the customer\'s email.',
        'Set expectations: no timelines can be committed, but requests are reviewed quarterly.',
        'Notify the customer if the feature is released.',
    ],
    onboarding: [
        'Send the welcome email with the quick-start guide link.',
        'Walk the customer through account setup step by step.',
        'Check that all integrations required by the customer are active.',
        'Schedule an onboarding call with a success manager if needed.',
        'Add the customer to the new-user email drip sequence.',
    ],
    cancellation: [
        'Acknowledge the request and ask for the reason — without pressure.',
        'Present any relevant retention offer (discount, pause, downgrade).',
        'If the customer still wants to cancel, process immediately and confirm.',
        'Ensure data export or transition instructions are provided.',
        'Send a cancellation confirmation email and log in CRM.',
    ],
    subscription: [
        'Confirm the current plan and billing cycle.',
        'Review what the requested plan change entails (features, pricing, proration).',
        'Process the change effective immediately or at the next billing cycle per policy.',
        'Send a confirmation email with the new plan details.',
        'Update the CRM with the plan change reason.',
    ],
    data_privacy: [
        'Verify the customer\'s identity before processing any data request.',
        'Log the request with a timestamp in the compliance system.',
        'Route to the Data Protection Officer for right-to-erasure or data-export requests.',
        'Respond within the legally mandated timeframe (e.g., 72 hours for GDPR).',
        'Confirm completion to the customer in writing.',
    ],
    escalation_followup: [
        'Review the full case history before contacting the customer.',
        'Confirm the resolution steps taken and their outcome.',
        'If the issue persists, escalate immediately with full context.',
        'If resolved, ask the customer to confirm satisfaction.',
        'Close the ticket only after explicit confirmation.',
    ],
    general: [
        'Review the customer\'s full history and previous interactions.',
        'Identify the core issue and categorise it appropriately.',
        'Search the knowledge base for relevant resolution articles.',
        'Respond with a clear, empathetic message and next steps.',
        'Set a follow-up reminder if the resolution requires more than 1 business day.',
    ],
};

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export async function searchKnowledgeBase(params: KbSearchParams): Promise<KbSearchResult> {
    const kbUrl = resolveKbUrl(params.connector);
    const maxResults = params.maxResults ?? 5;

    if (kbUrl) {
        try {
            const res = await fetch(`${kbUrl}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: params.tenantId,
                    botId: params.botId,
                    query: params.query,
                    category: params.issueCategory,
                    industry: params.industry,
                    limit: maxResults,
                }),
            });
            if (res.ok) {
                const data = (await res.json()) as { articles?: KbArticle[] };
                return {
                    articles: data.articles ?? [],
                    fallbackPlaybook: FALLBACK_PLAYBOOKS[params.issueCategory ?? 'general'],
                    searchedConnector: kbUrl,
                };
            }
        } catch {
            // fall through to offline mode
        }
    }

    // Offline mode — return a synthesised article from the fallback playbook
    const category = params.issueCategory ?? 'general';
    return {
        articles: [
            {
                articleId: `offline-${category}`,
                title: `Standard Resolution Guide: ${category.replace(/_/g, ' ')}`,
                excerpt: FALLBACK_PLAYBOOKS[category][0] ?? 'See resolution steps below.',
                resolutionSteps: FALLBACK_PLAYBOOKS[category],
                confidence: 0.6,
            },
        ],
        fallbackPlaybook: FALLBACK_PLAYBOOKS[category],
        searchedConnector: 'offline',
    };
}

// ---------------------------------------------------------------------------
// Diagnostic runner — produces an ordered checklist for live troubleshooting
// ---------------------------------------------------------------------------

export function buildDiagnosticChecklist(
    issueCategory: IssueCategory,
    context: {
        industry?: Industry;
        productName?: string;
        errorMessage?: string;
        accountId?: string;
    },
): string[] {
    const base = FALLBACK_PLAYBOOKS[issueCategory].slice();
    const extras: string[] = [];

    if (context.errorMessage) {
        extras.unshift(`Recorded error message: "${context.errorMessage.slice(0, 200)}".`);
    }
    if (context.accountId) {
        extras.unshift(`Pull full account history for account ID: ${context.accountId}.`);
    }
    if (context.industry === 'healthcare') {
        extras.push('Ensure any resolution complies with HIPAA data handling requirements.');
    }
    if (context.industry === 'fintech') {
        extras.push('Verify the resolution complies with PCI-DSS and applicable financial regulations.');
    }

    return [...extras, ...base];
}
