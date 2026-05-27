/**
 * Connector Registry — Platform Level
 *
 * Generic, agent-agnostic registry of integration categories and their
 * available providers. All agents (recruiter, sales, content, developer, etc.)
 * reference this registry instead of hard-coding tool-specific configurations.
 *
 * Design principle:
 *   - Customers pick a CATEGORY first ("I need an ATS"), then a PROVIDER
 *     within that category ("I use Greenhouse") — never the reverse.
 *   - Adding a new tool requires only adding a new ConnectorProvider entry.
 *   - Adding a new agent capability requires only referencing an existing
 *     ConnectorCategory — no new config code needed.
 *
 * Pure data + helpers — no external calls.
 */

// ---------------------------------------------------------------------------
// Credential field types
// ---------------------------------------------------------------------------

export type CredentialFieldType =
    | 'api_key'          // Single opaque secret (most REST APIs)
    | 'bearer_token'     // OAuth 2.0 access / refresh token
    | 'oauth_client'     // client_id (public) — pair with client_secret
    | 'client_secret'    // client_secret (sensitive) — pair with oauth_client
    | 'account_id'       // Non-sensitive org/tenant/account identifier
    | 'base_url'         // Custom tenant URL or API endpoint
    | 'username'         // Basic-auth username (not sensitive)
    | 'password'         // Basic-auth password (sensitive)
    | 'webhook_url'      // Outbound webhook endpoint to register
    | 'private_key'      // PEM / RSA private key (JWT signing, DocuSign, etc.)
    | 'region'           // Cloud region selector (AWS, Azure, etc.)
    | 'text';            // Free-form config value (not a credential)

export interface ConnectorCredentialField {
    fieldName: string;           // Internal key — maps to env var / vault secret
    label: string;               // Customer-facing label in the UI
    type: CredentialFieldType;
    description: string;         // One-sentence explanation of what this is and where to find it
    isSensitive: boolean;        // True → masked input, never logged
    placeholder?: string;        // Example value shown in the UI
    docsAnchor?: string;         // Fragment in the provider's docs URL (e.g. "#api-keys")
}

// ---------------------------------------------------------------------------
// Connector categories
// ---------------------------------------------------------------------------

export type ConnectorCategory =
    // ── Recruiting & HR ──────────────────────────────────────────────────────
    | 'candidate_sourcing'       // Finding candidates: LinkedIn, Apollo, Hunter, Doximity
    | 'applicant_tracking'       // ATS pipeline: Greenhouse, Lever, Workday, Ashby, iCIMS
    | 'interview_scheduling'     // Calendar booking: Calendly, Google Calendar, Outlook, Cal.com
    | 'e_signature'              // Offer / contract signing: DocuSign, Zoho Sign, Adobe Sign
    | 'background_check'         // BGC providers: Sterling, Checkr, HireRight, Accurate
    | 'talent_crm'               // Candidate relationship: Salesforce, HubSpot (talent mode)
    | 'job_board'                // Job posting: LinkedIn Jobs, Indeed, Glassdoor, ZipRecruiter
    | 'video_interviewing'       // Interview platform: Zoom, Teams, Google Meet, HireVue

    // ── Sales ────────────────────────────────────────────────────────────────
    | 'lead_enrichment'          // Contact/company data: Apollo, ZoomInfo, Clearbit, Clay
    | 'email_outreach'           // Sequencing & sending: SendGrid, Mailchimp, Gmail, Outreach
    | 'sales_crm'                // Pipeline management: Salesforce, HubSpot, Pipedrive, Close
    | 'contract_management'      // Sales contracts: PandaDoc, DocuSign, Adobe Sign
    | 'payment_processing'       // Payments: Stripe, PayPal, Square, Paddle
    | 'ecommerce_platform'       // Store platform: Shopify, WooCommerce, BigCommerce

    // ── Content & Marketing ──────────────────────────────────────────────────
    | 'cms_publishing'           // CMS: WordPress, Contentful, Ghost, Sanity, Webflow
    | 'seo_analytics'            // SEO / web analytics: Google Analytics, SEMrush, Ahrefs
    | 'social_media_management'  // Scheduling: Buffer, Hootsuite, Sprout Social, Later
    | 'design_assets'            // Asset management: Canva, Figma, Unsplash, Pexels

    // ── Development & Engineering ─────────────────────────────────────────────
    | 'version_control'          // Git hosting: GitHub, GitLab, Bitbucket, Azure DevOps
    | 'ci_cd'                    // Pipelines: GitHub Actions, GitLab CI, Jenkins, CircleCI
    | 'project_management'       // Issue tracking: Jira, Linear, Asana, GitHub Issues
    | 'observability'            // Monitoring: Datadog, New Relic, Sentry, PagerDuty

    // ── General / Cross-agent ─────────────────────────────────────────────────
    | 'messaging'                // Team comms: Slack, Microsoft Teams, Google Chat
    | 'email'                    // Business email: Google Workspace, Microsoft 365
    | 'video_conferencing'       // Meetings: Zoom, Teams, Google Meet, Webex
    | 'document_storage'         // Files: Google Drive, SharePoint, Dropbox, Box
    | 'knowledge_base'           // Internal docs: Confluence, Notion, Guru
    | 'analytics'                // General analytics / BI: Tableau, Power BI, Looker
    | 'notification'             // Alerts / webhooks: Slack, Teams, custom webhook
    | 'identity_sso'             // Auth / SSO: Okta, Azure AD, Google Workspace IAM
    | 'customer_support'         // Ticketing: Zendesk, Intercom, Freshdesk;

// ---------------------------------------------------------------------------
// Connector provider (a specific tool)
// ---------------------------------------------------------------------------

export interface ConnectorProvider {
    id: string;                        // Stable identifier (e.g. 'greenhouse')
    name: string;                      // Display name (e.g. 'Greenhouse')
    category: ConnectorCategory;
    tagline: string;                   // One-line description for the provider picker
    credentials: ConnectorCredentialField[];
    docsUrl?: string;                  // Root docs URL for this provider's API / integration
    logoHint?: string;                 // e.g. 'greenhouse' — front-end resolves to an icon
    freeTrialAvailable?: boolean;
    enterpriseOnly?: boolean;          // If true, show a note that enterprise plan is needed
}

// ---------------------------------------------------------------------------
// Category definition (metadata + providers)
// ---------------------------------------------------------------------------

export interface ConnectorCategoryDefinition {
    category: ConnectorCategory;
    label: string;                     // Customer-facing category name
    description: string;               // What this category enables the agent to do
    icon?: string;                     // Icon hint for the UI
    providers: ConnectorProvider[];
}

// ---------------------------------------------------------------------------
// Registry — all providers, organised by category
// ---------------------------------------------------------------------------

const REGISTRY: ConnectorCategoryDefinition[] = [

    // ── Candidate Sourcing ────────────────────────────────────────────────────
    {
        category: 'candidate_sourcing',
        label: 'Candidate Sourcing',
        description: 'Enables the agent to search for candidates across professional networks and talent databases.',
        icon: 'users-search',
        providers: [
            {
                id: 'apollo',
                name: 'Apollo.io',
                category: 'candidate_sourcing',
                tagline: 'Search 275M+ professional profiles with verified emails and direct dials.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Found in Apollo Settings → Integrations → API Keys.', isSensitive: true, placeholder: 'ap_live_...' },
                ],
                docsUrl: 'https://apolloio.github.io/apollo-api-docs/',
            },
            {
                id: 'linkedin',
                name: 'LinkedIn Recruiter',
                category: 'candidate_sourcing',
                tagline: 'Source passive candidates directly from LinkedIn\'s 1B+ member network.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Access Token', type: 'bearer_token', description: 'OAuth 2.0 access token from your LinkedIn Developer App.', isSensitive: true, placeholder: 'AQV...' },
                    { fieldName: 'clientId', label: 'Client ID', type: 'oauth_client', description: 'Your LinkedIn Developer Application Client ID.', isSensitive: false },
                ],
                docsUrl: 'https://developer.linkedin.com/docs/guide/v2/authentication',
                enterpriseOnly: true,
            },
            {
                id: 'hunter',
                name: 'Hunter.io',
                category: 'candidate_sourcing',
                tagline: 'Find and verify professional email addresses by domain or person.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Found in Hunter.io → Settings → API.', isSensitive: true, placeholder: 'hunter_...' },
                ],
                docsUrl: 'https://hunter.io/api-documentation',
            },
            {
                id: 'doximity',
                name: 'Doximity',
                category: 'candidate_sourcing',
                tagline: 'Source physicians, NPs, PAs, and allied health professionals (healthcare roles).',
                credentials: [
                    { fieldName: 'apiKey', label: 'Doximity API Key', type: 'api_key', description: 'From your Doximity Talent Finder account → Settings.', isSensitive: true },
                ],
                docsUrl: 'https://www.doximity.com/talent',
            },
            {
                id: 'indeed',
                name: 'Indeed',
                category: 'candidate_sourcing',
                tagline: 'Access the world\'s largest job site for active and passive candidates.',
                credentials: [
                    { fieldName: 'publisherId', label: 'Publisher ID', type: 'account_id', description: 'Your Indeed Publisher ID — available in your employer account.', isSensitive: false },
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Indeed API key for programmatic job search and candidate access.', isSensitive: true },
                ],
                docsUrl: 'https://ads.indeed.com/jobroll/xmlfeed',
            },
        ],
    },

    // ── Applicant Tracking System ─────────────────────────────────────────────
    {
        category: 'applicant_tracking',
        label: 'Applicant Tracking System (ATS)',
        description: 'Connects the agent to your ATS to read and update jobs, applications, and candidate stages.',
        icon: 'kanban',
        providers: [
            {
                id: 'greenhouse',
                name: 'Greenhouse',
                category: 'applicant_tracking',
                tagline: 'Industry-leading ATS with deep pipeline customisation and structured hiring.',
                credentials: [
                    { fieldName: 'apiKey', label: 'Harvest API Key', type: 'api_key', description: 'Generated in Greenhouse → Configure → Dev Center → API Credential Management.', isSensitive: true },
                    { fieldName: 'orgSlug', label: 'Organisation Slug', type: 'account_id', description: 'Your Greenhouse subdomain (e.g. "acme" from acme.greenhouse.io).', isSensitive: false, placeholder: 'your-company' },
                ],
                docsUrl: 'https://developers.greenhouse.io/harvest.html',
            },
            {
                id: 'lever',
                name: 'Lever',
                category: 'applicant_tracking',
                tagline: 'Modern ATS + CRM hybrid with powerful automation and analytics.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Found in Lever → Settings → Integrations → API Credentials.', isSensitive: true },
                ],
                docsUrl: 'https://hire.lever.co/developer/documentation',
            },
            {
                id: 'ashby',
                name: 'Ashby',
                category: 'applicant_tracking',
                tagline: 'All-in-one recruiting software for high-growth teams.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Generated in Ashby → Settings → Integrations → API Keys.', isSensitive: true },
                ],
                docsUrl: 'https://developers.ashbyhq.com/',
            },
            {
                id: 'workday',
                name: 'Workday',
                category: 'applicant_tracking',
                tagline: 'Enterprise HCM and recruiting — standard for large organisations.',
                credentials: [
                    { fieldName: 'tenantUrl', label: 'Tenant URL', type: 'base_url', description: 'Your Workday tenant URL (e.g. https://wd5.myworkday.com/your_company).', isSensitive: false, placeholder: 'https://wd5.myworkday.com/yourcompany' },
                    { fieldName: 'clientId', label: 'Client ID', type: 'oauth_client', description: 'OAuth 2.0 Client ID from Workday API Client setup.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'Client Secret', type: 'client_secret', description: 'OAuth 2.0 Client Secret.', isSensitive: true },
                ],
                docsUrl: 'https://community.workday.com/sites/default/files/file-hosting/restapi/',
                enterpriseOnly: true,
            },
            {
                id: 'icims',
                name: 'iCIMS',
                category: 'applicant_tracking',
                tagline: 'Enterprise talent cloud for high-volume and enterprise hiring.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'iCIMS REST API Key from your platform administrator.', isSensitive: true },
                    { fieldName: 'customerId', label: 'Customer ID', type: 'account_id', description: 'Your iCIMS numeric Customer ID.', isSensitive: false },
                ],
                docsUrl: 'https://developer.icims.com/',
                enterpriseOnly: true,
            },
            {
                id: 'bullhorn',
                name: 'Bullhorn',
                category: 'applicant_tracking',
                tagline: 'ATS + CRM built for staffing agencies and recruiters.',
                credentials: [
                    { fieldName: 'clientId', label: 'Client ID', type: 'oauth_client', description: 'OAuth Client ID from Bullhorn Developer portal.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'Client Secret', type: 'client_secret', description: 'OAuth Client Secret.', isSensitive: true },
                    { fieldName: 'username', label: 'API Username', type: 'username', description: 'Your Bullhorn API username.', isSensitive: false },
                ],
                docsUrl: 'https://bullhorn.github.io/rest-api-docs/',
            },
        ],
    },

    // ── Interview Scheduling ──────────────────────────────────────────────────
    {
        category: 'interview_scheduling',
        label: 'Interview Scheduling',
        description: 'Automates scheduling by creating booking links and calendar invites for candidates and interviewers.',
        icon: 'calendar-check',
        providers: [
            {
                id: 'calendly',
                name: 'Calendly',
                category: 'interview_scheduling',
                tagline: 'Send self-serve scheduling links so candidates book their own slots.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Personal Access Token', type: 'bearer_token', description: 'Generated in Calendly → Integrations → API & Webhooks.', isSensitive: true },
                ],
                docsUrl: 'https://developer.calendly.com/',
            },
            {
                id: 'google_calendar',
                name: 'Google Calendar',
                category: 'interview_scheduling',
                tagline: 'Create Google Meet invites and manage interviewer calendars via Google Workspace.',
                credentials: [
                    { fieldName: 'clientId', label: 'OAuth Client ID', type: 'oauth_client', description: 'From Google Cloud Console → APIs & Services → Credentials.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'OAuth Client Secret', type: 'client_secret', description: 'Paired secret for the OAuth client.', isSensitive: true },
                    { fieldName: 'refreshToken', label: 'Refresh Token', type: 'bearer_token', description: 'Long-lived OAuth refresh token.', isSensitive: true },
                ],
                docsUrl: 'https://developers.google.com/calendar/api/guides/auth',
            },
            {
                id: 'outlook_calendar',
                name: 'Outlook / Microsoft 365',
                category: 'interview_scheduling',
                tagline: 'Schedule via Microsoft 365 calendar with Teams meeting links.',
                credentials: [
                    { fieldName: 'tenantId', label: 'Azure Tenant ID', type: 'account_id', description: 'Your Microsoft Azure AD Tenant ID (GUID format).', isSensitive: false },
                    { fieldName: 'clientId', label: 'App Client ID', type: 'oauth_client', description: 'Application (client) ID from your Azure App Registration.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'App Client Secret', type: 'client_secret', description: 'Client secret from Azure App Registration → Certificates & Secrets.', isSensitive: true },
                ],
                docsUrl: 'https://learn.microsoft.com/en-us/graph/auth/',
            },
            {
                id: 'cal_com',
                name: 'Cal.com',
                category: 'interview_scheduling',
                tagline: 'Open-source scheduling infrastructure — self-host or use cloud.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Generated in Cal.com → Settings → Developer → API Keys.', isSensitive: true },
                ],
                docsUrl: 'https://developer.cal.com/api',
                freeTrialAvailable: true,
            },
        ],
    },

    // ── E-Signature ───────────────────────────────────────────────────────────
    {
        category: 'e_signature',
        label: 'Electronic Signature',
        description: 'Sends offer letters and employment contracts for legally binding e-signature.',
        icon: 'pen-line',
        providers: [
            {
                id: 'docusign',
                name: 'DocuSign',
                category: 'e_signature',
                tagline: 'Industry-standard e-signature with full audit trail and legal compliance.',
                credentials: [
                    { fieldName: 'integrationKey', label: 'Integration Key', type: 'oauth_client', description: 'OAuth 2.0 integration key from DocuSign Developer Console.', isSensitive: false },
                    { fieldName: 'accountId', label: 'Account ID', type: 'account_id', description: 'Your DocuSign Account ID (GUID format).', isSensitive: false },
                    { fieldName: 'privateKey', label: 'RSA Private Key', type: 'private_key', description: 'RSA private key for JWT authentication.', isSensitive: true },
                ],
                docsUrl: 'https://developers.docusign.com/',
            },
            {
                id: 'zoho_sign',
                name: 'Zoho Sign',
                category: 'e_signature',
                tagline: 'Affordable e-signature solution with strong API support.',
                credentials: [
                    { fieldName: 'clientId', label: 'Client ID', type: 'oauth_client', description: 'From Zoho API Console → Client Details.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'Client Secret', type: 'client_secret', description: 'Paired client secret.', isSensitive: true },
                    { fieldName: 'refreshToken', label: 'Refresh Token', type: 'bearer_token', description: 'Long-lived OAuth refresh token.', isSensitive: true },
                ],
                docsUrl: 'https://www.zoho.com/sign/api/',
            },
            {
                id: 'adobe_sign',
                name: 'Adobe Acrobat Sign',
                category: 'e_signature',
                tagline: 'Enterprise-grade signing trusted by Fortune 500 companies.',
                credentials: [
                    { fieldName: 'clientId', label: 'Application ID', type: 'oauth_client', description: 'From Adobe Developer Console → your app → OAuth.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'Client Secret', type: 'client_secret', description: 'OAuth client secret.', isSensitive: true },
                    { fieldName: 'accessToken', label: 'Access Token', type: 'bearer_token', description: 'OAuth 2.0 access token (auto-refreshed).', isSensitive: true },
                ],
                docsUrl: 'https://opensource.adobe.com/acrobat-sign/developer_guide/',
            },
            {
                id: 'hellosign',
                name: 'Dropbox Sign (HelloSign)',
                category: 'e_signature',
                tagline: 'Simple, developer-friendly e-signature via Dropbox Sign API.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Found in Dropbox Sign → Account → API.', isSensitive: true },
                ],
                docsUrl: 'https://developers.hellosign.com/',
            },
        ],
    },

    // ── Background Check ──────────────────────────────────────────────────────
    {
        category: 'background_check',
        label: 'Background Check',
        description: 'Initiates FCRA-compliant background checks. Requires signed candidate authorisation before use.',
        icon: 'shield-check',
        providers: [
            {
                id: 'checkr',
                name: 'Checkr',
                category: 'background_check',
                tagline: 'Modern, API-first background check platform with fast turnaround.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Found in Checkr Dashboard → Developer → API Keys.', isSensitive: true },
                ],
                docsUrl: 'https://docs.checkr.com/',
                freeTrialAvailable: true,
            },
            {
                id: 'sterling',
                name: 'Sterling',
                category: 'background_check',
                tagline: 'Comprehensive background screening trusted by enterprise clients globally.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'API key from Sterling developer portal.', isSensitive: true },
                    { fieldName: 'accountId', label: 'Account ID', type: 'account_id', description: 'Your Sterling account identifier.', isSensitive: false },
                ],
                docsUrl: 'https://developer.sterlingcheck.com/',
            },
            {
                id: 'hireright',
                name: 'HireRight',
                category: 'background_check',
                tagline: 'Global background screening with coverage in 200+ countries.',
                credentials: [
                    { fieldName: 'username', label: 'Integration Username', type: 'username', description: 'HireRight integration username from your account admin.', isSensitive: false },
                    { fieldName: 'password', label: 'Integration Password', type: 'password', description: 'Integration password.', isSensitive: true },
                    { fieldName: 'clientId', label: 'Client ID', type: 'account_id', description: 'Your HireRight Client ID.', isSensitive: false },
                ],
                docsUrl: 'https://integrations.hireright.com/',
                enterpriseOnly: true,
            },
        ],
    },

    // ── Talent CRM ────────────────────────────────────────────────────────────
    {
        category: 'talent_crm',
        label: 'Talent CRM',
        description: 'Stores candidate relationships, nurture sequences, and long-term talent pool data.',
        icon: 'users-round',
        providers: [
            {
                id: 'salesforce',
                name: 'Salesforce',
                category: 'talent_crm',
                tagline: 'World\'s leading CRM — use for candidate relationship management.',
                credentials: [
                    { fieldName: 'clientId', label: 'Consumer Key', type: 'oauth_client', description: 'From Salesforce → App Manager → Connected App → Consumer Key.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'Consumer Secret', type: 'client_secret', description: 'Paired consumer secret.', isSensitive: true },
                    { fieldName: 'instanceUrl', label: 'Instance URL', type: 'base_url', description: 'Your Salesforce instance URL (e.g. https://yourorg.salesforce.com).', isSensitive: false },
                    { fieldName: 'refreshToken', label: 'Refresh Token', type: 'bearer_token', description: 'OAuth refresh token from connected app auth flow.', isSensitive: true },
                ],
                docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/',
                enterpriseOnly: true,
            },
            {
                id: 'hubspot',
                name: 'HubSpot',
                category: 'talent_crm',
                tagline: 'CRM with contact management, email sequences, and deal tracking.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Private App Access Token', type: 'bearer_token', description: 'From HubSpot → Settings → Private Apps → Access Token.', isSensitive: true, placeholder: 'pat-...' },
                ],
                docsUrl: 'https://developers.hubspot.com/docs/api/private-apps',
                freeTrialAvailable: true,
            },
        ],
    },

    // ── Job Board Posting ─────────────────────────────────────────────────────
    {
        category: 'job_board',
        label: 'Job Board Posting',
        description: 'Publishes job openings to external job boards to attract active candidates.',
        icon: 'megaphone',
        providers: [
            {
                id: 'linkedin_jobs',
                name: 'LinkedIn Jobs',
                category: 'job_board',
                tagline: 'Reach the largest professional network with sponsored and free postings.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Access Token', type: 'bearer_token', description: 'OAuth 2.0 token with LinkedIn Job Posting API scopes.', isSensitive: true },
                    { fieldName: 'organizationId', label: 'Organization URN', type: 'account_id', description: 'LinkedIn organization URN (e.g. urn:li:organization:1234567).', isSensitive: false },
                ],
                docsUrl: 'https://developer.linkedin.com/docs/guide/v2/jobs',
            },
            {
                id: 'indeed_employer',
                name: 'Indeed Employer',
                category: 'job_board',
                tagline: 'Post to the world\'s #1 job site — free and sponsored options.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Access Token', type: 'bearer_token', description: 'OAuth 2.0 token from your Indeed Employer account.', isSensitive: true },
                    { fieldName: 'employerAccountId', label: 'Employer Account ID', type: 'account_id', description: 'Your Indeed Employer account identifier.', isSensitive: false },
                ],
                docsUrl: 'https://ads.indeed.com/jobroll/',
            },
            {
                id: 'glassdoor',
                name: 'Glassdoor',
                category: 'job_board',
                tagline: 'Post to a platform where candidates research company culture and pay.',
                credentials: [
                    { fieldName: 'partnerId', label: 'Partner ID', type: 'account_id', description: 'Your Glassdoor partner ID for the Job Feeds API.', isSensitive: false },
                    { fieldName: 'partnerKey', label: 'Partner Key', type: 'api_key', description: 'Partner key for authenticated API access.', isSensitive: true },
                ],
                docsUrl: 'https://www.glassdoor.com/developer/index.htm',
            },
            {
                id: 'ziprecruiter',
                name: 'ZipRecruiter',
                category: 'job_board',
                tagline: 'AI-powered job marketplace with one-click apply.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'From your ZipRecruiter employer account → API Access.', isSensitive: true },
                ],
                docsUrl: 'https://www.ziprecruiter.com/zapi/docs',
            },
        ],
    },

    // ── Messaging ─────────────────────────────────────────────────────────────
    {
        category: 'messaging',
        label: 'Team Messaging',
        description: 'Posts hiring updates, approval requests, and interview reminders to your team channels.',
        icon: 'message-square',
        providers: [
            {
                id: 'slack',
                name: 'Slack',
                category: 'messaging',
                tagline: 'Send notifications and approvals directly into your Slack workspace.',
                credentials: [
                    { fieldName: 'botToken', label: 'Bot Token', type: 'bearer_token', description: 'xoxb- prefixed Bot User OAuth Token from your Slack App settings.', isSensitive: true, placeholder: 'xoxb-...' },
                ],
                docsUrl: 'https://api.slack.com/authentication/token-types#bot',
            },
            {
                id: 'microsoft_teams',
                name: 'Microsoft Teams',
                category: 'messaging',
                tagline: 'Post cards and notifications to Teams channels and chat.',
                credentials: [
                    { fieldName: 'webhookUrl', label: 'Incoming Webhook URL', type: 'webhook_url', description: 'Incoming webhook URL from Teams → channel connector.', isSensitive: true },
                ],
                docsUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook',
            },
        ],
    },

    // ── Email ─────────────────────────────────────────────────────────────────
    {
        category: 'email',
        label: 'Business Email',
        description: 'Sends candidate outreach, interview invites, and offer letters via your business email account.',
        icon: 'mail',
        providers: [
            {
                id: 'google_workspace',
                name: 'Google Workspace (Gmail)',
                category: 'email',
                tagline: 'Send authenticated emails from your Gmail / Google Workspace address.',
                credentials: [
                    { fieldName: 'clientId', label: 'OAuth Client ID', type: 'oauth_client', description: 'From Google Cloud Console → APIs & Services → Credentials.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'OAuth Client Secret', type: 'client_secret', description: 'Paired secret for the OAuth client.', isSensitive: true },
                    { fieldName: 'refreshToken', label: 'Refresh Token', type: 'bearer_token', description: 'Long-lived OAuth refresh token with Gmail send scope.', isSensitive: true },
                ],
                docsUrl: 'https://developers.google.com/gmail/api/auth/scopes',
            },
            {
                id: 'microsoft_365',
                name: 'Microsoft 365 (Outlook)',
                category: 'email',
                tagline: 'Send authenticated emails from your Outlook / Microsoft 365 address.',
                credentials: [
                    { fieldName: 'tenantId', label: 'Azure Tenant ID', type: 'account_id', description: 'Your Microsoft Azure AD Tenant ID (GUID format).', isSensitive: false },
                    { fieldName: 'clientId', label: 'App Client ID', type: 'oauth_client', description: 'Application ID from your Azure App Registration.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'App Client Secret', type: 'client_secret', description: 'Client secret from Azure App Registration.', isSensitive: true },
                ],
                docsUrl: 'https://learn.microsoft.com/en-us/graph/api/user-sendmail',
            },
        ],
    },

    // ── Lead Enrichment (Sales Agent) ─────────────────────────────────────────
    {
        category: 'lead_enrichment',
        label: 'Lead Enrichment',
        description: 'Enriches prospect profiles with contact data, firmographics, and intent signals.',
        icon: 'database-search',
        providers: [
            {
                id: 'apollo_sales',
                name: 'Apollo.io',
                category: 'lead_enrichment',
                tagline: 'Contact and company enrichment with 275M+ verified contacts.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Found in Apollo Settings → Integrations → API Keys.', isSensitive: true, placeholder: 'ap_live_...' },
                ],
                docsUrl: 'https://apolloio.github.io/apollo-api-docs/',
            },
            {
                id: 'zoominfo',
                name: 'ZoomInfo',
                category: 'lead_enrichment',
                tagline: 'B2B intelligence platform with deep firmographic and contact data.',
                credentials: [
                    { fieldName: 'clientId', label: 'Client ID', type: 'oauth_client', description: 'From ZoomInfo Developer Portal → App Settings.', isSensitive: false },
                    { fieldName: 'privateKey', label: 'Private Key', type: 'private_key', description: 'RSA private key for JWT authentication.', isSensitive: true },
                ],
                docsUrl: 'https://api-university.zoominfo.com/',
                enterpriseOnly: true,
            },
            {
                id: 'clearbit',
                name: 'Clearbit',
                category: 'lead_enrichment',
                tagline: 'Real-time company and person enrichment via API.',
                credentials: [
                    { fieldName: 'apiKey', label: 'Secret Key', type: 'api_key', description: 'From Clearbit → Dashboard → API Keys.', isSensitive: true, placeholder: 'sk_...' },
                ],
                docsUrl: 'https://dashboard.clearbit.com/docs',
            },
        ],
    },

    // ── Email Outreach (Sales/Marketing Agent) ────────────────────────────────
    {
        category: 'email_outreach',
        label: 'Email Outreach',
        description: 'Sends personalised email sequences to prospects and tracks opens, clicks, and replies.',
        icon: 'send',
        providers: [
            {
                id: 'sendgrid',
                name: 'SendGrid',
                category: 'email_outreach',
                tagline: 'Reliable email delivery at scale with detailed analytics.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'From SendGrid → Settings → API Keys.', isSensitive: true, placeholder: 'SG...' },
                ],
                docsUrl: 'https://docs.sendgrid.com/',
            },
            {
                id: 'mailchimp',
                name: 'Mailchimp',
                category: 'email_outreach',
                tagline: 'Email marketing and automation platform with audience management.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'From Mailchimp → Account → Extras → API Keys.', isSensitive: true },
                    { fieldName: 'serverPrefix', label: 'Server Prefix', type: 'account_id', description: 'The server prefix from your API key (e.g. "us6").', isSensitive: false, placeholder: 'us6' },
                ],
                docsUrl: 'https://mailchimp.com/developer/marketing/api/',
            },
            {
                id: 'outreach_io',
                name: 'Outreach.io',
                category: 'email_outreach',
                tagline: 'Sales engagement platform with multi-channel sequences and analytics.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Access Token', type: 'bearer_token', description: 'OAuth 2.0 access token from Outreach → Settings → API Keys.', isSensitive: true },
                ],
                docsUrl: 'https://developers.outreach.io/',
            },
        ],
    },

    // ── Sales CRM ─────────────────────────────────────────────────────────────
    {
        category: 'sales_crm',
        label: 'Sales CRM',
        description: 'Manages leads, deals, and customer relationships for the sales pipeline.',
        icon: 'briefcase',
        providers: [
            {
                id: 'salesforce_sales',
                name: 'Salesforce Sales Cloud',
                category: 'sales_crm',
                tagline: 'Industry-leading CRM for enterprise sales pipeline management.',
                credentials: [
                    { fieldName: 'clientId', label: 'Consumer Key', type: 'oauth_client', description: 'From Salesforce → App Manager → Connected App.', isSensitive: false },
                    { fieldName: 'clientSecret', label: 'Consumer Secret', type: 'client_secret', description: 'Paired consumer secret.', isSensitive: true },
                    { fieldName: 'instanceUrl', label: 'Instance URL', type: 'base_url', description: 'Your Salesforce instance URL.', isSensitive: false, placeholder: 'https://yourorg.salesforce.com' },
                    { fieldName: 'refreshToken', label: 'Refresh Token', type: 'bearer_token', description: 'OAuth refresh token.', isSensitive: true },
                ],
                docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/',
            },
            {
                id: 'hubspot_sales',
                name: 'HubSpot CRM',
                category: 'sales_crm',
                tagline: 'Free CRM with powerful sales, marketing, and service hubs.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Private App Access Token', type: 'bearer_token', description: 'From HubSpot → Settings → Private Apps.', isSensitive: true, placeholder: 'pat-...' },
                ],
                docsUrl: 'https://developers.hubspot.com/',
                freeTrialAvailable: true,
            },
            {
                id: 'pipedrive',
                name: 'Pipedrive',
                category: 'sales_crm',
                tagline: 'Visual pipeline CRM built for sales teams.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Token', type: 'api_key', description: 'From Pipedrive → Settings → Personal Preferences → API.', isSensitive: true },
                ],
                docsUrl: 'https://developers.pipedrive.com/docs/api/v1',
                freeTrialAvailable: true,
            },
        ],
    },

    // ── Payment Processing (Sales Agent) ──────────────────────────────────────
    {
        category: 'payment_processing',
        label: 'Payment Processing',
        description: 'Processes payments and manages invoices and subscriptions.',
        icon: 'credit-card',
        providers: [
            {
                id: 'stripe',
                name: 'Stripe',
                category: 'payment_processing',
                tagline: 'The global standard for payments, billing, and financial infrastructure.',
                credentials: [
                    { fieldName: 'secretKey', label: 'Secret Key', type: 'api_key', description: 'From Stripe Dashboard → Developers → API Keys → Secret key.', isSensitive: true, placeholder: 'sk_live_...' },
                ],
                docsUrl: 'https://stripe.com/docs/api',
            },
            {
                id: 'paddle',
                name: 'Paddle',
                category: 'payment_processing',
                tagline: 'Merchant of Record — Paddle handles tax, compliance, and payments.',
                credentials: [
                    { fieldName: 'vendorId', label: 'Vendor ID', type: 'account_id', description: 'Your Paddle Vendor ID from the Dashboard.', isSensitive: false },
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'Paddle API key from Developer Tools → Authentication.', isSensitive: true },
                ],
                docsUrl: 'https://developer.paddle.com/',
            },
        ],
    },

    // ── CMS Publishing (Content Agent) ────────────────────────────────────────
    {
        category: 'cms_publishing',
        label: 'Content Management System',
        description: 'Publishes and manages content directly to your CMS.',
        icon: 'file-text',
        providers: [
            {
                id: 'wordpress',
                name: 'WordPress',
                category: 'cms_publishing',
                tagline: 'Publish posts and pages via WordPress REST API.',
                credentials: [
                    { fieldName: 'siteUrl', label: 'Site URL', type: 'base_url', description: 'Your WordPress site URL (e.g. https://yoursite.com).', isSensitive: false },
                    { fieldName: 'username', label: 'Application Username', type: 'username', description: 'WordPress username with editor/admin role.', isSensitive: false },
                    { fieldName: 'appPassword', label: 'Application Password', type: 'password', description: 'WordPress Application Password (Users → Profile → Application Passwords).', isSensitive: true },
                ],
                docsUrl: 'https://developer.wordpress.org/rest-api/',
            },
            {
                id: 'contentful',
                name: 'Contentful',
                category: 'cms_publishing',
                tagline: 'Headless CMS with powerful structured content APIs.',
                credentials: [
                    { fieldName: 'spaceId', label: 'Space ID', type: 'account_id', description: 'Your Contentful Space ID from Settings → General Settings.', isSensitive: false },
                    { fieldName: 'accessToken', label: 'Content Management API Token', type: 'bearer_token', description: 'CMA token from Settings → API Keys → Content Management Tokens.', isSensitive: true },
                    { fieldName: 'environmentId', label: 'Environment ID', type: 'account_id', description: 'Usually "master" unless using a custom environment.', isSensitive: false, placeholder: 'master' },
                ],
                docsUrl: 'https://www.contentful.com/developers/docs/references/content-management-api/',
            },
            {
                id: 'ghost',
                name: 'Ghost',
                category: 'cms_publishing',
                tagline: 'Modern open-source publishing platform with clean APIs.',
                credentials: [
                    { fieldName: 'apiUrl', label: 'Ghost Admin URL', type: 'base_url', description: 'Your Ghost site URL (e.g. https://yoursite.ghost.io).', isSensitive: false },
                    { fieldName: 'adminApiKey', label: 'Admin API Key', type: 'api_key', description: 'From Ghost Admin → Settings → Integrations → Add Custom Integration.', isSensitive: true },
                ],
                docsUrl: 'https://ghost.org/docs/admin-api/',
            },
            {
                id: 'webflow',
                name: 'Webflow',
                category: 'cms_publishing',
                tagline: 'Manage Webflow CMS collections and publish content programmatically.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Token', type: 'api_key', description: 'From Webflow → Account Settings → API Access → Generate API Token.', isSensitive: true },
                    { fieldName: 'siteId', label: 'Site ID', type: 'account_id', description: 'Your Webflow Site ID from the site settings.', isSensitive: false },
                ],
                docsUrl: 'https://developers.webflow.com/',
            },
        ],
    },

    // ── Version Control (Developer Agent) ─────────────────────────────────────
    {
        category: 'version_control',
        label: 'Version Control',
        description: 'Reads and writes code, manages pull requests, and tracks issues.',
        icon: 'git-branch',
        providers: [
            {
                id: 'github',
                name: 'GitHub',
                category: 'version_control',
                tagline: 'World\'s largest code host — repositories, PRs, and GitHub Actions.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Personal Access Token', type: 'bearer_token', description: 'Classic PAT or fine-grained token from GitHub → Settings → Developer Settings.', isSensitive: true, placeholder: 'ghp_...' },
                ],
                docsUrl: 'https://docs.github.com/en/rest',
                freeTrialAvailable: true,
            },
            {
                id: 'gitlab',
                name: 'GitLab',
                category: 'version_control',
                tagline: 'Complete DevSecOps platform — code, CI/CD, security, and more.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Personal Access Token', type: 'bearer_token', description: 'Created in GitLab → User Settings → Access Tokens.', isSensitive: true, placeholder: 'glpat-...' },
                    { fieldName: 'baseUrl', label: 'GitLab URL', type: 'base_url', description: 'Your GitLab instance URL (default: https://gitlab.com).', isSensitive: false, placeholder: 'https://gitlab.com' },
                ],
                docsUrl: 'https://docs.gitlab.com/ee/api/',
                freeTrialAvailable: true,
            },
        ],
    },

    // ── Project Management ─────────────────────────────────────────────────────
    {
        category: 'project_management',
        label: 'Project Management',
        description: 'Creates and updates tasks, tracks progress, and syncs with your project board.',
        icon: 'layout-kanban',
        providers: [
            {
                id: 'linear',
                name: 'Linear',
                category: 'project_management',
                tagline: 'Modern issue tracker built for speed and engineering teams.',
                credentials: [
                    { fieldName: 'apiKey', label: 'API Key', type: 'api_key', description: 'From Linear → Settings → API → Personal API Keys.', isSensitive: true },
                ],
                docsUrl: 'https://developers.linear.app/docs/',
                freeTrialAvailable: true,
            },
            {
                id: 'jira',
                name: 'Jira (Atlassian)',
                category: 'project_management',
                tagline: 'Flexible issue and project tracking for teams of all sizes.',
                credentials: [
                    { fieldName: 'email', label: 'Account Email', type: 'username', description: 'The email address for your Atlassian account.', isSensitive: false },
                    { fieldName: 'apiToken', label: 'API Token', type: 'api_key', description: 'From id.atlassian.com → Security → API Tokens.', isSensitive: true },
                    { fieldName: 'domain', label: 'Jira Domain', type: 'base_url', description: 'Your Jira Cloud domain (e.g. yourcompany.atlassian.net).', isSensitive: false, placeholder: 'yourcompany.atlassian.net' },
                ],
                docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/',
            },
            {
                id: 'asana',
                name: 'Asana',
                category: 'project_management',
                tagline: 'Work management platform for teams with tasks, projects, and timelines.',
                credentials: [
                    { fieldName: 'accessToken', label: 'Personal Access Token', type: 'bearer_token', description: 'From Asana → My Settings → Apps → Manage developer apps → New token.', isSensitive: true },
                ],
                docsUrl: 'https://developers.asana.com/docs',
                freeTrialAvailable: true,
            },
        ],
    },

    // ── Notification / Webhook ────────────────────────────────────────────────
    {
        category: 'notification',
        label: 'Notifications & Webhooks',
        description: 'Sends alerts for important events — new candidate, offer accepted, approval needed.',
        icon: 'bell',
        providers: [
            {
                id: 'slack_notify',
                name: 'Slack',
                category: 'notification',
                tagline: 'Post real-time notifications to Slack channels.',
                credentials: [
                    { fieldName: 'webhookUrl', label: 'Incoming Webhook URL', type: 'webhook_url', description: 'From Slack → Apps → Incoming Webhooks → Add New Webhook.', isSensitive: true, placeholder: 'https://hooks.slack.com/services/...' },
                ],
                docsUrl: 'https://api.slack.com/messaging/webhooks',
            },
            {
                id: 'webhook',
                name: 'Custom Webhook',
                category: 'notification',
                tagline: 'Send structured JSON payloads to any endpoint your system exposes.',
                credentials: [
                    { fieldName: 'url', label: 'Webhook URL', type: 'webhook_url', description: 'The HTTPS endpoint that will receive POST requests.', isSensitive: false, placeholder: 'https://api.yourapp.com/webhooks/agent' },
                    { fieldName: 'secret', label: 'Signing Secret (optional)', type: 'api_key', description: 'Used to sign the request payload with HMAC-SHA256 for verification.', isSensitive: true },
                ],
            },
        ],
    },

];

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Look up a full category definition including all its providers. */
export function getCategory(category: ConnectorCategory): ConnectorCategoryDefinition | undefined {
    return REGISTRY.find(c => c.category === category);
}

/** Look up a specific provider within a category. */
export function getProvider(category: ConnectorCategory, providerId: string): ConnectorProvider | undefined {
    return getCategory(category)?.providers.find(p => p.id === providerId);
}

/** List all categories (for a category-picker UI). */
export function listCategories(): ConnectorCategoryDefinition[] {
    return REGISTRY;
}

/** List categories that apply to a given set of category keys. */
export function filterCategories(categories: ConnectorCategory[]): ConnectorCategoryDefinition[] {
    return REGISTRY.filter(c => categories.includes(c.category));
}

/** List all providers across all categories (flat). */
export function listAllProviders(): ConnectorProvider[] {
    return REGISTRY.flatMap(c => c.providers);
}

/** Find which category a provider belongs to (by provider id). */
export function findProviderById(providerId: string): ConnectorProvider | undefined {
    return listAllProviders().find(p => p.id === providerId);
}

/**
 * Build a setup payload suitable for the dashboard UI.
 * Returns the category metadata + selected provider's credential fields.
 * If providerId is omitted, returns all providers for the category (picker mode).
 */
export function buildConnectorSetupPayload(
    category: ConnectorCategory,
    providerId?: string,
): {
    category: ConnectorCategoryDefinition;
    selectedProvider?: ConnectorProvider;
    allProviders: ConnectorProvider[];
} | null {
    const cat = getCategory(category);
    if (!cat) return null;
    return {
        category: cat,
        selectedProvider: providerId ? getProvider(category, providerId) : undefined,
        allProviders: cat.providers,
    };
}
