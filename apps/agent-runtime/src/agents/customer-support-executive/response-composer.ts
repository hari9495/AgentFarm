/**
 * Response Composer — produces empathetic, on-brand customer replies.
 *
 * Uses a two-layer system:
 *   1. Issue-category playbooks (industry-tagged templates) for known scenarios.
 *   2. Structured prose assembly for anything not covered by a playbook.
 *
 * Never fabricates resolution steps — unknown resolutions produce an
 * "investigating" reply that sets an honest expectation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueCategory =
    | 'billing'
    | 'technical'
    | 'shipping'
    | 'account_access'
    | 'refund'
    | 'product_info'
    | 'complaint'
    | 'feature_request'
    | 'onboarding'
    | 'cancellation'
    | 'subscription'
    | 'data_privacy'
    | 'escalation_followup'
    | 'general';

export type Industry =
    | 'ecommerce'
    | 'saas'
    | 'fintech'
    | 'healthcare'
    | 'telecom'
    | 'travel'
    | 'insurance'
    | 'education'
    | 'gaming'
    | 'logistics'
    | 'generic';

export type ResponseTone = 'empathetic' | 'professional' | 'friendly' | 'apologetic' | 'informative';

export interface ComposeReplyParams {
    customerName?: string;
    issueCategory: IssueCategory;
    industry?: Industry;
    tone?: ResponseTone;
    issueDescription: string;
    resolutionSteps?: string[];
    agentName?: string;
    companyName?: string;
    ticketId?: string;
    followUpSla?: string;
}

export interface ComposedReply {
    subject: string;
    body: string;
    tone: ResponseTone;
    category: IssueCategory;
    containsCommitment: boolean;
}

// ---------------------------------------------------------------------------
// Playbook registry
// ---------------------------------------------------------------------------

const OPENING_BY_TONE: Record<ResponseTone, string[]> = {
    empathetic: [
        "I completely understand how frustrating this must be, and I sincerely apologize for the inconvenience.",
        "I hear you, and I want you to know we take this very seriously.",
        "I'm sorry to hear you're experiencing this — let's get it sorted right away.",
    ],
    professional: [
        "Thank you for reaching out to our support team.",
        "We have received your inquiry and appreciate you bringing this to our attention.",
        "Thank you for contacting us. We are here to help.",
    ],
    friendly: [
        "Hey there! Thanks so much for getting in touch with us.",
        "Hi! Great to hear from you — let's get this sorted for you.",
        "Thanks for reaching out! Happy to help.",
    ],
    apologetic: [
        "I sincerely apologize for the experience you've had. This is not the standard we hold ourselves to.",
        "We are truly sorry for the trouble this has caused you.",
        "Please accept our deepest apologies for this inconvenience.",
    ],
    informative: [
        "Thank you for your inquiry. I'd be happy to walk you through the details.",
        "Great question — let me provide you with the information you need.",
        "Thanks for asking. Here is everything you need to know.",
    ],
};

const CLOSING_BY_TONE: Record<ResponseTone, string> = {
    empathetic:    "Please don't hesitate to reach out if there's anything else I can do for you. We value your trust.",
    professional:  "Should you have any further questions, please do not hesitate to contact us.",
    friendly:      "Feel free to reach back out anytime — we're always here for you!",
    apologetic:    "We genuinely appreciate your patience and the opportunity to make this right.",
    informative:   "I hope this clarifies things. Feel free to ask if you have any other questions.",
};

interface PlaybookEntry {
    subjectPrefix: string;
    openingCategory: ResponseTone;
    bodyTemplate: (params: ComposeReplyParams) => string;
}

const PLAYBOOKS: Record<IssueCategory, PlaybookEntry> = {
    billing: {
        subjectPrefix: 'Re: Your Billing Inquiry',
        openingCategory: 'professional',
        bodyTemplate: (p) =>
            `I have reviewed your billing inquiry and want to address it promptly.\n\n` +
            (p.resolutionSteps?.length
                ? `Here is what we have done / what you can do:\n${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Our billing team is actively investigating the discrepancy and will provide a full resolution within ${p.followUpSla ?? '1–2 business days'}.`),
    },
    technical: {
        subjectPrefix: 'Re: Technical Support Request',
        openingCategory: 'professional',
        bodyTemplate: (p) =>
            `I understand you're experiencing a technical issue. Let's work through this together.\n\n` +
            (p.resolutionSteps?.length
                ? `Please try the following steps:\n${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Our technical team has been alerted and is investigating. We will update you within ${p.followUpSla ?? '4 business hours'}.`),
    },
    shipping: {
        subjectPrefix: 'Re: Your Shipment Inquiry',
        openingCategory: 'empathetic',
        bodyTemplate: (p) =>
            `I understand how important it is to receive your order on time.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `We have flagged this with our logistics team and will provide a tracking update within ${p.followUpSla ?? '24 hours'}.`),
    },
    account_access: {
        subjectPrefix: 'Re: Account Access Support',
        openingCategory: 'professional',
        bodyTemplate: (p) =>
            `Account access issues can be disruptive and we want to resolve this quickly.\n\n` +
            (p.resolutionSteps?.length
                ? `Steps to regain access:\n${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Our security team is verifying your account. For your protection, this process takes up to ${p.followUpSla ?? '2 business hours'}.`),
    },
    refund: {
        subjectPrefix: 'Re: Your Refund Request',
        openingCategory: 'apologetic',
        bodyTemplate: (p) =>
            `We have received your refund request and are processing it now.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Once approved, the refund will be reflected within ${p.followUpSla ?? '5–7 business days'} depending on your payment provider.`),
    },
    product_info: {
        subjectPrefix: 'Re: Product Information Request',
        openingCategory: 'informative',
        bodyTemplate: (p) =>
            `I'm happy to share details about ${p.issueDescription.slice(0, 80)}.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `For the most up-to-date specifications and pricing, please also visit our product page or let me know the exact model / feature you need.`),
    },
    complaint: {
        subjectPrefix: 'Re: Your Feedback',
        openingCategory: 'apologetic',
        bodyTemplate: (p) =>
            `Your feedback has been formally recorded and escalated to our quality team.\n\n` +
            (p.resolutionSteps?.length
                ? `Immediate actions being taken:\n${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `A senior member of our team will review this case and respond within ${p.followUpSla ?? '1 business day'}.`),
    },
    feature_request: {
        subjectPrefix: 'Re: Your Feature Request',
        openingCategory: 'friendly',
        bodyTemplate: (p) =>
            `Thank you for this valuable suggestion — customer ideas directly shape our product roadmap.\n\n` +
            `Your request has been logged and forwarded to our product team. While we cannot guarantee timelines, we ` +
            `will notify you if this is prioritised in a future release.`,
    },
    onboarding: {
        subjectPrefix: 'Re: Getting Started',
        openingCategory: 'friendly',
        bodyTemplate: (p) =>
            `Welcome aboard! We're excited to have you with us.\n\n` +
            (p.resolutionSteps?.length
                ? `Here are the first steps to get you started:\n${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Our onboarding team will reach out within ${p.followUpSla ?? '24 hours'} to walk you through setup.`),
    },
    cancellation: {
        subjectPrefix: 'Re: Your Cancellation Request',
        openingCategory: 'empathetic',
        bodyTemplate: (p) =>
            `We're sorry to hear you'd like to cancel. We value your business and want to understand if there's ` +
            `anything we can do to address your concerns.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `If you'd still like to proceed, please confirm and we will process your request within ${p.followUpSla ?? '1 business day'}.`),
    },
    subscription: {
        subjectPrefix: 'Re: Your Subscription',
        openingCategory: 'professional',
        bodyTemplate: (p) =>
            `I'd be happy to help with your subscription.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Please share the specific change you'd like — upgrade, downgrade, pause, or cancellation — and we'll action it right away.`),
    },
    data_privacy: {
        subjectPrefix: 'Re: Data Privacy / GDPR Request',
        openingCategory: 'professional',
        bodyTemplate: (p) =>
            `We take data privacy extremely seriously and are committed to full compliance with applicable regulations.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `Your request has been forwarded to our Data Protection Officer. We will respond within ${p.followUpSla ?? '72 hours'} as required by applicable law.`),
    },
    escalation_followup: {
        subjectPrefix: 'Re: Follow-up on Your Case',
        openingCategory: 'empathetic',
        bodyTemplate: (p) =>
            `I'm following up on the case we discussed earlier to ensure everything has been resolved to your satisfaction.\n\n` +
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `If you are still experiencing issues, please reply to this message and I will personally prioritise your case.`),
    },
    general: {
        subjectPrefix: 'Re: Your Support Request',
        openingCategory: 'professional',
        bodyTemplate: (p) =>
            (p.resolutionSteps?.length
                ? `${p.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : `We have received your message and will respond with a resolution within ${p.followUpSla ?? '1 business day'}.`),
    },
};

// ---------------------------------------------------------------------------
// Subject builder
// ---------------------------------------------------------------------------

function buildSubject(params: ComposeReplyParams): string {
    const base = PLAYBOOKS[params.issueCategory].subjectPrefix;
    return params.ticketId ? `${base} [#${params.ticketId}]` : base;
}

// ---------------------------------------------------------------------------
// Opening picker (deterministic — no RNG so output is testable)
// ---------------------------------------------------------------------------

function pickOpening(tone: ResponseTone, seed: number): string {
    const options = OPENING_BY_TONE[tone];
    return options[seed % options.length]!;
}

// ---------------------------------------------------------------------------
// Main composer
// ---------------------------------------------------------------------------

export function composeReply(params: ComposeReplyParams): ComposedReply {
    const tone: ResponseTone = params.tone ?? 'professional';
    const playbook = PLAYBOOKS[params.issueCategory];
    const openingTone = params.tone ?? playbook.openingCategory;

    const seed = (params.ticketId ?? params.customerName ?? '').length;
    const salutation = params.customerName ? `Dear ${params.customerName},` : 'Dear Valued Customer,';
    const opening = pickOpening(openingTone, seed);
    const body = playbook.bodyTemplate(params);
    const closing = CLOSING_BY_TONE[tone];
    const signature = [
        params.agentName ? `Warm regards,\n${params.agentName}` : 'Warm regards,\nCustomer Support Team',
        params.companyName ? params.companyName : undefined,
    ].filter(Boolean).join('\n');

    const fullBody = [salutation, '', opening, '', body, '', closing, '', signature].join('\n');

    const containsCommitment =
        (params.resolutionSteps?.length ?? 0) > 0 ||
        fullBody.toLowerCase().includes('will') ||
        fullBody.toLowerCase().includes('within');

    return {
        subject: buildSubject(params),
        body: fullBody,
        tone,
        category: params.issueCategory,
        containsCommitment,
    };
}

// ---------------------------------------------------------------------------
// Issue-category classifier (keyword heuristic — no LLM, no network)
// ---------------------------------------------------------------------------

const CATEGORY_SIGNALS: Array<{ keywords: string[]; category: IssueCategory }> = [
    { keywords: ['refund', 'return', 'money back', 'charge back', 'chargeback'], category: 'refund' },
    { keywords: ['invoice', 'billing', 'payment', 'charge', 'overcharged', 'double charged'], category: 'billing' },
    { keywords: ['tracking', 'shipment', 'delivery', 'order status', 'not received', 'lost package'], category: 'shipping' },
    { keywords: ['password', 'login', 'cannot access', "can't log in", 'locked out', 'account blocked', '2fa', 'two factor'], category: 'account_access' },
    { keywords: ['bug', 'error', 'not working', 'broken', 'crash', 'glitch', 'issue with', 'problem with'], category: 'technical' },
    { keywords: ['cancel', 'cancellation', 'unsubscribe', 'close account', 'delete account'], category: 'cancellation' },
    { keywords: ['upgrade', 'downgrade', 'plan change', 'subscription', 'tier'], category: 'subscription' },
    { keywords: ['gdpr', 'privacy', 'delete my data', 'data request', 'personal data', 'right to be forgotten'], category: 'data_privacy' },
    { keywords: ['feature', 'suggestion', 'would love', 'wish', 'could you add', 'request'], category: 'feature_request' },
    { keywords: ['onboarding', 'getting started', 'setup', 'how do i', 'first time', 'new account'], category: 'onboarding' },
    { keywords: ['unhappy', 'disappointed', 'terrible', 'worst', 'complaint', 'unacceptable', 'awful'], category: 'complaint' },
    { keywords: ['price', 'pricing', 'cost', 'how much', 'plan', 'feature included', 'what does'], category: 'product_info' },
];

export function classifyIssueCategory(subject: string, body: string): IssueCategory {
    const text = `${subject} ${body}`.toLowerCase();
    for (const { keywords, category } of CATEGORY_SIGNALS) {
        if (keywords.some((k) => text.includes(k))) return category;
    }
    return 'general';
}
