/**
 * Dashboard Requests
 *
 * Structured request builders for surfacing gaps to the customer dashboard.
 * When the agent needs human input, API credentials, document uploads, or
 * data it cannot obtain autonomously, it emits a DashboardRequest that the
 * platform routes to the appropriate dashboard panel for the customer to action.
 *
 * Three categories of requests:
 *   1. API Config  — service credentials the agent needs to call live APIs
 *   2. Document Upload — files the agent needs (resumes, templates, certs)
 *   3. Data Collection — structured answers only the customer can provide
 *
 * Pure logic — no external API calls.
 */

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

export interface ApiConfigRequest {
    category: 'api_config';
    serviceId: string;
    serviceName: string;
    description: string;
    requiredFields: ApiConfigField[];
    optional: boolean;
    docsUrl?: string;
    dashboardSection: 'api_settings';
}

export interface ApiConfigField {
    fieldName: string;
    label: string;
    type: 'api_key' | 'access_token' | 'client_id' | 'client_secret' | 'webhook_url' | 'base_url';
    description: string;
    placeholder?: string;
    isSensitive: boolean;
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
// API Config presets — 16 services
// ---------------------------------------------------------------------------

export const API_CONFIG_PRESETS: Record<string, ApiConfigRequest> = {

    linkedin: {
        category: 'api_config',
        serviceId: 'linkedin',
        serviceName: 'LinkedIn',
        description: 'Enables live candidate search, InMail outreach, and profile enrichment via the LinkedIn Recruiter or Talent Hub API.',
        requiredFields: [
            { fieldName: 'linkedInAccessToken', label: 'LinkedIn Access Token', type: 'access_token', description: 'OAuth 2.0 access token from your LinkedIn Developer App.', placeholder: 'AQV...', isSensitive: true },
            { fieldName: 'linkedInClientId', label: 'Client ID', type: 'client_id', description: 'Your LinkedIn Developer Application Client ID.', isSensitive: false },
        ],
        optional: false,
        docsUrl: 'https://developer.linkedin.com/docs/guide/v2/authentication',
        dashboardSection: 'api_settings',
    },

    apollo: {
        category: 'api_config',
        serviceId: 'apollo',
        serviceName: 'Apollo.io',
        description: 'Unlocks live people search for candidate sourcing and contact enrichment (email, phone) across 275M+ professional profiles.',
        requiredFields: [
            { fieldName: 'apolloApiKey', label: 'Apollo API Key', type: 'api_key', description: 'Found in Apollo Settings → Integrations → API Keys.', placeholder: 'ap_...', isSensitive: true },
        ],
        optional: false,
        docsUrl: 'https://apolloio.github.io/apollo-api-docs/',
        dashboardSection: 'api_settings',
    },

    greenhouse: {
        category: 'api_config',
        serviceId: 'greenhouse',
        serviceName: 'Greenhouse ATS',
        description: 'Connects the agent to your Greenhouse account to read/write jobs, applications, and pipeline stages directly.',
        requiredFields: [
            { fieldName: 'greenhouseApiKey', label: 'Greenhouse Harvest API Key', type: 'api_key', description: 'Generated in Greenhouse → Configure → Dev Center → API Credential Management.', isSensitive: true },
            { fieldName: 'greenhouseOrgId', label: 'Organisation ID', type: 'base_url', description: 'Your Greenhouse organisation subdomain (e.g., "acme").', isSensitive: false },
        ],
        optional: true,
        docsUrl: 'https://developers.greenhouse.io/harvest.html',
        dashboardSection: 'api_settings',
    },

    lever: {
        category: 'api_config',
        serviceId: 'lever',
        serviceName: 'Lever ATS',
        description: 'Allows the agent to manage requisitions, candidates, and feedback in your Lever account.',
        requiredFields: [
            { fieldName: 'leverApiKey', label: 'Lever API Key', type: 'api_key', description: 'Found in Lever → Settings → Integrations → API Credentials.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://hire.lever.co/developer/documentation',
        dashboardSection: 'api_settings',
    },

    workday: {
        category: 'api_config',
        serviceId: 'workday',
        serviceName: 'Workday HCM',
        description: 'Integrates with Workday Recruiting to manage requisitions, headcount approvals, and offer workflows.',
        requiredFields: [
            { fieldName: 'workdayTenantUrl', label: 'Tenant URL', type: 'base_url', description: 'Your Workday tenant URL (e.g., https://wd5.myworkday.com/your_company).', isSensitive: false },
            { fieldName: 'workdayClientId', label: 'Client ID', type: 'client_id', description: 'OAuth 2.0 Client ID from Workday API Client setup.', isSensitive: false },
            { fieldName: 'workdayClientSecret', label: 'Client Secret', type: 'client_secret', description: 'OAuth 2.0 Client Secret.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://community.workday.com/sites/default/files/file-hosting/restapi/',
        dashboardSection: 'api_settings',
    },

    ashby: {
        category: 'api_config',
        serviceId: 'ashby',
        serviceName: 'Ashby ATS',
        description: 'Connects to Ashby to manage jobs, applications, and analytics.',
        requiredFields: [
            { fieldName: 'ashbyApiKey', label: 'Ashby API Key', type: 'api_key', description: 'Generated in Ashby → Settings → Integrations → API Keys.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://developers.ashbyhq.com/',
        dashboardSection: 'api_settings',
    },

    icims: {
        category: 'api_config',
        serviceId: 'icims',
        serviceName: 'iCIMS Talent Cloud',
        description: 'Integrates with iCIMS for enterprise ATS pipeline management.',
        requiredFields: [
            { fieldName: 'icimsApiKey', label: 'iCIMS API Key', type: 'api_key', description: 'iCIMS REST API Key from your platform admin.', isSensitive: true },
            { fieldName: 'icimsCustomerId', label: 'Customer ID', type: 'client_id', description: 'Your iCIMS Customer ID (numeric).', isSensitive: false },
        ],
        optional: true,
        docsUrl: 'https://developer.icims.com/',
        dashboardSection: 'api_settings',
    },

    hunter: {
        category: 'api_config',
        serviceId: 'hunter',
        serviceName: 'Hunter.io',
        description: 'Finds and verifies professional email addresses for candidate outreach.',
        requiredFields: [
            { fieldName: 'hunterApiKey', label: 'Hunter API Key', type: 'api_key', description: 'Found in Hunter.io → Settings → API.', placeholder: 'hunter_...', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://hunter.io/api-documentation',
        dashboardSection: 'api_settings',
    },

    calendly: {
        category: 'api_config',
        serviceId: 'calendly',
        serviceName: 'Calendly',
        description: 'Automates interview scheduling by creating and managing Calendly links for candidates.',
        requiredFields: [
            { fieldName: 'calendlyAccessToken', label: 'Calendly Personal Access Token', type: 'access_token', description: 'Generated in Calendly → Integrations → API & Webhooks.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://developer.calendly.com/',
        dashboardSection: 'api_settings',
    },

    docusign: {
        category: 'api_config',
        serviceId: 'docusign',
        serviceName: 'DocuSign',
        description: 'Sends offer letters and NDAs for e-signature via DocuSign.',
        requiredFields: [
            { fieldName: 'docusignIntegrationKey', label: 'DocuSign Integration Key', type: 'client_id', description: 'OAuth 2.0 integration key from DocuSign Developer Console.', isSensitive: false },
            { fieldName: 'docusignAccountId', label: 'Account ID', type: 'client_id', description: 'Your DocuSign Account ID (GUID format).', isSensitive: false },
            { fieldName: 'docusignPrivateKey', label: 'RSA Private Key', type: 'client_secret', description: 'RSA private key for JWT authentication.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://developers.docusign.com/',
        dashboardSection: 'api_settings',
    },

    sterling: {
        category: 'api_config',
        serviceId: 'sterling',
        serviceName: 'Sterling Background Checks',
        description: 'Initiates FCRA-compliant background checks via Sterling Talent Solutions.',
        requiredFields: [
            { fieldName: 'sterlingApiKey', label: 'Sterling API Key', type: 'api_key', description: 'API key from Sterling developer portal.', isSensitive: true },
            { fieldName: 'sterlingAccountId', label: 'Account ID', type: 'client_id', description: 'Your Sterling account identifier.', isSensitive: false },
        ],
        optional: true,
        docsUrl: 'https://developer.sterlingcheck.com/',
        dashboardSection: 'api_settings',
    },

    checkr: {
        category: 'api_config',
        serviceId: 'checkr',
        serviceName: 'Checkr Background Checks',
        description: 'Initiates FCRA-compliant background checks via Checkr.',
        requiredFields: [
            { fieldName: 'checkrApiKey', label: 'Checkr API Key', type: 'api_key', description: 'Found in Checkr Dashboard → Developer → API Keys.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://docs.checkr.com/',
        dashboardSection: 'api_settings',
    },

    slack: {
        category: 'api_config',
        serviceId: 'slack',
        serviceName: 'Slack',
        description: 'Posts hiring updates, interview reminders, and approval requests to your Slack workspace.',
        requiredFields: [
            { fieldName: 'slackBotToken', label: 'Slack Bot Token', type: 'access_token', description: 'xoxb- prefixed Bot User OAuth Token from your Slack App settings.', placeholder: 'xoxb-...', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://api.slack.com/authentication/token-types#bot',
        dashboardSection: 'api_settings',
    },

    google_calendar: {
        category: 'api_config',
        serviceId: 'google_calendar',
        serviceName: 'Google Calendar',
        description: 'Schedules interviews and creates calendar invites for candidates and interviewers.',
        requiredFields: [
            { fieldName: 'googleCalendarClientId', label: 'Google OAuth Client ID', type: 'client_id', description: 'From Google Cloud Console → APIs & Services → Credentials.', isSensitive: false },
            { fieldName: 'googleCalendarClientSecret', label: 'OAuth Client Secret', type: 'client_secret', description: 'Paired secret for the OAuth client.', isSensitive: true },
            { fieldName: 'googleCalendarRefreshToken', label: 'Refresh Token', type: 'access_token', description: 'Long-lived refresh token obtained via OAuth flow.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://developers.google.com/calendar/api/guides/auth',
        dashboardSection: 'api_settings',
    },

    doximity: {
        category: 'api_config',
        serviceId: 'doximity',
        serviceName: 'Doximity',
        description: 'Sources and outreaches to physicians, NPs, PAs, and allied health professionals via Doximity Talent Finder.',
        requiredFields: [
            { fieldName: 'doximityApiKey', label: 'Doximity API Key', type: 'api_key', description: 'From your Doximity Talent Finder account settings.', isSensitive: true },
        ],
        optional: true,
        docsUrl: 'https://www.doximity.com/talent',
        dashboardSection: 'api_settings',
    },

    bullhorn: {
        category: 'api_config',
        serviceId: 'bullhorn',
        serviceName: 'Bullhorn ATS/CRM',
        description: 'Staffing and recruitment CRM — manages candidates, placements, and client relationships.',
        requiredFields: [
            { fieldName: 'bullhornClientId', label: 'Bullhorn Client ID', type: 'client_id', description: 'OAuth Client ID from Bullhorn Developer portal.', isSensitive: false },
            { fieldName: 'bullhornClientSecret', label: 'Client Secret', type: 'client_secret', description: 'OAuth Client Secret.', isSensitive: true },
            { fieldName: 'bullhornUsername', label: 'API Username', type: 'client_id', description: 'Your Bullhorn API username.', isSensitive: false },
        ],
        optional: true,
        docsUrl: 'https://bullhorn.github.io/rest-api-docs/',
        dashboardSection: 'api_settings',
    },
};

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

/** Build a request for an API service credential. */
export function buildApiConfigRequest(serviceId: string): ApiConfigRequest | null {
    return API_CONFIG_PRESETS[serviceId] ?? null;
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
            case 'api_config': return `API: ${(r as ApiConfigRequest).serviceName}`;
            case 'document_upload': return `Doc: ${(r as DocumentUploadRequest).label}`;
            case 'credential_verify': return `Credential: ${(r as CredentialVerifyRequest).credentialName}`;
            case 'data_collection': return `Data: ${(r as DataCollectionRequest).label}`;
            case 'human_approval': return `Approval: ${(r as HumanApprovalRequest).summary}`;
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
// Request bundles — common multi-service setups
// ---------------------------------------------------------------------------

/** Requests needed to enable live candidate sourcing. */
export function buildSourcingSetupRequests(): DashboardRequestResult {
    const requests: DashboardRequest[] = [
        API_CONFIG_PRESETS['apollo']!,
        API_CONFIG_PRESETS['linkedin']!,
        API_CONFIG_PRESETS['hunter']!,
    ];
    return buildDashboardRequestResult(
        requests,
        'Once Apollo and/or LinkedIn credentials are configured, re-run workspace_rec_source_candidates for live results.',
    );
}

/** Requests needed to connect an ATS. */
export function buildAtsSetupRequests(): DashboardRequestResult {
    const requests: DashboardRequest[] = [
        API_CONFIG_PRESETS['greenhouse']!,
        API_CONFIG_PRESETS['lever']!,
        API_CONFIG_PRESETS['ashby']!,
        API_CONFIG_PRESETS['workday']!,
        API_CONFIG_PRESETS['icims']!,
    ];
    return buildDashboardRequestResult(
        requests,
        'Configure at least one ATS to enable automated pipeline management and candidate tracking.',
    );
}

/** Full recruiter setup — all recommended APIs + key documents. */
export function buildFullRecruiterSetupRequests(): DashboardRequestResult {
    const requests: DashboardRequest[] = [
        // Core sourcing
        API_CONFIG_PRESETS['apollo']!,
        API_CONFIG_PRESETS['linkedin']!,
        API_CONFIG_PRESETS['hunter']!,
        // ATS (pick one — we surface all options)
        API_CONFIG_PRESETS['greenhouse']!,
        API_CONFIG_PRESETS['lever']!,
        // Scheduling & signing
        API_CONFIG_PRESETS['calendly']!,
        API_CONFIG_PRESETS['docusign']!,
        // Background checks
        API_CONFIG_PRESETS['checkr']!,
        // Comms
        API_CONFIG_PRESETS['slack']!,
        // Documents
        DOCUMENT_PRESETS['offer_letter_template']!,
        DOCUMENT_PRESETS['company_letterhead']!,
        DOCUMENT_PRESETS['benefits_guide']!,
        DOCUMENT_PRESETS['interview_rubric']!,
        // Company settings
        buildDataCollectionRequest(
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
        ),
    ];
    return buildDashboardRequestResult(
        requests,
        'Complete dashboard setup to enable the full recruiter agent workflow. The agent will operate in heuristic/advisory mode until credentials are configured.',
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
