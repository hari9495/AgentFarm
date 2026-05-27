/**
 * Dashboard Requests
 *
 * Structured request builders for surfacing gaps to the customer dashboard.
 * When the agent needs human input, API credentials, document uploads, or
 * data it cannot obtain autonomously, it emits a DashboardRequest that the
 * platform routes to the appropriate dashboard panel for the customer to action.
 *
 * Three categories of requests:
 *   1. API / Connector Config — category-first: customer picks a CATEGORY
 *      ("Applicant Tracking"), then a PROVIDER within it ("Greenhouse").
 *      This is intentionally generic — we cannot predict which tool the customer
 *      uses, and forcing a specific tool leads to dead-ends.
 *   2. Document Upload — files the agent needs (resumes, templates, certs)
 *   3. Data Collection — structured answers only the customer can provide
 *
 * Pure logic — no external API calls.
 */

import type { ConnectorCategory, ConnectorCredentialField, ConnectorProvider } from '../../platform/connector-registry.js';
import { getCategory, buildConnectorSetupPayload } from '../../platform/connector-registry.js';

// ---------------------------------------------------------------------------
// Re-export connector types needed by callers
// ---------------------------------------------------------------------------

export type { ConnectorCategory, ConnectorCredentialField };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardRequestCategory =
    | 'api_config'
    | 'document_upload'
    | 'credential_verify'
    | 'data_collection'
    | 'human_approval';

export type DashboardRequestPriority = 'blocking' | 'high' | 'medium' | 'low';

export type DashboardRequestStatus = 'pending' | 'actioned' | 'skipped';

/**
 * Connector / API configuration request.
 *
 * Category-first design: the agent requests a CATEGORY of integration
 * (e.g. 'applicant_tracking'), not a specific tool. The customer selects
 * which provider they use from the picker in the dashboard.
 *
 * When the customer has already selected a provider (selectedProviderId is set),
 * `requiredFields` contains that provider's specific credential fields.
 * When no provider is pre-selected, `requiredFields` is empty — the dashboard
 * renders a provider picker first.
 */
export interface ApiConfigRequest {
    category: 'api_config';
    /** Which connector category is needed (e.g. 'applicant_tracking'). */
    connectorCategory: ConnectorCategory;
    /** Human-readable category label (e.g. "Applicant Tracking System"). */
    categoryLabel: string;
    /** What this category enables the agent to do. */
    categoryDescription: string;
    /** All providers available in this category, for the picker UI. */
    availableProviders: Array<{
        id: string;
        name: string;
        tagline: string;
        enterpriseOnly?: boolean;
        freeTrialAvailable?: boolean;
    }>;
    /** Set when a specific provider has already been chosen. */
    selectedProviderId?: string;
    /** Display name for the selected provider. */
    selectedProviderName?: string;
    /**
     * Credential fields to display when a provider is selected.
     * Empty when no provider is pre-selected (picker mode).
     */
    requiredFields: ConnectorCredentialField[];
    /** If false, the agent cannot proceed without this connector. */
    optional: boolean;
    /** Root docs URL for the selected provider (if known). */
    docsUrl?: string;
    dashboardSection: 'api_settings';
}

export interface DocumentUploadRequest {
    category: 'document_upload';
    documentType: string;
    label: string;
    description: string;
    acceptedFormats: string[];
    maxSizeMb: number;
    required: boolean;
    guidance?: string;
    dashboardSection: 'document_library';
}

export interface CredentialVerifyRequest {
    category: 'credential_verify';
    credentialId: string;
    credentialName: string;
    candidateName: string;
    verificationMethod: 'document_upload' | 'third_party_check' | 'attestation';
    instructions: string;
    urgency: DashboardRequestPriority;
    dashboardSection: 'candidate_profile';
}

export interface DataCollectionRequest {
    category: 'data_collection';
    topic: string;
    label: string;
    description: string;
    fields: DataCollectionField[];
    urgency: DashboardRequestPriority;
    dashboardSection: 'recruiter_settings' | 'job_settings' | 'company_settings';
}

export interface DataCollectionField {
    fieldName: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'select' | 'multi_select' | 'date' | 'textarea';
    options?: string[];      // for select / multi_select
    placeholder?: string;
    required: boolean;
    hint?: string;
}

export interface HumanApprovalRequest {
    category: 'human_approval';
    actionType: string;
    summary: string;
    details: string;
    riskLevel: 'high' | 'medium' | 'low';
    requiredApprover?: string;
    urgency: DashboardRequestPriority;
    expiresAt?: string;       // ISO date
    dashboardSection: 'approval_queue';
}

export type DashboardRequest =
    | ApiConfigRequest
    | DocumentUploadRequest
    | CredentialVerifyRequest
    | DataCollectionRequest
    | HumanApprovalRequest;

export interface DashboardRequestResult {
    ok: boolean;
    requestId: string;
    requests: DashboardRequest[];
    summary: string;
    blockingCount: number;
    highCount: number;
    message: string;
    agentNextStep: string;
}

// ---------------------------------------------------------------------------
// Connector category request builders (replaces API_CONFIG_PRESETS)
// ---------------------------------------------------------------------------

/**
 * Build a category-level connector request (picker mode).
 *
 * The customer sees the category label + description, then picks whichever
 * provider they use. No specific tool is assumed.
 *
 * Returns null if the category is not found in the registry.
 */
export function buildConnectorCategoryRequest(
    connectorCategory: ConnectorCategory,
    optional = true,
): ApiConfigRequest | null {
    const cat = getCategory(connectorCategory);
    if (!cat) return null;
    return {
        category: 'api_config',
        connectorCategory,
        categoryLabel: cat.label,
        categoryDescription: cat.description,
        availableProviders: cat.providers.map(p => ({
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            enterpriseOnly: p.enterpriseOnly,
            freeTrialAvailable: p.freeTrialAvailable,
        })),
        requiredFields: [],   // picker mode — no fields until provider is chosen
        optional,
        dashboardSection: 'api_settings',
    };
}

/**
 * Build a provider-specific connector request (credential entry mode).
 *
 * Used when the customer has already selected a provider and we need them
 * to fill in the specific credential fields for that tool.
 *
 * Returns null if the category or provider is not found in the registry.
 */
export function buildConnectorSetupRequest(
    connectorCategory: ConnectorCategory,
    providerId: string,
    optional = true,
): ApiConfigRequest | null {
    const payload = buildConnectorSetupPayload(connectorCategory, providerId);
    if (!payload?.selectedProvider) return null;
    const provider: ConnectorProvider = payload.selectedProvider;
    return {
        category: 'api_config',
        connectorCategory,
        categoryLabel: payload.category.label,
        categoryDescription: payload.category.description,
        availableProviders: payload.allProviders.map(p => ({
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            enterpriseOnly: p.enterpriseOnly,
            freeTrialAvailable: p.freeTrialAvailable,
        })),
        selectedProviderId: provider.id,
        selectedProviderName: provider.name,
        requiredFields: provider.credentials,
        optional,
        docsUrl: provider.docsUrl,
        dashboardSection: 'api_settings',
    };
}

// ---------------------------------------------------------------------------
// Document upload presets — 10 document types
// ---------------------------------------------------------------------------

export const DOCUMENT_PRESETS: Record<string, DocumentUploadRequest> = {

    candidate_resume: {
        category: 'document_upload',
        documentType: 'candidate_resume',
        label: 'Candidate Resume / CV',
        description: 'Upload a candidate\'s resume or CV for the agent to screen against the job description.',
        acceptedFormats: ['pdf', 'docx', 'doc', 'txt'],
        maxSizeMb: 10,
        required: true,
        guidance: 'Ensure the document is not password-protected. PDFs are preferred for accurate parsing.',
        dashboardSection: 'document_library',
    },

    offer_letter_template: {
        category: 'document_upload',
        documentType: 'offer_letter_template',
        label: 'Offer Letter Template',
        description: 'Upload your company\'s standard offer letter template. The agent will merge candidate-specific details into it.',
        acceptedFormats: ['docx', 'pdf'],
        maxSizeMb: 5,
        required: false,
        guidance: 'Include placeholder text such as {{CANDIDATE_NAME}}, {{JOB_TITLE}}, {{START_DATE}}, {{SALARY}} for merge fields.',
        dashboardSection: 'document_library',
    },

    company_letterhead: {
        category: 'document_upload',
        documentType: 'company_letterhead',
        label: 'Company Letterhead',
        description: 'Upload your company letterhead for formal correspondence including offer letters and rejection notices.',
        acceptedFormats: ['pdf', 'docx', 'png', 'jpg'],
        maxSizeMb: 5,
        required: false,
        dashboardSection: 'document_library',
    },

    credential_certificate: {
        category: 'document_upload',
        documentType: 'credential_certificate',
        label: 'Candidate Credential / Certificate',
        description: 'Upload a candidate\'s professional license or certification document for verification.',
        acceptedFormats: ['pdf', 'jpg', 'png'],
        maxSizeMb: 10,
        required: false,
        guidance: 'Ensure the document shows the credential name, issue date, and expiry date if applicable.',
        dashboardSection: 'document_library',
    },

    bgc_authorisation: {
        category: 'document_upload',
        documentType: 'bgc_authorisation',
        label: 'Background Check Authorisation Form',
        description: 'FCRA-required signed authorisation from the candidate before initiating a background check.',
        acceptedFormats: ['pdf', 'docx'],
        maxSizeMb: 5,
        required: true,
        guidance: 'The candidate must sign this form before any background check can be initiated. Do not proceed without it.',
        dashboardSection: 'document_library',
    },

    reference_responses: {
        category: 'document_upload',
        documentType: 'reference_responses',
        label: 'Reference Check Responses',
        description: 'Upload completed reference questionnaire responses for the agent to analyse and summarise.',
        acceptedFormats: ['pdf', 'docx', 'txt'],
        maxSizeMb: 10,
        required: false,
        dashboardSection: 'document_library',
    },

    job_description_custom: {
        category: 'document_upload',
        documentType: 'job_description_custom',
        label: 'Custom Job Description',
        description: 'Upload an existing job description if you want the agent to use it as the basis for posting and screening.',
        acceptedFormats: ['pdf', 'docx', 'txt'],
        maxSizeMb: 5,
        required: false,
        dashboardSection: 'document_library',
    },

    compliance_template: {
        category: 'document_upload',
        documentType: 'compliance_template',
        label: 'Compliance / Legal Template',
        description: 'Upload regulatory compliance documents (e.g., EEO statements, GDPR privacy notice, right-to-work forms).',
        acceptedFormats: ['pdf', 'docx'],
        maxSizeMb: 5,
        required: false,
        dashboardSection: 'document_library',
    },

    benefits_guide: {
        category: 'document_upload',
        documentType: 'benefits_guide',
        label: 'Employee Benefits Guide',
        description: 'Upload your benefits guide so the agent can reference accurate benefits in offer letters and candidate conversations.',
        acceptedFormats: ['pdf', 'docx'],
        maxSizeMb: 20,
        required: false,
        dashboardSection: 'document_library',
    },

    interview_rubric: {
        category: 'document_upload',
        documentType: 'interview_rubric',
        label: 'Interview Scoring Rubric',
        description: 'Upload your standardised interview rubric so the agent can align feedback collection to your evaluation framework.',
        acceptedFormats: ['pdf', 'docx', 'xlsx'],
        maxSizeMb: 10,
        required: false,
        dashboardSection: 'document_library',
    },
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

let _requestCounter = 0;
function nextRequestId(): string {
    return `dreq-${Date.now()}-${++_requestCounter}`;
}

/** Build a request for a document upload. */
export function buildDocumentUploadRequest(documentType: string): DocumentUploadRequest | null {
    return DOCUMENT_PRESETS[documentType] ?? null;
}

/** Build a credential verification request for a specific candidate. */
export function buildCredentialVerifyRequest(
    credentialId: string,
    credentialName: string,
    candidateName: string,
    urgency: DashboardRequestPriority = 'high',
): CredentialVerifyRequest {
    return {
        category: 'credential_verify',
        credentialId,
        credentialName,
        candidateName,
        verificationMethod: 'document_upload',
        instructions: `Please upload or confirm the ${credentialName} credential for ${candidateName}. ` +
            `This credential is required for this role and must be verified before the candidate can advance. ` +
            `You may upload the certificate document or confirm via a third-party licensing board check.`,
        urgency,
        dashboardSection: 'candidate_profile',
    };
}

/** Build a structured data collection request. */
export function buildDataCollectionRequest(
    topic: string,
    label: string,
    description: string,
    fields: DataCollectionField[],
    urgency: DashboardRequestPriority = 'medium',
    dashboardSection: DataCollectionRequest['dashboardSection'] = 'recruiter_settings',
): DataCollectionRequest {
    return {
        category: 'data_collection',
        topic,
        label,
        description,
        fields,
        urgency,
        dashboardSection,
    };
}

/** Build a human approval request. */
export function buildHumanApprovalRequest(
    actionType: string,
    summary: string,
    details: string,
    riskLevel: HumanApprovalRequest['riskLevel'] = 'high',
    requiredApprover?: string,
    urgency: DashboardRequestPriority = 'high',
    expiresAt?: string,
): HumanApprovalRequest {
    return {
        category: 'human_approval',
        actionType,
        summary,
        details,
        riskLevel,
        requiredApprover,
        urgency,
        expiresAt,
        dashboardSection: 'approval_queue',
    };
}

/** Package up a set of requests into a DashboardRequestResult. */
export function buildDashboardRequestResult(
    requests: DashboardRequest[],
    agentNextStep: string,
): DashboardRequestResult {
    const blockingCount = requests.filter(r =>
        (r as ApiConfigRequest).optional === false ||
        (r as DocumentUploadRequest).required === true ||
        (r as CredentialVerifyRequest).urgency === 'blocking' ||
        (r as DataCollectionRequest).urgency === 'blocking' ||
        (r as HumanApprovalRequest).riskLevel === 'high',
    ).length;

    const highCount = requests.filter(r =>
        (r as CredentialVerifyRequest).urgency === 'high' ||
        (r as DataCollectionRequest).urgency === 'high',
    ).length;

    const categoryLabels = requests.map(r => {
        switch (r.category) {
            case 'api_config': {
                const req = r as ApiConfigRequest;
                return `API: ${req.selectedProviderName ?? req.categoryLabel}`;
            }
            case 'document_upload':
                return `Doc: ${(r as DocumentUploadRequest).label}`;
            case 'credential_verify':
                return `Credential: ${(r as CredentialVerifyRequest).credentialName}`;
            case 'data_collection':
                return `Data: ${(r as DataCollectionRequest).label}`;
            case 'human_approval':
                return `Approval: ${(r as HumanApprovalRequest).summary}`;
        }
    });

    return {
        ok: true,
        requestId: nextRequestId(),
        requests,
        summary: `${requests.length} dashboard request(s) generated: ${categoryLabels.join('; ')}`,
        blockingCount,
        highCount,
        message: blockingCount > 0
            ? `⚠️ ${blockingCount} item(s) require your attention before the agent can continue. Please visit the dashboard.`
            : `${requests.length} item(s) sent to dashboard for your review.`,
        agentNextStep,
    };
}

// ---------------------------------------------------------------------------
// Request bundles — common multi-category setups
// ---------------------------------------------------------------------------

/**
 * Requests needed to enable live candidate sourcing.
 * Category-first: customer picks their preferred sourcing tool (Apollo, LinkedIn,
 * Hunter, Doximity, Indeed) rather than having a tool assumed for them.
 */
export function buildSourcingSetupRequests(): DashboardRequestResult {
    const req = buildConnectorCategoryRequest('candidate_sourcing', false);
    const requests: DashboardRequest[] = req ? [req] : [];
    return buildDashboardRequestResult(
        requests,
        'Once a candidate sourcing connector is configured, re-run workspace_rec_source_candidates for live results.',
    );
}

/**
 * Requests needed to connect an ATS.
 * Customer picks their ATS (Greenhouse, Lever, Ashby, Workday, iCIMS, Bullhorn).
 */
export function buildAtsSetupRequests(): DashboardRequestResult {
    const req = buildConnectorCategoryRequest('applicant_tracking', false);
    const requests: DashboardRequest[] = req ? [req] : [];
    return buildDashboardRequestResult(
        requests,
        'Configure your ATS to enable automated pipeline management and candidate tracking.',
    );
}

/**
 * Full recruiter setup — all recommended connector categories + key documents.
 *
 * Emits one request per capability category. The customer picks which specific
 * tool they use within each category — no tools are pre-assumed.
 */
export function buildFullRecruiterSetupRequests(): DashboardRequestResult {
    const categoryRequests: ConnectorCategory[] = [
        'candidate_sourcing',      // Apollo / LinkedIn / Hunter / Doximity / Indeed
        'applicant_tracking',      // Greenhouse / Lever / Ashby / Workday / iCIMS / Bullhorn
        'interview_scheduling',    // Calendly / Google Calendar / Outlook / Cal.com
        'e_signature',             // DocuSign / Zoho Sign / Adobe Sign / HelloSign
        'background_check',        // Checkr / Sterling / HireRight
        'messaging',               // Slack / Microsoft Teams
        'email',                   // Google Workspace / Microsoft 365
    ];

    const connectorRequests: DashboardRequest[] = categoryRequests
        .map(cat => buildConnectorCategoryRequest(cat, cat !== 'candidate_sourcing'))
        .filter((r): r is ApiConfigRequest => r !== null);

    const docRequests: DashboardRequest[] = [
        DOCUMENT_PRESETS['offer_letter_template']!,
        DOCUMENT_PRESETS['company_letterhead']!,
        DOCUMENT_PRESETS['benefits_guide']!,
        DOCUMENT_PRESETS['interview_rubric']!,
    ];

    const dataRequest = buildDataCollectionRequest(
        'company_defaults',
        'Company Recruiting Defaults',
        'Core defaults that allow the agent to work autonomously without asking for them each time.',
        [
            { fieldName: 'defaultCurrency', label: 'Default Currency', type: 'select', options: ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'SGD', 'INR'], required: true, hint: 'Used for salary benchmarks and offer letters.' },
            { fieldName: 'defaultCountry', label: 'Primary Hiring Country', type: 'select', options: ['us', 'uk', 'canada', 'australia', 'germany', 'france', 'netherlands', 'singapore', 'india', 'other'], required: true },
            { fieldName: 'defaultTimezone', label: 'Time Zone', type: 'text', placeholder: 'e.g. America/New_York', required: false },
            { fieldName: 'hiringManagerEmail', label: 'Default Hiring Manager Email', type: 'text', placeholder: 'manager@company.com', required: false },
            { fieldName: 'hrSignatoryName', label: 'HR Signatory Name', type: 'text', placeholder: 'Full name for offer letters', required: false },
            { fieldName: 'hrSignatoryTitle', label: 'HR Signatory Title', type: 'text', placeholder: 'e.g. Head of People & Talent', required: false },
        ],
        'high',
        'company_settings',
    );

    const requests: DashboardRequest[] = [...connectorRequests, ...docRequests, dataRequest];
    return buildDashboardRequestResult(
        requests,
        'Complete dashboard setup to enable the full recruiter agent workflow. The agent will operate in heuristic/advisory mode until connectors are configured.',
    );
}

/** Request the customer to upload a candidate resume when none was provided. */
export function buildResumeUploadRequest(candidateName?: string): DashboardRequestResult {
    const doc: DocumentUploadRequest = {
        ...DOCUMENT_PRESETS['candidate_resume']!,
        description: candidateName
            ? `Upload the resume for ${candidateName} so the agent can screen them against the job description.`
            : 'Upload the candidate\'s resume or CV for screening.',
    };
    return buildDashboardRequestResult(
        [doc],
        'Once the resume is uploaded, re-run workspace_rec_screen_resume with the document path.',
    );
}

/** Request FCRA authorisation before background check initiation. */
export function buildBgcAuthorisationRequest(candidateName: string): DashboardRequestResult {
    return buildDashboardRequestResult(
        [
            {
                ...DOCUMENT_PRESETS['bgc_authorisation']!,
                description: `FCRA-required: obtain a signed background check authorisation from ${candidateName} before proceeding. Do NOT initiate the background check without this document.`,
            },
        ],
        `Once the signed authorisation for ${candidateName} is uploaded, re-run workspace_rec_check_bgc.`,
    );
}

/** Request credential documents for a list of required credentials. */
export function buildCredentialVerificationRequests(
    candidateName: string,
    missingCredentials: Array<{ id: string; name: string }>,
): DashboardRequestResult {
    const requests: DashboardRequest[] = missingCredentials.map(c =>
        buildCredentialVerifyRequest(c.id, c.name, candidateName, 'high'),
    );
    return buildDashboardRequestResult(
        requests,
        `Obtain credential documents for ${candidateName} and upload to the candidate profile. Re-run workspace_rec_screen_resume or workspace_rec_validate_credentials once received.`,
    );
}
